---
status: current
source_of_truth: true
last_updated: 2026-08-08
related_modules: [integrations, profile]
related_decisions: [ADR-001]
---

# ADR-002: Object storage — Cloudflare R2 (supersedes Supabase Storage)

## Status

Accepted (supersedes an earlier accepted decision — Supabase Storage — made 2026-08-05)

## Date

2026-08-08

## Context

Object storage was always architecturally separate from the relational database — the data model
(`Profile.photoUrl`, `TeamMember.photoUrl`) only ever stores a URL/reference, never binary data,
per the standing project convention "never store binaries in Postgres; serve from an object
store/CDN, not through the app process" (documented in
the original implementation guide, "Secure file uploads"). That
separation itself isn't dated to a specific decision — it's the default assumption in every
version of the architecture diagram — so treat "why is storage separate from the DB at all" as
**reason not documented beyond that general principle**.

The concrete *provider* was Supabase Storage from 2026-08-05 (adopted alongside Supabase Postgres,
as part of the same account/dashboard). A hosting-cost review (`HOSTING_COST.html`, dated
2026-08-07) found that Supabase Storage's **free tier caps egress at 5GB/month**, which becomes
the site's binding bottleneck at roughly **~650 visitors/day** — well within plausible growth even
though expected load was ~100/day at the time.

## Decision

Switch object storage to **Cloudflare R2**. R2 never charges for egress at all, removing the
bottleneck entirely. The database is unaffected — Prisma still talks to Supabase Postgres directly
via `DATABASE_URL`; only the object store moved. See
[architecture/storage.md](../architecture/storage.md) for the resulting layout (one bucket, folder
prefixes, `getPublicUrl`/`getSignedUrl` split).

`R2_PUBLIC_URL` deliberately uses the bucket's free `pub-<hash>.r2.dev` dev URL, not a custom
domain on the project's own domain: that domain's DNS zone lives in a different Cloudflare account
than the one holding the R2 bucket, so a custom-domain public URL would need a CNAME coordinated
across two separate account logins. The `.r2.dev` URL needs no DNS at all.

## Alternatives considered

- **Keep Supabase Storage** — rejected once the hosting-cost review quantified the egress
  bottleneck; free tier growth headroom did not match expected/plausible traffic.
- **Buy a custom domain for R2** now, to get a branded public URL — deferred (see open question
  OQ7 in `requirements/scope.md`); independent of this decision and not required to ship it.

## Consequences

- Egress is unbounded on the free tier — the original scaling risk is gone.
- **Lost:** Supabase Storage's per-bucket RLS policies. R2 has no equivalent per-prefix ACL, so
  the public/private split (`profile`/`research`/`publications`/`events` public,
  `documents` private) is enforced **entirely by application code** — which method the app calls
  (`getPublicUrl` vs `getSignedUrl`), not by a storage-side policy. Accepted as a low-risk
  simplification for a single-admin, low-traffic site; revisit if that assumption changes.
- Two separate cloud accounts (Supabase for DB, Cloudflare for storage) instead of one — a minor
  operational cost, accepted for the egress-cost win.

## Supersedes / Superseded by

Supersedes the 2026-08-05 decision to use Supabase Storage (recorded in `PROJECT_SPEC.md §14.1`
as "Option A, storage" prior to this rewrite).
