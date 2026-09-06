---
status: current
source_of_truth: false
last_updated: 2026-08-13
related_modules: [shared, auth, events, teaching, integrations]
related_decisions: [ADR-001, ADR-002, ADR-003, ADR-004, ADR-005, ADR-006, ADR-007, ADR-008, ADR-010]
---

# Architecture overview

> Verified against the actual codebase (`src/`, `prisma/schema.prisma`, `package.json`) as of
> 2026-08-08, not against the idealized design in the original implementation guide
> (which predates several of these changes — see [Known contradictions](../README.md#known-contradictions--gaps)).

## Stack (adopted, running)

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind v4 |
| Hosting | Self-hosted Docker container on a VPS, behind Cloudflare — see [deployment/docker-vps.md](../deployment/docker-vps.md) |
| Backend | Next.js Route Handlers (`src/app/api/**/route.ts`) |
| ORM | Prisma 7, driver adapter (`@prisma/adapter-pg`) over a plain `pg` `Pool` |
| Database | Supabase Postgres (pooled connection, port 6543/pgbouncer) — see [ADR-001](../decisions/ADR-001-database.md) |
| Auth | Better Auth — DB-backed cookie sessions, single admin, **not JWT** — see [ADR-003](../decisions/ADR-003-authentication.md) |
| Object storage | Cloudflare R2, S3-compatible API via `@aws-sdk/client-s3` — see [ADR-002](../decisions/ADR-002-object-storage-r2.md) |
| Scheduling | Calendly, embed-only — see [ADR-005](../decisions/ADR-005-calendly-embed-only.md) |
| Bot defense | Cloudflare Turnstile |
| Rate limiting | Cloudflare WAF Rate Limiting Rule (edge, auth login) + in-process fallback limiter (in the app) — see [ADR-008](../decisions/ADR-008-cloudflare-rate-limiting.md) |
| Email | Resend + React Email — wired but has zero current callers |
| Video | YouTube embeds (`src/modules/integrations/youtube/`) — built, not yet wired to any content model |
| i18n | **None.** English-only, literal strings — see [ADR-006](../decisions/ADR-006-remove-i18n-and-locale-routing.md) |

## Layers

Data flows one direction; each layer depends only on the one below it.

```
┌───────────────────────────────────────────────────────────┐
│ Boundary   — route handlers (src/app/api/**/route.ts)      │  auth → parse/validate → call service → respond
├───────────────────────────────────────────────────────────┤
│ Service    — domain logic (src/modules/*/*.service.ts)     │  existence checks, audit context, business rules
├───────────────────────────────────────────────────────────┤
│ Repository — the ONLY place Prisma is imported             │  typed CRUD + audit-log write, in one transaction
├───────────────────────────────────────────────────────────┤
│ Prisma 7 / Supabase PostgreSQL                              │
└───────────────────────────────────────────────────────────┘
```

**Deviation from the original design doc:** the audit-log write happens **inside the repository**
(`createWithAudit`/`updateWithAudit`, same DB transaction as the mutation), not in the service
layer as the original implementation guide describes.
Verified across every repository that mutates state (`event`, `research`, `publications`,
`profile`, `research-group`, `team-member`). This is intentional — it makes the audit
entry atomic with the mutation — but it means "no business logic in repositories" does
not extend to "no audit writes in repositories."

## Module boundaries (`src/modules/*`)

- **auth** — Better Auth config, single-admin session management, `requireAdmin()`.
- **profile** — the professor's singleton profile.
- **research** — research works CRUD.
- **publications** — publications CRUD.
- **research-groups** — research groups + `TeamMember` (relational, not a JSON blob).
- **events** — admin-authored events CRUD with photo uploads and YouTube embeds, plus
  `splitByTiming` (the upcoming/past read model). No status, no lifecycle, no visibility flag.
  Replaced the `appointments` module on 2026-09-01 — see
  [ADR-011](../decisions/ADR-011-events-replace-appointments.md).
- **teaching** — courses plus `cv_entry` (CV lines tagged by `section`). Owns the Teaching tab and
  the five CV lists the About tab renders. Replaced seven `Json` columns on `profile` — see
  [ADR-012](../decisions/ADR-012-cv-entries-and-courses.md).
- **integrations** — Calendly embed (no server-side client), Cloudflare R2 storage adapter,
  YouTube embed helper, Turnstile verifier, in-process rate limiter (fallback behind the
  Cloudflare edge rule — see [ADR-008](../decisions/ADR-008-cloudflare-rate-limiting.md)),
  `guardPublicWrite` composite guard, Resend email client (not wired to anything today). The
  YouTube helper is what `events` plays its videos through.
- **shared** — `Result`/error types, structured logger, API response envelope, Prisma client
  singleton, UI primitives (`shared/ui/*`), `query-client.ts`.

There is **no `appointments` module** (deleted 2026-09-01, ADR-011) — and with it went the only
state machine in the codebase. There is **no `notifications` module** — it was deleted along with
the appointment review-queue workflow. There is **no `i18n`/`messages` directory** — fully removed,
not just the routing layer. There is **no `settings` module** (deleted 2026-08-13, ADR-010) — the
global visibility flag it held has no successor, because every event is public.

## Route groups

```
src/app/
├── (public)/    # About, research, publications, teaching, team, events, appointment — flat paths
├── (admin)/     # admin/{dashboard,profile,research,publications,groups,team-members,teaching,events}, login
└── api/         # route handlers — see architecture/backend.md
```

`src/middleware.ts` exists (added 2026-08-10, ADR-008) but is scoped to rate-limit fallback on
`/api/auth/*` and mutating `/api/admin/*` only — it makes no auth decision and doesn't touch page
routes. The admin **page** section is guarded separately by a single server-side `requireAdmin()`
check in `src/app/(admin)/admin/layout.tsx`, re-evaluated on every request — see
[architecture/authentication.md](authentication.md).
