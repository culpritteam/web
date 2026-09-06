---
status: superseded
superseded_by: ADR-011
source_of_truth: false
last_updated: 2026-09-01
related_modules: [events]
related_decisions: [ADR-004, ADR-011]
---

> **Superseded on 2026-09-01 by [ADR-011](ADR-011-events-replace-appointments.md).** Hard delete,
> reschedule and per-appointment `isPublic` all described a feature that has since been removed
> outright. The `Setting` model deletion recorded here still stands. Retained as history.

# ADR-010: Appointment hard-delete, reschedule, and per-appointment `isPublic` (replaces `Setting`)

## Status

Accepted

## Date

2026-08-13

## Context

Since [ADR-004](ADR-004-appointment-workflow-admin-only.md), an appointment's only lifecycle
transition was `scheduled → cancelled`, and records were never hard-deleted. In practice, admins
accumulated cancelled test/duplicate/mistaken rows with no way to remove them, and correcting a
meeting's time meant cancelling and re-creating (losing the original record's continuity and
`created_at`). Separately, "Upcoming Events" visibility was a single global `Setting` row
(`upcoming_events_visible`) — an all-or-nothing switch with no way to show only some meetings
publicly.

## Decision

1. **Hard delete.** Admin can permanently delete an appointment (`DELETE
   /api/admin/appointments/{id}`), any status. `AuditLog` captures the full before-state before
   the row is removed. This is a separate, explicit, audited admin action — not a lifecycle
   transition, so it carries no status restriction (unlike cancel/reschedule, which only apply to
   `scheduled` rows).
2. **Reschedule.** New lifecycle transition `scheduled → scheduled` via `POST
   /api/admin/appointments/{id}/reschedule`, changing `scheduledAt` only. `409` if the appointment
   isn't currently `scheduled` (e.g. already cancelled). Audited.
3. **Per-appointment visibility.** `Appointment.isPublic: boolean` (default `false`) replaces the
   global `Setting.upcoming_events_visible` toggle. Admin flips it per row via `PATCH
   /api/admin/appointments/{id}/visibility`. The public Upcoming Events query surfaces
   `scheduled` rows with `isPublic = true`.
4. **`Setting` model deleted.** The `settings` module and its one route (`PUT
   /api/admin/settings`) are removed entirely — there is no remaining setting for it to hold.

## Alternatives considered

- **Soft-delete flag instead of hard delete** — rejected: the admin explicitly wants garbage rows
  gone, and `cancelled` already serves as the retained/soft state; a second soft-delete flag would
  duplicate that purpose.
- **Keep global visibility, add per-row override** — rejected as unnecessary complexity once every
  appointment already carries its own `isPublic`; a global flag on top would just be another state
  to keep in sync.

## Consequences

- The previous "records are never hard-deleted" rule is reversed for this specific,
  audited admin action; cancel (soft) and delete (hard) now coexist as distinct actions.
- FR-22 (PROJECT_SPEC.md) rewritten to describe both cancel and delete.
- FR-16 (toggle Upcoming Events visibility) moves from a global admin setting to a per-appointment
  toggle (FR-16b); FR-16a already read "removed" from the ADR-004-era slot-duration cut, no
  renumbering needed.
- `docs/architecture/database.md`'s `Setting` model row and `Appointment` shape are stale as of
  this ADR — updated in the same change as this ADR.

## Supersedes / Superseded by

Amends (does not supersede) ADR-004: the `scheduled → cancelled` transition and admin-only
creation model from ADR-004 stand; this ADR adds delete, reschedule, and per-row visibility on top.
