---
status: current
source_of_truth: true
last_updated: 2026-08-11
related_modules: [shared]
related_decisions: [ADR-006]
---

# ADR-007: Fix stale cache-invalidation paths; extend on-demand caching to public GET API routes

## Status

Accepted

## Date

2026-08-10

## Context

`src/modules/shared/lib/revalidate.ts` invalidates the public pages an admin mutation affects via
`revalidatePath()`, keyed by a `PublicArea` (`research`, `publications`, `team`, `events`,
`appointment`, plus a `'profile'` special case for the site header in the public layout).

An audit found `AREA_PATHS` still used route-template paths from before ADR-006
(`'/[locale]/research'`, etc.) and the `'profile'` case called
`revalidatePath('/[locale]', 'layout')`. Locale routing was removed entirely in ADR-006
(2026-08-08, commit `15e2216`) — routes are flat today (`src/app/(public)/research/page.tsx`
renders at `/research`; route groups like `(public)` add no URL segment). `revalidatePath` does
not throw on a non-matching path — it silently no-ops. The result: **every admin write since
ADR-006 landed has called `revalidatePath` with a path that matches nothing**, so on-demand
invalidation has been a no-op in production for two days. The public site has only stayed
approximately current via the blind `export const revalidate = 3600` fallback in
`src/app/(public)/layout.tsx` — itself documented as "safety net only," not the primary freshness
mechanism it was standing in for.

Separately, a related gap: six public GET API routes (`/api/profile`, `/api/research`,
`/api/publications`, `/api/groups`, `/api/team-members`, `/api/events/upcoming`) call their
module's service directly rather than `fetch()`, so Next's Data Cache never applies to them, and
they carried no route-segment cache config — every request hit Postgres. They're not called by the
app's own pages (pages read through the service layer server-side directly), but they are a
documented public read API surface (`docs/architecture/backend.md`), publicly reachable, and worth
protecting from the same always-hits-the-database problem.

## Decision

1. **Fix `AREA_PATHS`** in `revalidate.ts` to the real flat paths (`/research`, `/publications`,
   `/team`, `/events`, `/appointment`) and change the `'profile'` case to
   `revalidatePath('/', 'layout')` (the public layout resolves to the root of the `(public)`
   route group).
2. **Cache five of the six public GET API routes** the same way Next already caches pages:
   `export const revalidate = 3600` per route module (300s for `/api/events/upcoming`, since an
   admin-declared appointment can pass into the past between invalidations — a shorter ceiling
   limits how long a stale-but-now-past event could be served). No `dynamic = 'force-static'` —
   plain `export const revalidate` is sufficient for a GET handler with no dynamic API usage.
   **`/api/team-members` is the exception and stays uncached** — see Correction below.
3. **Extend each `PublicArea` to also list its mirrored public API route(s)** so a single admin
   mutation purges both surfaces through the *same* on-demand cache Next already manages — not a
   second invalidation mechanism. E.g. area `research` now revalidates `/research` **and**
   `/api/research`. `team` still lists `/api/team-members` in this purge map even though the route
   itself isn't currently cacheable (harmless no-op today; correct if the route is ever made
   cacheable).

## Correction (2026-08-10, same day): `/api/team-members` does not cache

An initial version of this change added `export const revalidate = 3600` to all six routes,
including `/api/team-members`, on the reasoning that reading `request.nextUrl.searchParams` for
the optional `?groupId=` filter doesn't opt a GET route out of static caching. **That reasoning was
wrong for this route.** `next build`'s route table showed `ƒ /api/team-members` (Dynamic), not `○
Static`, with the build log stating plainly: "Dynamic server usage: Route /api/team-members
couldn't be rendered statically because it used `nextUrl.searchParams`." Unlike `cookies()`/
`headers()`/`draftMode()`, which are the commonly-cited dynamic APIs, **reading `searchParams` on
a request object is itself also a dynamic API use** in the App Router's static-analysis model —
the earlier claim that "none of the six use those [dynamic APIs]" was factually wrong for this one
route. The other five routes (`/api/profile`, `/api/research`, `/api/publications`, `/api/groups`,
`/api/events/upcoming`) take no request input at all and build as `○ Static` with their intended
revalidate ceilings.

`export const revalidate` was removed from `src/app/api/team-members/route.ts`, along with the
now-incorrect comment. The route stays a plain per-request DB read, same as before this change —
not a regression, just not the caching win originally claimed. `revalidate.ts`'s `team` area still
lists `/api/team-members` in its `revalidatePath` purge targets: calling `revalidatePath` on a
route that was never statically cached is a harmless no-op, and the entry becomes correct again if
the route is later restructured (e.g. two route modules, filtered vs. unfiltered) to be cacheable.

Considered and rejected: introducing a cache-tag system (`revalidateTag` + `unstable_cache`) for
finer-grained invalidation, or fronting reads with Upstash Redis as an app-level cache. Both were
rejected as new infrastructure the project doesn't need: `revalidatePath` per-route already gives
exact invalidation (no over-purging — each area maps to precisely the routes it feeds), the
project is Vercel + Supabase only (see `docs/deployment/deployment.md`) with a hard free-tier-only
constraint (see the project rules), and Upstash Redis in this project is scoped to rate limiting only —
repurposing it as an app cache would blur that boundary for no measured benefit. A cache-tag layer
would add real complexity (tag naming, `unstable_cache` wrapping) to solve a problem `revalidatePath`
already solves at the current scale (a handful of public routes, single admin, low write volume).

## Addendum (2026-08-11): `/api/team-members` restructured to cache

The Correction above left the door open: "correct if the route is later restructured (e.g. two
route modules, filtered vs. unfiltered) to be cacheable." That restructure is now done.

**Why it was safe to change the route's shape.** Before touching anything, a repo-wide grep
confirmed `/api/team-members` has zero internal consumers — the public `(public)/team/page.tsx`
and every admin page call `getTeamMemberService().list(...)` directly through the service layer
(this project's public pages read through services, not their own internal HTTP API), same as the
other five public GET routes. `/api/team-members` is a standalone public API surface with no code
in this repo depending on its exact request shape, so changing `?groupId=` to a path segment is
not a breaking change for anything that ships with the app.

Correction to an earlier draft of this addendum: it claimed "the spec doesn't promise API
stability for this optional filter." That was false — `PROJECT_SPEC.md` (and its `.html` render)
did document `GET /api/team-members ... Optional ?groupId= filter` as a stable row, and
The project rules are explicit that the spec wins over instinct. This was, honestly, a deliberate
spec-breaking change to the request shape, accepted because this is a personal academic site with
no real external API consumers of this optional filter (only this repo's own — now-removed —
internal caller of the query-string form, per the grep above). Two things keep it from being a
silent break: (1) `PROJECT_SPEC.md`/`PROJECT_SPEC.html` were updated in the same change to
document the new two-route shape, so the spec and the code agree again; (2)
`/api/team-members?groupId=X` still resolves correctly via a `307` redirect to
`/api/team-members/group/X` rather than silently returning the wrong (unfiltered) data, so even a
hypothetical caller still on the old contract keeps working, just via one extra hop.

**The restructure.** Two route modules replace the one:

- `src/app/api/team-members/route.ts` — unfiltered list only. No `NextRequest` parameter, no
  `searchParams`, no query-schema parse. `export const revalidate = 3600`, same as the other five
  now-cached routes.
- `src/app/api/team-members/group/[groupId]/route.ts` (new) — filtered-by-group list, `groupId`
  read from the async route `params` (Next 15 route-handler `params` are a `Promise`, same as
  every `[id]` admin route in this codebase, e.g. `src/app/api/admin/research/[id]/route.ts`),
  validated with `teamMemberGroupIdSchema` (extracted from the now-removed
  `listTeamMembersQuerySchema.shape.groupId` — same `z.string().trim().min(1).max(200)`
  constraint, just no longer wrapped in an object shape meant for a query string).
  `export const revalidate = 3600` here too. An unmatched/nonexistent `groupId` still returns
  `200 { ok: true, data: [] }` — the repository only filters, it never verifies the group exists —
  so this preserves the old route's semantics exactly, just over a path segment instead of a query
  string.

A dynamic path segment (`[groupId]`) does not force a route handler dynamic the way reading
`request.nextUrl.searchParams` does; Next generates/caches each resolved `groupId` path on-demand
the same way it does for a dynamic *page* segment. `next build`'s route table confirms both new
route shapes are no longer forced dynamic by request-input access (see the PR/task that shipped
this addendum for the exact table output).

`revalidate.ts`'s `team` area still only lists the unfiltered `/api/team-members` in its
`revalidatePath` purge targets. The filtered route's `groupId` is only known per-request, so there
is no fixed path an admin mutation handler could purge ahead of time without hand-rolling a
purge-all-known-group-ids loop — deliberately not built, per this ADR's own rejection (above) of
adding invalidation infrastructure beyond `revalidatePath`. The filtered route instead relies
solely on its 3600s `revalidate` ceiling as the freshness bound, the same accepted tradeoff this
ADR already made for `/api/events/upcoming`'s 300s ceiling, just longer because a team member's
group assignment changing is rarer and lower-stakes if briefly stale.

`listTeamMembersQuerySchema` and its test cases were removed as dead code (confirmed via grep: no
remaining importer once the query-string route was gone) rather than left unused.

## Correction (2026-08-12): the Addendum's "no longer forced dynamic" claim was wrong

A production Cloudflare caching audit found `/api/team-members` still `DYNAMIC` in prod despite this
ADR's Addendum claiming it was fixed. `npm run build` confirmed it directly: the build log repeated
the exact same `Dynamic server usage: Route /api/team-members couldn't be rendered statically
because it used nextUrl.searchParams` error the original Correction (above) had already diagnosed.

The Addendum's restructure split the route in two, but the unfiltered `route.ts` kept an
unconditional `request.nextUrl.searchParams.get('groupId')` read to 307-redirect old
`?groupId=`-style callers to the new `/api/team-members/group/{groupId}` path. That read — not
gated behind any other dynamic API — is itself sufficient to force the route dynamic, the same
mechanism as before; the Addendum's claim that "next build's route table confirms both new route
shapes are no longer forced dynamic" was never actually re-verified against a real build.

**Fix**: moved the redirect into `src/middleware.ts` (`resolveTeamMembersCompatRedirect`), which
runs before route-level static analysis and isn't subject to it. `route.ts` no longer takes a
`NextRequest` param at all. `next build` now shows `○ /api/team-members` (Static, 1h/1y), matching
what this ADR always intended.

## Addendum (2026-08-12): Cloudflare edge caching + purge, explicit browser/edge Cache-Control tiers

A production caching audit (prompted by the VPS/Docker deploy going live the same day, see
[docker-vps.md](../deployment/docker-vps.md)) found the public routes this ADR made cacheable were
never actually cached at the Cloudflare edge in front of the VPS — confirmed live via
`CF-Cache-Status: DYNAMIC` on every request, not assumed. Cloudflare does not cache HTML/JSON by
default regardless of the origin's `Cache-Control`; it only auto-caches by static file extension.

**Cloudflare Cache Rule added** (dashboard/API, not in this repo — Free plan allows 10 Cache Rules
per zone, confirmed via current docs) on `culprit.wyco-dev.com` only (host-scoped — this zone also
hosts an unrelated sibling app, `carpart.wyco-dev.com`, on the same shared VPS), matching exactly
the routes this ADR already lists as safe: the 6 public pages + `/api/research`, `/api/publications`,
`/api/profile`, `/api/events/upcoming`, `/api/groups`, `/api/team-members`, and
`/api/team-members/group/*`. Edge/browser TTL both set to "respect origin" — i.e. whatever
`Cache-Control` the route sends. `/api/admin/**`, `/api/auth/**`, and all mutation endpoints are
untouched by the rule (confirmed live: still `DYNAMIC`).

**Cache key safety — Vary.** Every response from this app carries
`Vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch,
Accept-Encoding` (Next.js's own RSC/prefetch content negotiation). Cloudflare ignores `Vary` by
default; naively enabling caching without addressing it would let a plain page-load response and an
RSC/prefetch fetch collide on the same cache entry for a given URL — a real correctness bug, not
theoretical (confirmed by testing: without a `vary` action in the rule, everything with
`Accept-Encoding` in `Vary` came back `BYPASS`, since it fell to the rule's `default: bypass` and
every response lists that header). Fixed by including all 4 custom headers as `passthrough` and
`accept-encoding` as `normalize` in the Cache Rule's `vary` config (a Free-plan-available feature,
shipped 2026-07-02) — every other header defaults to `bypass`. Verified live with a real request
carrying `RSC`/`Next-Router-Prefetch` headers: gets its own cache entry, doesn't corrupt the plain
HTML variant.

**Explicit two-tier `Cache-Control`.** Each of the routes above now sets its own `Cache-Control`
via `respondPublicCache`/`withPublicCache` (`src/modules/shared/lib/api-response.ts`) instead of
relying on Next's auto-synthesized `s-maxage`-only header — Next only synthesizes one when the
handler hasn't already set `Cache-Control` itself (confirmed in `next/dist/server/send-payload.js`:
`if (cacheControl && !res.getHeader('Cache-Control'))`), so an explicit header here is respected
as-is. Two tiers, matching each route's actual update frequency (not "public therefore long"):
- Normal CMS content (research/publications/profile/groups/team-members): `public, max-age=300,
  s-maxage=3600, stale-while-revalidate=300` — browser TTL intentionally shorter than the edge TTL.
- Time-sensitive (`/api/events/upcoming`, already 300s `revalidate` per the original ADR): `public,
  max-age=60, s-maxage=300, stale-while-revalidate=60`.
Error responses (`apiError`, hit via either a rejected `Result` or a caught throw) always get
`Cache-Control: no-store` — an error is never the real resource and must never be cached as if it
were, at any layer.

**Private surfaces get an explicit header too**, not just an absent one. `src/middleware.ts` now
sets `Cache-Control: private, no-store` on every response under `/api/auth/**` and `/api/admin/**`
(defense-in-depth against a future misconfigured Cache Rule or proxy, not just relying on the
absence of a cache directive).

**Cloudflare purge on invalidation.** `revalidatePublic` (this file) now also schedules a Cloudflare
purge for the same resolved paths via `src/modules/shared/lib/cloudflare-cache.ts`, using Next 15's
`after()` so it runs post-response without delaying the mutation, and consolidated into one purge
call per `revalidatePublic` invocation (not one per area) to avoid a purge storm on a multi-area
save. Entirely optional: no-ops without `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ZONE_ID` configured (not
yet set in production as of this addendum — needs a token scoped to *Zone > Cache Purge > Purge*
added to `.env.production` on the VPS to actually activate; see `.env.example`). Without it, the
site is still correct — Next's own cache is invalidated immediately either way, and each route's
`revalidate` TTL (above) bounds how long a stale edge-cached response can outlive an admin edit.
Never throws: a purge failure is logged, not raised, so it can't fail the database write that
triggered it.

Considered and rejected: a Cloudflare Worker for purge/caching (a Cache Rule + the Purge API already
solve this without one, per this project's own "prefer Cloudflare config over Workers" bias);
purging cache tags instead of URLs (this app's traffic/write volume doesn't need tag-level
granularity — the existing per-area `revalidatePath` URL list already gives exact targeting).

## Consequences

- On-demand invalidation actually works again: an admin save reaches the public site (and its
  mirrored API route) within the same request cycle, restoring the intended "fast cache, always
  current" behavior instead of silently degrading to the hourly fallback.
- Five of the six public GET API routes go from "DB hit every request" to cached-with-purge, at no
  infrastructure cost — same mechanism, more routes registered against it. `/api/team-members`
  stays a DB hit on every request (see Correction above) — accepted as-is at this app's traffic
  scale; not worth branching the handler to make the unfiltered case cacheable.
- `export const revalidate` ceilings (3600s / 300s for the time-sensitive events route) remain
  purely a safety net for changes made outside the app (direct DB edit, re-seed, restored backup),
  exactly as already documented for the public layout — this ADR doesn't change that role, only
  restores it and widens its coverage.
- A regression test now pins the literal paths (`src/modules/shared/lib/revalidate.test.ts`) so a
  future locale-style rename (or any path typo) fails loudly instead of silently no-opping again.

## Supersedes / Superseded by

Does not supersede ADR-006 (locale-routing removal) — this ADR fixes a downstream bug ADR-006's
change introduced (stale paths in `revalidate.ts` that ADR-006 didn't touch when it removed the
`[locale]` segment elsewhere).
