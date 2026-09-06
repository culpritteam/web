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
| GitHub Actions Secrets + Variables | `.github/workflows/docker.yml` | CI: `db:generate`, `db:deploy`, the image's build args and BuildKit secrets — nine entries, all duplicates of values below |
| `.env.production` on the VPS | bootstrapped once by hand, never touched by CI | the running staging container |
| Vercel project env vars | Vercel dashboard | production builds and runtime |

(That table is the state *before* this ADR. The decision below replaces it with one shared config
for local and staging, and no Doppler config for production.)

Nothing reconciles those four. Rotating a secret means remembering all of the places it lives, and
the failure mode is silent — staging happily keeps running on the old value until something that
depends on it breaks. The `stg` and `prd` Doppler configs existed but were empty, so Doppler was
only ever doing a quarter of the job it was adopted for.

The specific question was whether Doppler could also drive the VPS, given the free-tier-only rule
(see the project rules). Verified 2026-09-06 with CLI v3.76.1 against this workplace:

- Service tokens are available — `doppler configs tokens --project culprit --config stg` is
  permitted and returns an (empty) list, so the read-only, per-config, revocable token the VPS
  needs costs nothing.
- `doppler secrets download --no-file --format docker` emits exactly the `KEY=value` shape
  compose's `env_file:` expects, and `--fallback` writes an encrypted local copy of the last
  successful fetch.

So: yes for the VPS.

## Decision

**Doppler is the source of truth for local (`dev`) and staging (`stg`), including CI. Vercel
production is uploaded directly and is not synced.**

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

**CI fetches at run time.** `.github/workflows/docker.yml` calls
[`dopplerhq/secrets-fetch-action@v2.0.0`](https://github.com/DopplerHQ/secrets-fetch-action) in
each job with a read-only `stg` service token, and reads the values as step outputs — which is what
`docker/build-push-action`'s `build-args` and `secrets` need, since those are YAML expressions a
`doppler run` wrapper could never reach. The action masks every fetched value in the log.

GitHub keeps exactly three things besides `DOPPLER_TOKEN`: `DEPLOY_SSH_KEY`, `DEPLOY_HOST` and
`DEPLOY_USER`. Those are how the pipeline reaches the VPS rather than configuration the
application reads, and a multi-line private key is the value blanket log masking handles least
well — moving it buys nothing and adds a failure mode.

The CI token and the VPS token are minted separately for the same shared config, so either can be
revoked without taking the other down.

**Local and staging share one config.** `culprit/stg` holds one set of variables and values, used
by the local dev server, by CI and by the VPS. A developer runs `doppler setup --project culprit
--config stg` once; CI and the VPS each hold their own read-only service token for the same config.
There is no separate `dev` config: two configs holding identical values is the duplication this ADR
exists to remove.

**Production is out of scope for Doppler.** No production environment is deployed yet. When one is
set up it will take its variables directly from that host's own settings, not from Doppler, and no
`prd` config is maintained. Revisit only if a production environment is actually built.

## Alternatives considered

**CI renders `.env.production` and `scp`s it to the VPS.** Rejected: it puts every runtime secret
through the CI job and into a second copy on disk, to save the VPS from holding one read-only,
per-config, revocable token. It also inverts the current, deliberate property that CI sends the
box nothing but an image tag.

**`doppler run -- docker compose up -d` instead of writing an env file.** Rejected: compose does
not forward the ambient environment to a container, so every variable would have to be listed
again under `environment:` in `docker-compose.production.yml` — the same list, maintained twice,
which is the problem this ADR exists to remove.

**Doppler's GitHub Actions sync integration**, which pushes values into GitHub Actions Secrets so
the workflow needs no change. Rejected: it keeps a full copy of every secret in GitHub — the
duplication this ADR exists to remove — and each sync counts against the free plan's five.
Runtime fetching leaves GitHub holding one revocable token.

**A `doppler run` wrapper around the whole build job.** Not possible: `docker/build-push-action`
takes its `build-args` and `secrets` as YAML expressions, which cannot read a wrapper's ambient
environment. Step outputs can.

## Consequences

- Rotating a staging secret is one edit in Doppler `stg` plus a redeploy; no SSH, no hand-editing
  a file on the box.
- The VPS needs the Doppler CLI installed and a service token bootstrapped once. Both are
  documented in [docker-vps.md](../deployment/docker-vps.md#runtime-config-from-doppler).
- Doppler joins Supabase, R2, Turnstile, Upstash and Resend as a service the deploy path depends
  on. The `--fallback` file is what keeps that dependency from being able to stop a deploy.
- The shared `stg` config must be populated before any of this does anything — it was empty as of
  this ADR, and the real values lived in GitHub Actions and on the VPS.
- CI gains a hard dependency on Doppler: if the fetch fails, no build happens. Unlike the VPS
  there is no fallback file, and that is the right trade for CI — a build with stale config is
  worse than no build.
- `DOPPLER_TOKEN` must exist in GitHub before this workflow can run at all, and the `stg` config
  must hold every value the old Secrets and Variables held. Until both are true, every push fails
  at the first job.

## Supersedes / Superseded by

Nothing. Scoped to the two-remote split described in
[deployment.md](../deployment/deployment.md#two-remotes) — VPS staging, Vercel production.
(Note that [ADR-009](ADR-009-vercel-dropped.md) still reads as though Vercel were dropped
entirely; it predates the mirror that now serves production.)
