---
status: current
source_of_truth: true
last_updated: 2026-08-08
related_modules: [integrations, events]
related_decisions: [ADR-004]
---

# ADR-005: Calendly integration — embed-only (supersedes the server-side REST/webhook integration)

## Status

Accepted (supersedes an earlier accepted decision — a server-side REST + webhook integration —
adopted 2026-08-02 and removed 2026-08-08)

## Date

2026-08-08 (original embed-only stance restored; the intervening REST integration ran
2026-08-02 → 2026-08-08)

## Context

The customer's only scheduling requirement was to match her existing public Calendly page
(first customer meeting minutes, §4.1/§8`). Between 2026-08-02 and
2026-08-08 the project briefly adopted a server-side Calendly REST integration: a
PAT-authenticated client reading event types/events/availability, an admin cancel-with-sync
action, and a signature-verified webhook receiver intended to auto-record bookings made in the
widget.

That design's core premise didn't hold on Calendly's **Free** plan: **webhook subscriptions
require the Standard tier or above** — the Free plan has no webhook access on any tier, not even a
limited one. A receiver that can never actually be subscribed on the project's plan isn't a
partial win; per project constraint ("free-tier-only, deliberately"), every
third-party service must stay usable on its free tier.

## Decision

**Embed-only.** `calendly-embed.tsx` renders Calendly's hosted widget from
`NEXT_PUBLIC_CALENDLY_URL` — a client-side `<iframe>`, nothing else. Remove the server-side
integration outright: no PAT, no REST client, no webhook receiver, no `calendlyEventRef`-style
metadata field. A booking made in the widget is never recorded in this app; if it should appear on
the public Events tab, the admin writes it up there as an event by hand (see
[ADR-011](ADR-011-events-replace-appointments.md); before 2026-09-01 this was Manage Appointments,
[ADR-004](ADR-004-appointment-workflow-admin-only.md)).

## Alternatives considered

- **Keep the REST client for read-only availability display, drop only the webhook receiver** —
  rejected: without the webhook, there was no way to auto-record a direct booking anyway, so the
  read-only surface added maintenance cost (a PAT to manage, an API to keep working) without
  closing the loop it was built for.
- **Upgrade to Calendly's paid Standard tier** for webhook access — rejected; the project is
  free-tier-only by deliberate constraint, and no Calendly plan at any price exposes a
  booking-*creation* API, so paying for webhooks still wouldn't have enabled full sync (only
  cancellation/read visibility).

## Consequences

- Zero Calendly API surface to maintain, zero token to rotate or leak.
- No live availability data or booking metadata ever reaches this app automatically — the admin is
  the sole source of truth for what appears on the public site. Since 2026-09-01 that means the
  admin Events screen ([ADR-011](ADR-011-events-replace-appointments.md)).
- `src/modules/integrations/calendly/README.md` documents this rationale in the codebase itself,
  co-located with the embed component.
- The original implementation guide still describes only the
  embed-only design and never documented the intervening REST/webhook period — no contradiction
  there, but see [Known contradictions](../README.md#known-contradictions--gaps) for the other
  skill-doc drift.

## Supersedes / Superseded by

Supersedes the 2026-08-02 server-side REST + webhook integration (`PROJECT_SPEC.md §8.2a/§14.2`
record it as removed history). Restores, and is consistent with, the original 2026-07 design
intent described in the first customer meeting minutes §3` ("she pointed us to
Calendly as the model to follow").
