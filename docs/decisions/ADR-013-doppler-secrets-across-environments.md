---
status: current
source_of_truth: true
last_updated: 2026-09-06
related_modules: [shared, integrations]
related_decisions: []
---

# ADR-013: Doppler is the source of truth for local and staging config; Vercel is uploaded directly

## Status

Accepted

## Date

2026-09-06

## Context

The same handful of values — `DATABASE_URL`, `DIRECT_URL`, `BETTER_AUTH_SECRET`, the R2 credentials,
the Turnstile keys, the `NEXT_PUBLIC_*` URLs — were maintained in four separate places, by hand:

| Where | How | Used by |
|---|---|---|
| Doppler `culprit/dev` | `doppler run --` wraps `dev`, `start`, `db:migrate`, `db:seed` | local development, and Playwright via its `npm run dev` web server |
| GitHub Actions Secrets + Variables | `.github/workflows/docker.yml` | CI: `db:generate`, `db:deploy`, the image's build args and BuildKit secrets |
| `.env.production` on the VPS | bootstrapped once by hand, never touched by CI | the running staging container |
| Vercel project env vars | Vercel dashboard | production builds and runtime |

Nothing reconciles those four. Rotating a secret means remembering all of the places it lives, and
the failure mode is silent — staging happily keeps running on the old value until something that
depends on it breaks. The `stg` and `prd` Doppler configs existed but were empty, so Doppler was
only ever doing a quarter of the job it was adopted for.

The specific question was whether Doppler could also drive the VPS, given the free-tier-only rule
(see CLAUDE.md). Verified 2026-09-06 with CLI v3.76.1 against this workplace:

- Service tokens are available — `doppler configs tokens --project culprit --config prd` is
  permitted and returns an (empty) list, so the read-only, per-config, revocable token the VPS
  needs costs nothing.
- `doppler secrets download --no-file --format docker` emits exactly the `KEY=value` shape
  compose's `env_file:` expects, and `--fallback` writes an encrypted local copy of the last
  successful fetch.

So: yes for the VPS.

## Decision

**Doppler is the source of truth for local (`dev`) and staging (`stg`). Vercel production is
uploaded directly and is not synced.**

**The VPS pulls its own config.** `scripts/deploy.sh` looks for `.doppler-token` (a read-only
service token for the `stg` config, `chmod 600`) next to `docker-compose.production.yml`. When it
is there, every deploy regenerates `.env.production` from Doppler before the container is
recreated. When it is not, the script behaves exactly as before and `.env.production` stays the
hand-managed file — the Doppler path is opt-in per box, and adding it to a VPS is a one-file
bootstrap, not a migration.

The token lives on the VPS, not in CI. CI still never writes runtime secrets to the box: the
existing rule that `deploy.sh` only receives an image tag is unchanged, and the failure domain of
a leaked CI credential does not grow.

A Doppler outage degrades rather than blocks. `--fallback .doppler-fallback.json` serves the last
successful fetch; if even that is unavailable the script keeps the existing `.env.production` and
logs a warning, and only refuses outright when there is no previous config to deploy with at all.

**Vercel is a direct upload.** Production values are exported from Doppler and uploaded to the
Vercel project by hand (`doppler secrets download --no-file --format env --config prd` → Vercel's
env-var import, or `vercel env add`). Doppler's Vercel integration would sync this automatically
but is not part of the free tier, and production is the one environment where a config change
should be a deliberate, noticed act rather than a background sync.

## Alternatives considered

**CI renders `.env.production` and `scp`s it to the VPS.** Rejected: it puts every runtime secret
through the CI job and into a second copy on disk, to save the VPS from holding one read-only,
per-config, revocable token. It also inverts the current, deliberate property that CI sends the
box nothing but an image tag.

**`doppler run -- docker compose up -d` instead of writing an env file.** Rejected: compose does
not forward the ambient environment to a container, so every variable would have to be listed
again under `environment:` in `docker-compose.production.yml` — the same list, maintained twice,
which is the problem this ADR exists to remove.

**Move CI onto Doppler too, replacing the GitHub Secrets and Variables.** Not done here, and worth
doing separately. `docker/build-push-action` takes its `build-args` and `secrets` as YAML
expressions, so they cannot come from a `doppler run` wrapper — each value has to be fetched into
the job's environment and masked individually, which is a noisier change than it looks and is on
the critical path of every deploy.

## Consequences

- Rotating a staging secret is one edit in Doppler `stg` plus a redeploy; no SSH, no hand-editing
  a file on the box.
- The VPS needs the Doppler CLI installed and a service token bootstrapped once. Both are
  documented in [docker-vps.md](../deployment/docker-vps.md#runtime-config-from-doppler).
- Doppler joins Supabase, R2, Turnstile, Upstash and Resend as a service the deploy path depends
  on. The `--fallback` file is what keeps that dependency from being able to stop a deploy.
- The `stg` and `prd` configs must be populated before any of this does anything — they are empty
  as of this ADR, and the real values still live in GitHub Actions, on the VPS and in Vercel.
- GitHub Actions keeps its own Secrets and Variables for the build. Until the alternative above is
  taken, build-time values exist in two places and must be changed in both.

## Supersedes / Superseded by

Nothing. Scoped to the two-remote split described in
[deployment.md](../deployment/deployment.md#two-remotes) — VPS staging, Vercel production.
(Note that [ADR-009](ADR-009-vercel-dropped.md) still reads as though Vercel were dropped
entirely; it predates the mirror that now serves production.)
