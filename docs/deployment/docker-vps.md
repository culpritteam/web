---
status: current
source_of_truth: false
last_updated: 2026-08-11
related_modules: [shared]
related_decisions: []
---

# Docker / VPS deployment

The deployment target: a self-hosted, low-resource VPS running one prebuilt Docker container,
fixed-cost rather than usage-based. See [deployment.md](deployment.md) for the platform-agnostic
parts (build command, migrations, connection pooling) this pipeline relies on.

## Architecture

```
Developer push (main)
        │
        ▼
GitHub Actions  ── lint/typecheck/test → prisma migrate deploy → docker build → push
        │
        ▼
GHCR (ghcr.io/wyco68/culpritweb)
        │
        ▼
VPS: docker pull + docker compose up -d      (no build, no npm install, no compilation)
```

The VPS only ever runs `docker pull` and `docker compose up`. All compilation — `prisma generate`,
`next build`, TypeScript — happens in CI, on a machine that isn't resource-constrained.

**The VPS is shared with other apps.** A single Caddy container (`~/server/docker-compose.yml`)
owns ports 80/443 and reverse-proxies by hostname to each app's container over one Docker network
(`server_default`, external). `culprit-web` does not publish a host port — Caddy reaches it at
`culprit-web:3000` on that shared network, per the `culprit.wyco-dev.com { reverse_proxy
culprit-web:3000 }` block appended to `~/server/caddy/Caddyfile`. Each app lives in its own
`~/server/apps/<app>/` directory; this app's is `~/server/apps/culprit-web/`.

## What runs where

| Operation | Runs in |
|---|---|
| `npm ci`, lint, typecheck, unit tests | GitHub Actions (`test` job) |
| `prisma migrate deploy` | GitHub Actions (`migrate` job), against `DIRECT_URL` |
| `prisma generate`, `next build`, Docker image build | GitHub Actions (`build-and-push` job), inside `docker build` |
| `docker pull`, `docker compose up -d`, healthcheck | VPS (`scripts/deploy.sh`) |

Migrations run in CI, not on the VPS and not inside the image's entrypoint — the production image
is intentionally trimmed to Next's standalone output and doesn't carry the Prisma CLI or
`prisma/migrations`. This matches the existing rule in [deployment.md](deployment.md): `predev`
only runs before `next dev`, so CI/CD has always needed to run `migrate deploy` as its own step.

## Initial VPS setup

Requires only Docker — no Node.js, npm, or build tools. One-time, by hand; CI never touches these
steps on later deploys.

```bash
# Docker Engine + Compose plugin (Debian/Ubuntu) — already present on the shared box
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"   # log out/in for this to take effect

# Deploy directory, alongside the box's other apps
mkdir -p ~/server/apps/culprit-web && cd ~/server/apps/culprit-web

# Pull just the two files this VPS actually needs — not the repo
curl -fsSLO https://raw.githubusercontent.com/wyco68/culpritweb/main/docker-compose.production.yml
curl -fsSLO https://raw.githubusercontent.com/wyco68/culpritweb/main/scripts/deploy.sh
chmod +x deploy.sh

# Runtime config — copy .env.example from the repo, fill in real values, keep off git.
# Skip this if you are wiring the box to Doppler instead (see below) — deploy.sh will write
# .env.production itself on the first deploy.
cp .env.example .env.production
"$EDITOR" .env.production

# Add the site block to the shared Caddyfile and reload (zero downtime for other apps):
cat >> ~/server/caddy/Caddyfile <<'EOF'

culprit.wyco-dev.com {
	reverse_proxy culprit-web:3000
}
EOF
docker exec caddy caddy validate --config /etc/caddy/Caddyfile   # check before reloading
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

GHCR packages default to private — registry auth is required every deploy, not optional:

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u <github-username> --password-stdin
```

The CI deploy job does this automatically with its own short-lived `GITHUB_TOKEN`; only needed by
hand here for a manual/local deploy.

## Runtime config from Doppler

Optional, per box, and off unless you turn it on. With it, the VPS pulls its own `.env.production`
from Doppler on every deploy, so rotating a staging secret is one edit in Doppler rather than an
SSH session and a hand-edited file. See
[ADR-013](../decisions/ADR-013-doppler-secrets-across-environments.md) for why the box holds the
token instead of CI sending it one.

```bash
# 1. In Doppler (once): populate the `stg` config with the same values .env.production holds, then
#    mint a read-only service token for it — Dashboard → culprit → stg → Access, or:
doppler configs tokens create vps --project culprit --config stg --plain   # run this locally

# 2. On the VPS, in ~/server/apps/culprit-web:
curl -Ls https://cli.doppler.com/install.sh | sudo sh
printf '%s
' "dp.st.stg.xxxxxxxx" > .doppler-token
chmod 600 .doppler-token
```

That is the whole setup. On the next `./deploy.sh <tag>`:

- `.env.production` is regenerated from the token's config (`--format docker`, the `KEY=value`
  shape compose's `env_file:` expects) and written `chmod 600`.
- `.doppler-fallback.json` keeps an encrypted copy of the last successful fetch, so a Doppler
  outage deploys with the previous values instead of failing.
- If the fetch fails and there is no fallback, the existing `.env.production` is used and the
  deploy logs a warning. It only refuses outright when there is no config at all to deploy with.

Remove `.doppler-token` to go back to the hand-managed file — nothing else changes.

**Production (Vercel) is not wired to Doppler.** Export from the `prd` config and upload to the
Vercel project by hand:

```bash
doppler secrets download --no-file --format env --project culprit --config prd > vercel.env
# Vercel → Project → Settings → Environment Variables → Import .env, then delete vercel.env
```

## Required CI configuration

Application config comes from Doppler (`culprit` → `stg`), fetched per job by
[`dopplerhq/secrets-fetch-action@v2.0.0`](https://github.com/DopplerHQ/secrets-fetch-action) with a
read-only service token. GitHub stores only what CI needs to reach the box
(**Settings → Secrets and variables → Actions**):

| Name | Kind | Notes |
|---|---|---|
| `DOPPLER_TOKEN` | Secret | Read-only Doppler service token for `culprit/stg`. The only application credential in GitHub — every value below is fetched with it |
| `DEPLOY_SSH_KEY` | Secret | Private key for the VPS `deploy` user. Stays here on purpose: it is how the pipeline reaches the box, not config the app reads, and a multi-line private key is the value log masking handles least well |
| `DEPLOY_HOST` / `DEPLOY_USER` | Variable | SSH target — not secret, but scoped as repo config rather than hardcoded in the workflow |

Fetched from Doppler at run time:

| Name | Used by | Notes |
|---|---|---|
| `DIRECT_URL` | `db:generate`, `db:deploy`, image build | Unpooled — `migrate deploy` cannot run through pgbouncer |
| `DATABASE_URL` | image build | Same pooled Supabase URL the container uses at runtime |
| `BETTER_AUTH_SECRET` | image build | Same value used at runtime |
| `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_CALENDLY_URL`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | image build | Public by design — inlined into the client bundle |
| `R2_PUBLIC_URL` | image build | Public (the R2 bucket's public dev URL). Not a `NEXT_PUBLIC_*` var, but still required at build time: `next.config.ts`'s `images.remotePatterns` is computed from it and baked into `.next/required-server-files.json` — the standalone runner never re-reads `next.config.ts`, so setting this only in `.env.production` (runtime) has no effect on image optimization |

`DATABASE_URL`/`DIRECT_URL`/`BETTER_AUTH_SECRET` are needed at *build* time only because
`next build` traces every route handler, including ones that import the Zod-validated
`env.server.ts` module — no database connection is actually opened during the build. They're
passed to `docker build` as BuildKit secrets (`--mount=type=secret`), not `ARG`/`ENV`, so they
never land in an image layer, `docker history`, or a build log.

The action masks every fetched value in the log, including the public ones — that is the action's
blanket behaviour, not a claim that `NEXT_PUBLIC_*` is secret.

**Mint the CI token separately from the VPS token.** Two tokens for the same config, so either can
be revoked without taking the other down:

```bash
doppler configs tokens create github-actions --project culprit --config stg --plain
```

## Normal deployment

```bash
# after CI has pushed a new image for the commit you want:
./deploy.sh sha-abc1234
```

`deploy.sh`: validates the tag, pulls the image, verifies it landed, starts/updates the container,
polls the healthcheck for up to 90s, and only then cleans up dangling image layers. If the
healthcheck doesn't pass, it automatically restores the previously running image and exits
non-zero — it never leaves the box without a healthy container.

`latest` is a convenience tag for quick manual testing; production deploys should use the
immutable `sha-<commit>` tag so what's running is always traceable to an exact commit.

## Rollback

Every deploy prints the previous image's tag before switching. To roll back manually:

```bash
./deploy.sh sha-<previous-commit>
```

(`deploy.sh` already does this automatically on a failed healthcheck.)

## Logs

```bash
docker compose -f docker-compose.production.yml logs -f app
```

Container logs are capped (`json-file`, 10MB × 3 files) so they can't fill VPS disk over time.

## Health

No host port is published (Caddy reaches the container over the internal `server_default`
network), so check from outside the container via Caddy, or from inside via `docker exec`:

```bash
curl -sf https://culprit.wyco-dev.com/api/health
docker exec culprit-web node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>console.log(r.status))"
docker inspect --format '{{.State.Health.Status}}' culprit-web
```

`GET /api/health` does no database or external-service work — it's a liveness probe, not a
dependency check, so a transient Supabase/Resend blip doesn't trigger a container restart.

## Updating environment variables

Runtime config lives entirely in `.env.production` on the VPS — never in the image. If the box is
wired to Doppler, edit the value in the `stg` config and redeploy; `deploy.sh` rewrites
`.env.production` for you. Otherwise, by hand:

```bash
"$EDITOR" .env.production
docker compose -f docker-compose.production.yml up -d app   # recreates the container, same image
```

No rebuild, no re-pull, no image change — only the container restarts with new env values.

## Cleanup

`deploy.sh` already prunes dangling (untagged) layers after each successful deploy. To reclaim
more space by hand, list what's actually on disk first and remove specific old tags rather than
blanket-pruning:

```bash
docker images "ghcr.io/wyco68/culpritweb"
docker rmi ghcr.io/wyco68/culpritweb:sha-<old-commit>
```

Avoid `docker system prune -a` in production — it doesn't distinguish this app's old images from
anything else on the box and can delete the current rollback target.

## Resource usage

Single container, no database/cache/queue service (Postgres is Supabase, managed and external —
this app doesn't need a second container for it). `docker-compose.production.yml` caps the
container at 512MB RAM / 1 vCPU by default (`APP_MEM_LIMIT`/`APP_CPU_LIMIT` env overrides) and sets
`NODE_OPTIONS=--max-old-space-size=256` so Node itself stays under the container ceiling instead of
being OOM-killed at the cgroup boundary. Raise both if the VPS has more headroom — a limit this
tight is a floor for "very low-performance," not a universal recommendation.
