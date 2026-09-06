---
status: current
source_of_truth: true
last_updated: 2026-09-01
related_modules: [events, appointments, integrations]
related_decisions: [ADR-004, ADR-005, ADR-010]
---

# ADR-011: Events replace admin appointments entirely

## Status

Accepted

## Date

2026-09-01

## Context

[ADR-004](ADR-004-appointment-workflow-admin-only.md) cut the appointment feature down to a single
path: an appointment existed only because the admin typed it into "Manage Appointments", and its
only purpose beyond the admin's own record-keeping was feeding the public "Upcoming Events" tab.
[ADR-010](ADR-010-appointment-hard-delete-reschedule-per-appointment-visibility.md) then added
delete, reschedule and a per-row `isPublic` flag so the admin could choose which of those meetings
appeared publicly.

What was left was a scheduling data model doing a publishing job badly. The public tab could only
ever show a name, a research group and a time — that is all an `Appointment` row holds — so an
event with a description, photographs or a recording could not be published at all. The lifecycle
(`scheduled`/`cancelled`, 409 on illegal transitions), the reschedule action and the `isPublic`
toggle were all machinery for meetings, and none of it earned its keep for content whose only real
question is "has this happened yet?".

Meanwhile the actual booking flow had already moved off the app entirely: per
[ADR-005](ADR-005-calendly-embed-only.md), a visitor books through the Calendly embed and nothing
about that booking is ever recorded here.

## Decision

Remove appointments outright and replace them with a plain `Event` content type.

1. **`Event` model** — `title`, `description`, `eventDate`, `photoUrls: String[]`,
   `videoUrls: String[]`. No status, no lifecycle, no per-row visibility flag. Media are native
   Postgres text arrays rather than `Json`: they are flat lists of URLs with no internal structure.
2. **`eventDate` alone decides upcoming vs past**, evaluated at render time (`splitByTiming`).
   Nothing is stored, because a stored flag would be wrong the moment the clock passed the date
   with nobody editing.
3. **Every event is public.** There is no draft state and no visibility toggle to keep in sync.
4. **Photos** are uploaded to the existing R2 `events` bucket via `POST /api/admin/events/photo`,
   one random object key per upload. **Videos are YouTube embeds only** — an event stores a parsed
   11-character video ID, never an uploaded video file (see the project's free-tier rule; the
   previously unused `integrations/youtube` module is what renders them).
5. **The `appointment` table and `AppointmentStatus` enum are dropped**, and every appointment row
   with them. The public **Make Appointment** tab and its Calendly embed are untouched.
6. **`/api/events/upcoming` becomes `/api/events`**, returning both halves.

## Alternatives considered

- **Keep `Appointment` and add media columns to it** — rejected: it would leave a status enum, a
  cancel reason, a requester email and a reschedule endpoint on a row that no longer models a
  meeting with anyone. The lifecycle was the thing being removed, not the storage.
- **Migrate appointment rows into `event`** — rejected: an appointment's public fields (a person's
  name and their research group) are not an event's, so every migrated row would need manual
  rewriting anyway, and the private ones (`isPublic: false`) were never meant to be published at
  all. The customer asked for the data to go with the feature.
- **Direct video upload to R2** — rejected: R2's free tier is 10 GB, a route handler is the wrong
  place to stream large media through, and YouTube embedding costs nothing and already had a
  module sitting unused.
- **A `draft`/`published` flag on events** — rejected as the same mistake in a new place. A
  single-admin site publishes by saving.

## Consequences

- **Irreversible data loss, by request.** The migration drops `appointment` with no export step.
  The `AuditLog` rows for those appointments are deliberately left in place as the only remaining
  record that they existed.
- The previous appointment-lifecycle rules (service-enforced transitions, 409 on illegal
  transitions, soft cancel vs hard delete) no longer apply to anything — there is no lifecycle left
  in the codebase.
- `src/modules/shared/ui/status-pill.tsx` is deleted; it existed only for appointment status and
  had no other caller.
- The public tab is renamed from "Upcoming Events" to **Events**, since it now shows past events
  too. Its route (`/events`) is unchanged.
- The admin dashboard's "Public on the site" panel is replaced by "Events still to come" — with no
  visibility flag, the meaningful ratio is how much of the list is still ahead.
- `next.config.ts`'s CSP gains `https://www.youtube-nocookie.com` in `frame-src`.
- Deleting an event does not delete its uploaded photos from R2. Orphaned objects are the accepted
  failure mode on a single-admin site with a 10 GB free tier; a delete-on-removal path would have
  to be transactional with the row update to avoid orphaning live URLs.

## Supersedes / Superseded by

Supersedes [ADR-004](ADR-004-appointment-workflow-admin-only.md) and
[ADR-010](ADR-010-appointment-hard-delete-reschedule-per-appointment-visibility.md) in full: both
describe a feature that no longer exists. They are retained as historical record of why the
appointment feature shrank the way it did before it was removed.

Does not affect [ADR-005](ADR-005-calendly-embed-only.md): Calendly stays embed-only, and the Make
Appointment tab is unchanged. What changes is where a booking worth publishing goes — the admin
writes it up as an event rather than re-typing it as an appointment.
