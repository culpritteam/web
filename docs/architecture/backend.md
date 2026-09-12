---
status: current
source_of_truth: false
last_updated: 2026-09-12
related_modules: [events, teaching, projects, research-groups, auth, integrations, shared]
related_decisions: [ADR-004, ADR-005, ADR-007, ADR-008, ADR-010, ADR-016, ADR-017]
---

# Backend architecture

## API routes

REST/JSON under `src/app/api/`. `Auth`: **Public** = no auth, **Admin** = admin session required
(checked in the handler via `requireAdmin()` — `src/middleware.ts` exists, ADR-008, but only as a
rate-limit fallback on `/api/auth/*` and mutating `/api/admin/*`; it never decides authorization).

### Public content reads

| Method | Path |
|---|---|
| GET | `/api/profile`, `/api/research`, `/api/publications`, `/api/team-members` |
| GET | `/api/team-members/{id}` — `{ member, links, cvEntries, courses, projects }`, already filtered by the member's team (ADR-017); `404` if missing |
| GET | `/api/events` — returns `{ upcoming, past }`, both possibly empty; never a 403 |
| GET | `/api/teaching` — returns `{ courses, entries }` for the director |

`/api/groups` and `/api/team-members/group/{groupId}` were removed with research groups on
2026-09-11 ([ADR-016](../decisions/ADR-016-lab-team-profiles.md)); this table still listed them
until 2026-09-12. There is deliberately **no public `/api/projects`** — projects are read through
the member profile above.

### Events — admin only

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/admin/events` | Create; public immediately |
| PUT | `/api/admin/events/{id}` | Partial update; a media array present in the body replaces that array wholesale |
| DELETE | `/api/admin/events/{id}` | Delete; full before-state written to `AuditLog` in the same transaction |
| POST | `/api/admin/events/photo` | Multipart single-file upload to the R2 `events` bucket → `{ url }`. Random object key per upload, 4 MB cap, image types only |

The 4 MB cap sits under Vercel's 4.5 MB serverless request-body limit, which rejects larger
bodies at the platform edge before the handler runs. Raising it means moving to a presigned
direct-to-R2 upload.

Nothing here returns `409` — events have no lifecycle. **There is no appointment API of any kind**
since 2026-09-01 (see [ADR-011](../decisions/ADR-011-events-replace-appointments.md)), **no public
event-writing endpoint**, and **no Calendly integration route** (no `/api/integrations/calendly/*`)
— see [ADR-005](../decisions/ADR-005-calendly-embed-only.md).

### Teaching — admin only

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/admin/teaching/courses` | Create a course |
| PUT/DELETE | `/api/admin/teaching/courses/{id}` | Update or delete a course |
| POST | `/api/admin/teaching/entries` | Create a CV entry (any of the seven sections) |
| PUT/DELETE | `/api/admin/teaching/entries/{id}` | Update or delete a CV entry |

CV-entry writes purge both the `teaching` and `about` cache areas, because `section` is editable
and one edit can move an entry between the two tabs. See
[ADR-012](../decisions/ADR-012-cv-entries-and-courses.md).

Both routes enforce the owning member's team ([ADR-017](../decisions/ADR-017-team-kinds-projects-member-links.md)):
a course, or a CV entry outside the sections that team allows, is rejected with **`400
validation_error`** (`fieldErrors.teamMemberId` for a course, `fieldErrors.section` for an entry),
and an unknown member id is a `404`. The rule lives in `TEAM_KIND_RULES`
(`src/modules/shared/lib/team-kind.ts`) and is enforced in the service, not the handler.

### Projects — admin only

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/projects?teamMemberId=` | List one member's projects; `teamMemberId` is required |
| POST | `/api/admin/projects` | Create — `{ teamMemberId, title, summary, link?, sortOrder? }` |
| PUT | `/api/admin/projects/{id}` | Partial update; `teamMemberId` cannot be changed |
| DELETE | `/api/admin/projects/{id}` | Delete; returns the before-state snapshot |

Projects purge the `projects` cache area, which maps to `/team/[id]`. There is no public projects
route and no projects tab — a project exists only on its owner's profile page.

### Admin content & auth

| Method | Path |
|---|---|
| POST/GET | `/api/auth/[...all]` — Better Auth's own handler (login/logout/session) |
| PUT | `/api/admin/profile`, POST `/api/admin/profile/photo` |
| CRUD | `/api/admin/research[/{id}]`, `/api/admin/publications[/{id}]`, `/api/admin/groups[/{id}]`, `/api/admin/team-members[/{id}]` |

### Bot-defense edge

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/turnstile/verify` | Confirms a Turnstile token before the client reveals the public Calendly embed. IP-rate-limited via the in-process fallback limiter (see [ADR-008](../decisions/ADR-008-cloudflare-rate-limiting.md)). Not a form-submission endpoint — nothing is written. |

## Route handler contract

Every handler follows the same shape (see `src/app/api/admin/events/[id]/route.ts` or
`src/app/api/turnstile/verify/route.ts` for concrete examples):

1. `await` params/searchParams; authenticate admin routes via `requireAdmin()`.
2. Parse body/query with the module's Zod schema → structured `400` via `apiValidationError()` on failure.
3. Rate-limit + Turnstile-verify where the route is public and mutating (currently only
   `/api/turnstile/verify` itself — `guardPublicWrite()` in `integrations/guard/` is written but
   has no current caller, kept ready for a future public write endpoint).
4. Call exactly one service method.
5. Map the service's `Result` → JSON via `respond()`/`apiSuccess()`/`apiError()`
   (`src/modules/shared/lib/api-response.ts`) — success payload, or typed error → HTTP status.

## Error handling

`src/modules/shared/lib/errors.ts` defines `AppError` subclasses, each with a fixed HTTP status:

| Error | Status |
|---|---|
| `ValidationError` | 400 |
| `UnauthorizedError` | 401 |
| `ForbiddenError` | 403 |
| `NotFoundError` | 404 |
| `ConflictError` | 409 |
| `RateLimitError` | 429 (sets `Retry-After`) |
| `IntegrationError` | 502 |
| `InternalError` | 500 |

Services return `Result<T, AppError>` (never throw for expected failures); the boundary maps it to
the standardized envelope `{ ok: true, data }` / `{ ok: false, error: { code, message, fieldErrors? } }`.
5xx errors are logged server-side with cause detail; only the safe code/message reach the client.

## Service / domain layer

One service per module (`src/modules/<name>/<name>.service.ts`), constructed via a small
composition-root `container.ts` per module (e.g. `getEventService()` in `events/container.ts`) —
no DI framework, just a cached factory function.

**There is no state machine anywhere in the codebase.** The appointment lifecycle that used to be
the most important piece of this layer was removed on 2026-09-01
([ADR-011](../decisions/ADR-011-events-replace-appointments.md)). Every service is now a thin
existence-check-plus-audit wrapper, and no service returns `ConflictError`/`409`. The one piece of
real domain logic left in `events` is `splitByTiming`, which is pure and clock-injectable.

## Validation

Zod schemas are the single source of truth per module (`<module>.schema.ts`), used for both the
client form resolver and the server boundary parse. See
[development/coding-conventions.md](../development/coding-conventions.md).

## Audit logging

Written by the **repository**, not the service — see
[architecture/overview.md](overview.md#layers) for why this deviates from the original design
doc. Every repository that mutates state writes an `AuditLog` row in the same Prisma
`$transaction` as the domain mutation.

## Caching

Two layers, both native Next.js — no Redis app-cache, no CDN, no cache-tag system (see
[ADR-007](../decisions/ADR-007-fix-cache-invalidation-and-cache-public-api-routes.md)).

- **Full Route Cache for public pages.** Every `(public)` page is a prerendered Server Component
  served from Next's Full Route Cache (`x-nextjs-cache: HIT`, ~5ms).
- **ISR-style caching on all six public GET API routes** (`/api/profile`, `/api/research`,
  `/api/publications`, `/api/groups`, `/api/team-members`, `/api/events`) via
  `export const revalidate` on each route module — the same on-demand cache Next already manages
  for pages, not a separate mechanism. `/api/events` uses 300s (time-sensitive: the upcoming/past
  boundary is computed against the clock at render time, so an event can cross it with nobody
  editing); the rest use 3600s.
  `/api/team-members` was restructured (see
  [ADR-007's addendum](../decisions/ADR-007-fix-cache-invalidation-and-cache-public-api-routes.md#addendum-2026-08-11-apiteam-members-restructured-to-cache))
  into two route modules to get here: the unfiltered `/api/team-members` route no longer reads
  `searchParams` at all, and the group filter moved to its own path-param route,
  `/api/team-members/group/{groupId}` — a dynamic path segment does not force a route dynamic the
  way a search param does, so both are `○ Static`/ISR-eligible. The per-group route isn't covered
  by `revalidatePath` (its id is only known per-request); it relies on the 3600s ceiling alone. A
  request to the old `/api/team-members?groupId=X` contract still lands on the unfiltered route
  (Next doesn't route on query string) — that one branch checks `searchParams` and `307`-redirects
  to `/api/team-members/group/X` rather than silently returning the unfiltered list; the common
  no-query-string request never touches `searchParams`, so it stays cacheable.
- **On-demand invalidation via `revalidatePath`**, triggered only from admin mutation route
  handlers (`revalidateOn()` / `revalidatePublic()` in
  `src/modules/shared/lib/revalidate.ts`) — those handlers are already `requireAdmin()`-gated, so
  this satisfies "admin-only invalidation" by construction; there is no separate purge endpoint.
  Each `PublicArea` maps to both its public page path and its mirrored public API route(s), so one
  admin write purges both.
- **3600s/300s `export const revalidate` values are ceilings, not the primary freshness path** —
  they only bound how long a change made *outside* the app (direct DB edit, re-seed, restored
  backup) could sit invisible behind the cache. Same rationale as the public layout's existing
  `export const revalidate = 3600` safety net.
