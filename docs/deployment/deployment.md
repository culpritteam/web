---
status: current
source_of_truth: false
last_updated: 2026-09-06
related_modules: [shared, integrations]
related_decisions: [ADR-001, ADR-002, ADR-013]
---

# Deployment

## Two remotes

The code lives in two GitHub repositories, and they do different jobs. Push to both; never assume
one is a superset of the other.

| Remote | Repository | Serves | Runs |
|---|---|---|---|
| `origin` | `Wyco68/CulpritWeb` | Staging on the VPS — `culprit.wyco-dev.com` | All of `.github/workflows/` |
| `deploy` | `culpritteam/web` | Production on Vercel — `web-sepia-psi-97.vercel.app` | Nothing. Vercel only. |

`culpritteam/web` is a mirror that exists so Vercel has something to build from. Vercel deploys
through its own GitHub integration, so it needs no workflow file and has none of the secrets the
VPS pipeline uses. Every job in `.github/workflows/` is therefore gated:

```yaml
if: github.repository == 'Wyco68/CulpritWeb'
```

Without that guard the mirror would try to publish images to GHCR, SSH to the VPS and apply
migrations with credentials it does not hold, and fail on every push. **Any new workflow job needs
the same line.**

There is also an `all` remote configured with two push URLs, which pushes to both repositories at
once. Prefer pushing to `origin` and `deploy` separately — one repository at a time makes it
obvious which one a mistake landed in.

## Platform

Staging is self-hosted: one prebuilt Docker container on a low-resource VPS, built and pushed by
CI, never built on the VPS itself. Production is Vercel, built by Vercel from the mirror. `NEXT_PUBLIC_APP_URL`/`BETTER_AUTH_URL` are set to the deployed domain.
See [architecture/overview.md](../architecture/overview.md) for the full adopted stack and
[docker-vps.md](docker-vps.md) for the pipeline itself; everything below (build command,
migrations, connection pooling) is the platform-agnostic part that pipeline relies on.

## Secrets & environment config

Three environments, two mechanisms — see
[ADR-013](../decisions/ADR-013-doppler-secrets-across-environments.md).

| Environment | Source of truth | How it gets there |
|---|---|---|
| Local | Doppler `culprit/dev` | `doppler run --` wraps `dev`, `start`, `db:migrate`, `db:seed`; Playwright inherits it through `npm run dev` |
| Staging (VPS) | Doppler `culprit/stg` | `scripts/deploy.sh` regenerates `.env.production` from a read-only service token held on the box — [setup](docker-vps.md#runtime-config-from-doppler). Opt-in: without `.doppler-token` the file stays hand-managed |
| Production (Vercel) | Doppler `culprit/prd` | **Manual.** Export and upload to the Vercel project; nothing syncs automatically |

CI reads the same `stg` config: `.github/workflows/docker.yml` fetches it per job with
[`dopplerhq/secrets-fetch-action`](https://github.com/DopplerHQ/secrets-fetch-action) and a
read-only service token. GitHub keeps only `DOPPLER_TOKEN` plus the VPS SSH target
(`DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_USER`) — see
[docker-vps.md](docker-vps.md#required-ci-configuration).

`build` and `db:deploy` are deliberately *not* Doppler-wrapped — CI and Docker run those exact
scripts with env injected directly and have no Doppler CLI.

## Build

```bash
npm run build   # prisma generate && next build
```

`npm run predev` (`prisma migrate deploy`) only runs before `next dev`, not before `build` — CI/CD
must run `prisma migrate deploy` as an explicit release step, separate from the build command.

## Migrations

**All three environments currently share one Supabase database.** Local development, staging on
the VPS and production on Vercel all point at the same project — verified 2026-09-02: each returns
profile id `cmsfr2ii80000ewcq96y5h6dj`. There is no separate production database.

Two consequences, both easy to get wrong:

- **Every migration is a production migration.** The VPS pipeline runs `prisma migrate deploy` as
  its own job, so a migration merged to `main` reaches production data the moment staging deploys
  — not when Vercel next builds, and with no second chance to review it. `npm run predev` applies
  migrations before `next dev`, so running the app locally does the same thing.
- **Staging writes land in production data.** Anything typed into the staging admin, seeded with
  `npm run db:seed:demo`, or written by the admin e2e specs is live on the public site.

This is a known gap, not a design: the Supabase free tier allows two projects and only one is in
use. Splitting them is the highest-value item outstanding. Until that happens, treat every schema
change and every staging write as production traffic.

- **Never** run `prisma migrate dev` against production.
- Release step: `npm run db:deploy` (`prisma migrate deploy`), using `DIRECT_URL` (unpooled) —
  matches `.env.example`'s split between the pooled `DATABASE_URL` (app queries) and `DIRECT_URL`
  (migrations, prepared statements).

## Connection pooling

The app uses Supabase's pooled connection (port 6543, pgbouncer, transaction mode) for
`DATABASE_URL`; migrations use the direct connection (port 5432) via `DIRECT_URL`. The container
is long-running, not serverless, so this isn't strictly required to avoid connection exhaustion
the way it would be on a platform that spins up a new function instance per request — it's kept
regardless, since it's already configured and costs nothing to keep.

## Object storage & DNS

`R2_PUBLIC_URL` points at the bucket's `pub-<hash>.r2.dev` dev URL, not a custom domain — see
[ADR-002](../decisions/ADR-002-object-storage-r2.md) for why (the project's own domain's DNS zone
lives in a different Cloudflare account than the R2 bucket).

## Security headers & HTTPS

HTTPS everywhere; Better Auth cookies require `secure` in production. The Calendly embed needs its
origin allowlisted in `frame-src`/CSP if a Content-Security-Policy header is added.

## Backups

**Open question — not yet decided.** Supabase's free tier has no automatic backups (surfaced by
the `docs-site/HOSTING_COST.html` review). Accept the risk, script a manual backup, or budget for a paid
tier with backups included — see `requirements/scope.md`'s open questions.

## Observability

Structured logs (`shared/lib/logger.ts`) plus the `AuditLog` table for domain-level audit of admin
actions. No dedicated uptime/error-monitoring integration is present
in the codebase today — target is 99.5% uptime per the non-functional requirements, but no
monitoring tool is wired up to measure it.

## Cost constraint

Every third-party service must stay on its **free tier**: Supabase (free Postgres),
Cloudflare R2 (free egress), Calendly (free, embed-only), Cloudflare Turnstile (free), Cloudflare
WAF Rate Limiting + DNS proxy (Free plan, 1 rate limiting rule per zone), Resend (free tier,
unused). The VPS itself is the one paid line item — see `docs-site/HOSTING_COST.html` for the full cost
review that drove the R2 migration
([ADR-002](../decisions/ADR-002-object-storage-r2.md)) and
[ADR-008](../decisions/ADR-008-cloudflare-rate-limiting.md) for the rate-limiting architecture.
