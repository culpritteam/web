---
status: current
source_of_truth: true
last_updated: 2026-09-06
related_modules: [auth, events, integrations, shared]
related_decisions: [ADR-002, ADR-003, ADR-005, ADR-008, ADR-009, ADR-013]
---

# ADR-014: Hosting split and the internal/external service boundary

## Status

Accepted

## Date

2026-09-06

## Context

Two things needed writing down.

First, [ADR-009](ADR-009-vercel-dropped.md) records that Vercel was dropped and the VPS was the
only deployment target. That no longer matches the plan: the VPS serves staging, and Vercel is the
intended production target, though production is not deployed yet.
[ADR-013](ADR-013-doppler-secrets-across-environments.md) already noted the contradiction in
passing; this ADR resolves it.

Second, the choice of which capabilities we write ourselves and which we buy in was made across
several conversations and never recorded in one place. Each individual decision has an ADR
(storage, auth, scheduling, rate limiting) but the *reasoning that ties them together* — customer
requirements, hosting budget, and what each service is actually protecting us from — was only in
people's heads.

## Decision

### Hosting

| Environment | Platform | Serves | State |
|---|---|---|---|
| Local | Developer machine | Development | Running |
| Staging | Docker container on the VPS, behind Cloudflare and Caddy | Team review and customer approval | Running |
| Production | Vercel, from the `culpritteam/web` mirror | The live site | **Planned. Not deployed.** |

Local and staging share Supabase PostgreSQL and Cloudflare R2.

Production is the intended target but is not built. The mirror repository exists and is kept in
sync so the deployment can be created later; nothing is currently served from it. Every statement
about production in this ADR describes intent, not a running system.

Hosting must stay within the plans the project already pays nothing extra for. Where a capability
would push a service past its included allowance, we design around it rather than upgrade. That
constraint is what produced most of the decisions below.

Cloudflare sits in front of both deployed environments as CDN and cache. Caching is deliberately
aggressive so that fewer requests reach the origin, which keeps the app inside the included
request allowance on both Vercel and Supabase.

### Internal versus external

| Capability | Choice | Reason |
|---|---|---|
| Bot protection on the booking page | External: Cloudflare Turnstile | Calendly provides no bot protection on the plan we use, and the widget is the one public surface a script could flood with junk bookings. See [ADR-005](ADR-005-calendly-embed-only.md). |
| Authentication | External library, internal session store: Better Auth with our own cookies | One stored user (the admin). Better Auth is lighter than Supabase Auth and avoids a second hard dependency on one vendor. Sessions live in our own tables, so revoking one is a row delete. See [ADR-003](ADR-003-authentication.md). |
| Rate limiting and login hardening | Cloudflare WAF rule, plus an in-process limiter in `src/middleware.ts` | The edge rule blocks abuse before it reaches the origin; the in-app limiter covers direct hits. Better Auth's own rate limiting is **not** configured — see the correction note below. See [ADR-008](ADR-008-cloudflare-rate-limiting.md). |
| Event photos | External: Cloudflare R2 | Events store many images. R2 has no edge-request limit, where serving them through Supabase would consume its edge allowance. See [ADR-002](ADR-002-object-storage-r2.md). |
| Event video | External: YouTube embed, ID stored only | Video is large and unpredictable in size. Storing it in R2 would eventually pass the included allowance and cost money. YouTube costs nothing and brings its own player, captions and keyboard support. |
| Email | External: Resend, wired but unused | Available with an API key once the customer supplies a domain. The likely first use is an OTP as a second factor on admin login, if the customer asks for it. Not built. |
| Domain and service credit | Supplied by the customer | Turnstile and R2 both remain within their included allowances at the expected traffic, so neither adds cost. |

### Correction to ADR-009

ADR-009's decision — "Vercel is no longer a supported or documented deployment target" — is
**superseded by this ADR**. The VPS is staging and is running. Vercel is the intended production
target and is not deployed yet.
[ADR-013](ADR-013-doppler-secrets-across-environments.md) describes how configuration reaches
local and staging; production will not use Doppler.

ADR-009's *context* is left intact as the record of what was true on 2026-08-12.

## Alternatives considered

**Supabase Auth instead of Better Auth.** Rejected for now. It would put row-level security in the
database, which is stricter, but it adds a second large dependency on one vendor for a site with a
single account. The seam is one function (`requireAdmin()`), so the move stays cheap if a second
account is ever added — see the SDS, "Swapping the auth provider later".

**Storing video in R2.** Rejected: video size is unpredictable and would be the one thing likely to
pass the included storage allowance.

**Serving event photos from Supabase storage.** Rejected: it consumes the same edge-request
allowance the application itself needs.

**Upgrading a plan to remove a constraint.** Rejected as a standing rule. A capability that only
works on a paid tier is designed around instead.

## Consequences

- Local and staging read one shared Doppler config, so there is one place to edit a value.
- Production, when it is built, takes its variables from the host's own settings. Doppler is not
  used there, and no `prd` config is maintained.
- Aggressive caching is load-bearing, not just a speed optimisation: it is what keeps origin
  requests inside the included allowances.
- The app depends on Cloudflare for three separate jobs — CDN, bot check and rate limiting. A
  Cloudflare outage degrades more than one thing at once.
- Documents that describe the VPS as the only target are wrong and must cite this ADR instead:
  `docs/deployment/deployment.md`, `docs/architecture/overview.md`, and `CLAUDE.md`'s deployment
  table.

## Supersedes / Superseded by

Supersedes the **decision** in [ADR-009](ADR-009-vercel-dropped.md). Does not supersede its
context. Extends [ADR-013](ADR-013-doppler-secrets-across-environments.md) with the hosting split
that ADR assumed.
