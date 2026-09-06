# The Culprit

Personal academic website + admin-controlled appointment system for an information-security
professor, built on Next.js 15 (App Router).

**Live site:** [culprit.wyco-dev.com](https://culprit.wyco-dev.com)

## Quick start

Env vars are managed via [Doppler](https://doppler.com), not a local `.env` file.

1. Install Doppler CLI and log in:
   ```bash
   # macOS
   brew install dopplerhq/cli/doppler
   # Linux
   curl -Ls https://cli.doppler.com/install.sh | sh
   # Windows (PowerShell)
   scoop bucket add doppler https://github.com/DopplerHQ/scoop-doppler.git
   scoop install doppler

   doppler login
   ```
2. From repo root, link project: `doppler setup` (choose `culprit` → `dev` config)
3. Run app normally — env vars inject automatically: `npm run dev`

```bash
npm install
doppler setup   # once, links this repo to the Doppler project/config
npm run dev
```

Check the link worked (should print your `DATABASE_URL`):

```bash
# macOS/Linux
doppler run -- printenv | grep DATABASE_URL
# Windows (PowerShell)
doppler run -- cmd /c set | Select-String DATABASE_URL
```

You need at minimum a Supabase Postgres connection (`DATABASE_URL`/`DIRECT_URL`) and
`BETTER_AUTH_SECRET` for the app to boot. Everything else (Turnstile, R2, Resend, Cloudflare purge)
is optional — each integration no-ops gracefully when its env vars are unset, so local dev never
gets blocked waiting on a third-party credential.

Doppler also backs staging: the VPS pulls its own `.env.production` from the `stg` config on each
deploy (see [docs/deployment/docker-vps.md](docs/deployment/docker-vps.md#runtime-config-from-doppler)).
Vercel production is uploaded by hand and is not synced —
[ADR-013](docs/decisions/ADR-013-doppler-secrets-across-environments.md).

`build` and `db:deploy` are deliberately NOT Doppler-wrapped: Next loads `.env.local` on its own,
and `prisma.config.ts` loads it for the Prisma CLI too, so both commands work with or without
Doppler installed. This also matters in CI/Docker, which run these two exact scripts with env vars
injected directly (GitHub Actions secrets, BuildKit secret mounts) — neither environment has the
Doppler CLI, so wrapping them would break the real deploy pipeline.

```bash
npm run build        # prisma generate && next build
npm run typecheck
npm run lint
npm test              # Vitest, unit + component tests
npm run test:e2e      # Playwright
npm run db:migrate    # prisma migrate dev (local schema changes)
npm run db:seed       # seed data
```

Run `npm run typecheck && npm run lint && npm test` before considering any change done.

## Docs

- **[docs/README.md](docs/README.md)** — index of the `docs/` tree: architecture, requirements,
  ADRs (*why* decisions were made), deployment.
- **[docs/decisions/](docs/decisions/)** — one ADR per significant decision. Read the relevant one
  before touching caching (ADR-007), rate limiting (ADR-008), or deployment (ADR-009).

Search all of it at once:

```bash
npm run docs:search -- "appointment workflow"
```

Rendered status pages, published from this repo via GitHub Pages:
[spec](https://wyco68.github.io/CulpritWeb/) ·
[progress](https://wyco68.github.io/CulpritWeb/progress.html) ·
[frontend](https://wyco68.github.io/CulpritWeb/frontend.html) ·
[backend](https://wyco68.github.io/CulpritWeb/backend.html) ·
[architecture](https://wyco68.github.io/CulpritWeb/architecture.html) ·
[deployment](https://wyco68.github.io/CulpritWeb/deployment.html) ·
[CI/CD & secrets](https://wyco68.github.io/CulpritWeb/cicd-secrets.html) ·
[hosting cost](https://wyco68.github.io/CulpritWeb/hosting-cost.html).

## Deployment

Self-hosted: one prebuilt Docker container on a VPS, behind Cloudflare — see
[docs/deployment/docker-vps.md](docs/deployment/docker-vps.md). CI builds the image and pushes it
to GHCR; the VPS only ever pulls and runs it (`scripts/deploy.sh`), never builds.
