---
status: current
source_of_truth: true
last_updated: 2026-08-10
related_modules: [integrations, shared]
related_decisions: [ADR-007]
---

# ADR-008: Cloudflare edge rate limiting, replacing Upstash

## Status

Accepted

## Date

2026-08-10

## Context

The app had no edge-level rate limiting. The only protection against brute force, scraping, and
abuse was an application-level limiter (`src/modules/integrations/rate-limit/rate-limiter.ts`)
backed by `@upstash/ratelimit` + `@upstash/redis`, invoked from inside Vercel Functions — i.e.
*after* a request had already consumed a Vercel invocation. Requirement: move rejection of abusive
traffic in front of Vercel using Cloudflare, and remove the Upstash/Redis dependency.

### DNS was not proxied

`culprit.wyco-dev.com` (the app's production domain — confirmed with the project owner; the
alternative was Vercel's own `culprit-web.vercel.app`, which is outside any Cloudflare zone and
categorically cannot carry Cloudflare WAF protection) was DNS-only (`proxied: false`) in the
`wyco-dev.com` Cloudflare zone. Cloudflare had zero visibility into this app's traffic — every
request went straight to Vercel. **Fixed**: the DNS record was switched to proxied
(`proxied: true`), confirmed with the project owner first since it changes live TLS/routing for
production traffic.

### Verified plan and quota (live API, not memory)

Zone `wyco-dev.com` is on Cloudflare's **Free Website** plan (`plan.legacy_id: "free"`, confirmed
via `GET /zones`). Verified against current Cloudflare documentation
(`/waf/rate-limiting-rules/`, `/waf/reference/legacy/old-rate-limiting/` — quota table carried
over from the previous rate-limiting product to the current Ruleset-Engine-based one):

| Plan | Rate Limiting Rules per zone | Actions | Request period | Mitigation duration |
|---|---|---|---|---|
| **Free** | **1** | Block only | 10s or 1min (docs) | 1min or 1hr (docs) |
| Pro | 10 | + Challenge actions | 10s or 1min | 1min or 1hr |
| Business | 15 | + more | + 10min | + 24hr |

**Correction, verified live in the dashboard (2026-08-11):** on this account's Free plan, the
period and mitigation-duration dropdowns are not selectable at all — both are **locked to 10
seconds**, not the 10s/1min and 1min/1hr choices the docs describe. The docs table appears to
describe entitlement ceilings that don't all surface as actual dashboard choices on every Free
zone. Treat the dashboard as authoritative over the docs when they disagree — this ADR now
reflects the dashboard-confirmed values, not the originally planned ones.

A Free-plan Rate Limiting Rule Block action returns `429` by default (custom response
bodies/status codes are Pro+ only — not used here, default response accepted).

**One rule per zone is a hard product ceiling**, not a configuration choice. This app has more
than one traffic category worth protecting, so a single WAF rule cannot be the only control —
confirmed via docs before designing around it, per the task's "verify before assuming" requirement.

### Actual route inventory (audited, not assumed)

Contrary to a generic CRUD app, this codebase has very few truly public, unauthenticated, mutating
endpoints:

- `POST /api/auth/sign-in/email` — Better Auth login (single admin; `disableSignUp: true`, so
  there is no public registration surface at all).
- `POST /api/turnstile/verify` — public, ungates the Calendly widget; not a form submission, writes
  nothing; tokens are single-use.
- Every `/api/admin/**` route (groups, publications, research, team-members, settings,
  appointments, profile) requires an authenticated Better Auth admin session already.
- Every public `GET` route (`/api/events/upcoming`, `/api/groups`, `/api/profile`,
  `/api/publications`, `/api/research`, `/api/team-members`) is ISR-cached
  (`export const revalidate`, see ADR-007) and must not be rate-limited — the CDN/Vercel cache
  should absorb that traffic, not get routed around it.
- `guardPublicWrite` exists but is unused by any route today (vestigial from a removed
  appointment-request flow, per ADR-004) — out of scope.

This means the "which single category gets the one WAF rule" question has an unambiguous answer:
**credential brute force against the one admin login is the highest-severity, lowest-cost-to-fix
target** — a compromised admin account is a full site compromise; nothing else in this app reaches
that severity.

### Cloudflare API token scope gap

The connected Cloudflare API credential can read/write DNS records (`#dns_records:edit`) but
returned `9109: Unauthorized` on `GET /zones/{id}/settings/ssl` and
`GET /zones/{id}/settings/bot_fight_mode`, and `10000: Authentication error` /
`"request is not authorized"` on both `GET` and `PUT` to
`/zones/{id}/rulesets/phases/http_ratelimit/entrypoint` and
`/zones/{id}/rulesets/phases/http_request_firewall_custom/entrypoint` — despite the zone's listed
account permissions including `#waf:edit`/`#waf:read`. The token's actual grant is narrower than
the account's available permissions. **The WAF Rate Limiting Rule, SSL/TLS mode, and Bot Fight
Mode could not be configured via API in this session** — see Consequences for the manual steps
required and exact configuration to apply.

## Decision

**Architecture** (Free-plan-native, no Redis, no Worker):

```
User
  -> Cloudflare (proxied culprit.wyco-dev.com)
       -> WAF Rate Limiting Rule (the one Free-plan slot):
            POST /api/auth/sign-in/email, 5 req / 10s per IP, Block, 10s mitigation
            (period/duration are dashboard-locked to 10s on this Free zone -- see Context)
            -> exceeded -> 429 (native Cloudflare response, request never reaches Vercel)
       -> allowed
            -> Vercel -> Next.js middleware (defense-in-depth, in-memory, IP-keyed):
                 - POST /api/auth/sign-in/email again (5 req/60s) - catches anything that
                   reaches Vercel if the edge rule is ever disabled/misconfigured
                 - mutating methods on /api/admin/** (~30 req/60s) - blunts abuse of a
                   stolen/replayed admin session cookie; authorization itself is unaffected,
                   Better Auth's session check is still the real gate
            -> API -> Supabase/DB
       -> public GET /api/* routes pass through untouched - no Cloudflare rule, no
          middleware match - the existing Vercel ISR cache (ADR-007) absorbs this traffic
          exactly as before
```

1. **One Cloudflare WAF Rate Limiting Rule** (the Free-plan maximum), protecting
   `POST /api/auth/sign-in/email`, IP-keyed, 5 requests/10s, Block, 10s mitigation timeout
   (period and duration are dashboard-locked to 10s on this Free zone; not configurable to the
   1min/1hr originally planned — see Context). Still genuinely pre-Vercel: a blocked request
   never leaves Cloudflare's edge. A 10s ban re-triggers immediately on the next burst, so
   sustained brute force stays throttled to ~5 attempts/10s indefinitely, not just for one
   window — weaker than a 1hr ban but non-trivial, and it's what Free actually allows.
2. **No second Cloudflare Rate Limiting Rule** — Free plan doesn't have one to spend. Considered
   and rejected: upgrading to Cloudflare Pro ($20/mo) for 10 rules — out of scope for a
   free-tier-only project without a demonstrated traffic problem justifying the cost.
3. **No Cloudflare Worker.** Evaluated per the task's own priority order (WAF rules -> other
   native features -> Worker -> app-level) and rejected: the two remaining categories
   (`turnstile/verify`, admin mutations) are both already defended by something other than rate
   limiting — `turnstile/verify` issues single-use tokens and calls Cloudflare's own
   siteverify (itself abuse-resistant), and every admin route requires a valid Better Auth
   session. A Worker's marginal benefit over an in-process fallback (extra deploy artifact, extra
   secrets surface, extra request hop even for pass-through traffic) isn't justified at this
   traffic scale (single admin, personal academic site) for risks that are already mitigated
   elsewhere. Documented explicitly per the task's Step 11 requirement rather than silently
   skipped.
4. **Upstash removed entirely** — `@upstash/ratelimit`, `@upstash/redis`, and both
   `UPSTASH_REDIS_REST_*` env vars are gone. Replaced with `InMemoryRateLimiter` (fixed-window,
   in-process `Map`), wired unconditionally into `getRateLimiter()` — no external credential to
   gate on anymore. This is explicitly the *fallback* layer, not primary: the primary control for
   the highest-risk route (login) is the Cloudflare edge rule in front of it. Per-instance memory
   is a known, accepted limitation given the traffic profile (see Consequences).
5. **`Next.js` Edge Middleware** (`src/middleware.ts`) applies the in-memory limiter to exactly two
   route groups (`/api/auth/:path*` matched down to the sign-in method, `/api/admin/:path*`
   restricted to mutating methods) — scoped via `matcher` so it never runs on public cached GET
   routes, preserving the existing cache architecture untouched.
6. **Bot Fight Mode and SSL/TLS mode**: recommended, both free-plan features, but **not applied** —
   blocked by the API token scope gap above. See Consequences for the manual dashboard steps.

## Consequences

- Login brute force is genuinely stopped before it reaches Vercel — the single highest-value
  outcome available on Cloudflare's Free plan, verified against the real quota rather than an
  assumed one.
- `turnstile/verify` and `/api/admin/**` get defense-in-depth, not edge-level protection. This is
  an accepted, documented gap: neither is undefended (Turnstile siteverify; Better Auth session),
  and closing it further would mean either a paid Cloudflare plan or a Worker whose cost isn't
  justified by this app's actual risk profile. Revisit if traffic/threat profile changes.
- The in-memory fallback limiter resets on cold start and doesn't share state across concurrent
  Vercel instances/regions — weaker than Redis-backed limiting, deliberately accepted per the "no
  Redis solely for rate limiting" requirement and the low-volume, single-admin traffic profile.
- Public GET API routes are unaffected — no new rule or middleware touches them; ADR-007's caching
  behavior is unchanged.
- **Manual follow-up required** (blocked by API token scope, not a technical limitation of the
  plan): in the Cloudflare dashboard for `wyco-dev.com`,
  1. **Security > Security rules > Create rule > Rate limiting rules**: name it, expression
     `(http.request.uri.path eq "/api/auth/sign-in/email") and (http.request.method eq "POST")`,
     characteristic IP, 5 requests (period and mitigation-duration fields are locked to 10s on
     this zone — not editable), action Block, "Also apply rate limiting to cached assets" off
     (`requests_to_origin`-equivalent) — deploy.
  2. **SSL/TLS > Overview**: confirm mode is **Full** or **Full (strict)** (Vercel serves a valid
     cert, so either works) — do not leave it on **Flexible**, which would have Cloudflare talk to
     Vercel over plain HTTP and can create a redirect loop with Vercel's own HTTPS enforcement.
  3. **Security > Settings > Bot traffic > Bot Fight Mode**: turn on (free, zone-wide, no
     configuration surface — challenges known-bot request patterns; broad complement to the
     path-specific WAF rule, costs nothing, no rule-quota impact).
  Once done, verify with `curl -i` against `/api/auth/sign-in/email` (6th rapid request in under a
  minute should return `429` with a `Retry-After` header) and confirm a normal page load still
  works (SSL mode regression check).
- If the API token's Cloudflare permission scope is later widened to include Zone Settings and
  WAF/Rulesets edit, the rule/settings above can be applied programmatically instead — flag this
  to revisit if convenient.

## Supersedes / Superseded by

Does not supersede any prior ADR. Removes the Upstash rate-limiting adapter that ADR-007's
"Considered and rejected" section referenced only to draw a scope boundary around app-level
caching — that reference is now stale in the sense that the adapter itself is gone, but ADR-007's
own decision (no app-level cache via Redis) is unaffected and unchanged.
