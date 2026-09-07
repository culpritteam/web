---
status: superseded
source_of_truth: false
last_updated: 2026-09-06
superseded_by: ADR-014
related_modules: [shared]
related_decisions: [ADR-008, ADR-013, ADR-014]
---

# ADR-009: Drop Vercel, self-hosted VPS is the sole deployment target

## Status

**Superseded by [ADR-014](ADR-014-hosting-and-service-split.md) on 2026-09-06.**

The decision below no longer describes the plan. The VPS serves staging, and Vercel is the intended
production target, built from the `culpritteam/web` mirror — though **production is not deployed
yet**, so the VPS remains the only running environment. The context section stays accurate as a
record of what was true on 2026-08-12, which is why this file is kept rather than deleted.

Original status: Accepted

## Date

2026-08-12

## Context

Earlier the same day, the self-hosted Docker/VPS pipeline (see
[docker-vps.md](../deployment/docker-vps.md)) went live for the first time, running alongside the
existing Vercel deployment — both served the same codebase, documented at the time as two
supported targets (see `docker-vps.md`'s original framing, "an alternative deploy target alongside
Vercel").

That dual-target setup was short-lived. The project owner decided to drop Vercel entirely and run
the self-hosted VPS as the only deployment target.

## Decision

Vercel is no longer a supported or documented deployment target. The self-hosted VPS (Docker
container, built and pushed by CI, pulled and run by `scripts/deploy.sh`, behind Cloudflare and
Caddy) is the sole platform.

Current-state documentation was updated to reflect this: `README.md`, `DEPLOYMENT.html`,
`TECH_STACK.md`, `DEVELOPMENT_PROGRESS.html`, `HOSTING_COST.html`,
`docs/architecture/overview.md`, `docs/deployment/deployment.md`, `docs/deployment/docker-vps.md`,
and `docs/requirements/non-functional-requirements.md` no longer mention Vercel as a live option.

`PROJECT_SPEC.md`/`.html` keep a struck-through, dated note under §14.1 rather than deleting the
mention outright — consistent with this project's existing convention for a superseded technology
choice (the same pattern used for ~~Supabase Storage~~ in [ADR-002](ADR-002-object-storage-r2.md)).

ADR-001, ADR-007, and ADR-008 still mention Vercel in their own text. Those are **not** edited by
this ADR: each is a dated historical record of a decision made while Vercel was genuinely part of
the live architecture, and rewriting them would misrepresent what was actually true at the time.
This ADR is the marker that the Vercel-adjacent statements in those three documents describe a
past state, not the current one.

## Alternatives considered

**Keep both targets.** Rejected — running two live hosts for a single-admin, low-traffic personal
site is maintenance overhead (two sets of environment variables, two places a deploy can fail,
two things to keep in sync) with no corresponding benefit once the VPS pipeline was proven
working.

## Consequences

- One deployment target, one pipeline, one place to look when something's wrong.
- `docs/deployment/deployment.md` (previously Vercel-specific: platform section, connection
  pooling framed around serverless function behavior) was rewritten to describe the VPS instead;
  its still-relevant platform-agnostic content (build command, migrations, security headers,
  backups, observability, cost constraint) was kept.
- Historical ADRs (001, 007, 008) are left as-is and remain the accurate record of what was true
  when each was written.

## Supersedes / Superseded by

**Superseded by [ADR-014](ADR-014-hosting-and-service-split.md).**

Did not supersede any prior ADR outright. It narrowed the deployment-target scope that ADR-001,
ADR-007 and ADR-008 each assumed when they were written. ADR-014 widens it again to two supported
targets.
