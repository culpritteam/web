---
status: superseded
superseded_by: ADR-011
source_of_truth: false
last_updated: 2026-09-01
related_modules: [events]
related_decisions: [ADR-005, ADR-011]
---

> **Superseded on 2026-09-01 by [ADR-011](ADR-011-events-replace-appointments.md).** The
> appointment feature described below no longer exists: the `appointment` table, its module and its
> admin screen were removed and replaced by `Event`. This file is retained as the record of how the
> feature shrank before it was removed — do not build against it.

# ADR-004: Appointment workflow — admin-declares-directly (supersedes the request/approve/decline/book queue)

## Status

Accepted (supersedes an earlier accepted design, in place through 2026-08-05)

## Date

2026-08-08

## Context

The original design (customer-requested per the first customer meeting minutes
and `se-min-002-team-meeting-1.md`) had visitors submit an appointment **request**, which the
admin would **approve** or **decline**; on approval the admin manually booked the meeting in
Calendly and marked it **booked**; every transition sent a notification email. This required a
five-state machine (`pending → approved → booked`, `pending → declined`, `{approved,booked} →
cancelled`), a `notifications` module, `source`/`calendlyEventRef`/`cancelToken` fields on
`Appointment`, and a visitor self-cancel flow via unguessable token.

On review, this queue never had a real second entry point: the only way to *actually* book a
meeting was either (a) the visitor using the embedded Calendly widget directly, which the review
queue could never intercept or sync with (no Calendly plan exposes booking-creation or reliable
webhook access — see [ADR-005](ADR-005-calendly-embed-only.md)), or (b) the admin creating the
appointment by hand regardless of whether a "request" existed. The review queue added a full state
machine, an email-notification module, and a token-based visitor flow to broker between two things
that never actually needed brokering.

## Decision

**Remove the review queue entirely.** An `Appointment` row exists in this app **only** because the
admin typed it in directly, via **Manage Appointments → Add**. The only remaining lifecycle
transition is `scheduled → cancelled` (reason required). Visitors booking through the Calendly
embed never touch this app's data at all — if that meeting should be visible here (e.g. on the
public Upcoming Events tab), the admin re-enters it manually.

## Alternatives considered

- **Keep the review queue, drop only the Calendly sync** — rejected: without a real second entry
  point to broker, `pending`/`approved`/`declined` add process overhead (the admin still has to
  manually create every real appointment either way) without adding a capability.
- **Build a public request form that just emails the admin (no DB row until approved)** — not
  pursued; not recorded as seriously evaluated in the available project history.

## Consequences

- Deleted: the `notifications` module, the `AppointmentSource`/`calendlyEventRef`/`cancelToken`
  fields, the `pending`/`approved`/`declined`/`booked` enum values, four admin actions
  (approve/decline/book + the old cancel), and every appointment-status notification email.
- `EmailClient`/Resend infra remains in `integrations/` — reserved for other future admin-facing
  features, with zero current callers.
- Requirement IDs FR-7, FR-8, FR-9, FR-11, FR-18, FR-19, FR-20, FR-23 (original spec) no longer
  apply — see `requirements/functional-requirements.md`.
- The customer-approved minutes (SE-MIN-001 REQ-F-005: "request or book", implying approval) are
  now **conflicted** with the shipped app until the customer signs an amended requirement — see
  the first customer meeting minutes, "conflict resolution 2026-08-08". This ADR
  does not resolve that customer-facing conflict; it only records the engineering decision that
  was made and why the spec side is being treated as current.

## Supersedes / Superseded by

Supersedes the review-queue design recorded (as history) in `PROJECT_SPEC.md §5.2/§5.4/§7.1/§10.1`
and in the original implementation guide (which still
describe the five-state machine — those skill docs were not updated after this ADR; see
[Known contradictions](../README.md#known-contradictions--gaps)).
