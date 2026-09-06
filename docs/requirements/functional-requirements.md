---
status: current
source_of_truth: false
last_updated: 2026-09-06
related_modules: [profile, research, publications, research-groups, events, teaching, auth]
related_decisions: [ADR-005, ADR-011, ADR-012, ADR-015]
---

# Functional requirements

> **Source of truth:** [PROJECT_SPEC.md §5](../../PROJECT_SPEC.md#5-functional-requirements). This
> page is a distilled, current-only view for quick agent lookup — it drops the strikethrough/removed
> rows the spec keeps for history. Read the spec section for the full removal history and dates.

## Public content (visitor)

| ID | Requirement |
|----|-------------|
| FR-1 | Visitor can view the **Bio** tab: professor photo, name, title, background text. |
| FR-2 *(extended 2026-09-06, [ADR-015](../decisions/ADR-015-attribution-rows.md))* | Visitor can view the **Research** tab: a simple list of research works (title + summary + area), each optionally crediting named contributors — team members, outside collaborators, or both. A work crediting nobody is the professor's own solo work and shows no names. |
| FR-3 *(rewritten 2026-09-06, [ADR-015](../decisions/ADR-015-attribution-rows.md))* | Visitor can view **Publications**: title, authors, venue, year, and an external link. Authors are ordered rows, each either a linked team member or an outside co-author; an entry with no authors is the professor's own solo work and shows no byline. `link` is nullable — shown only when present. |
| FR-4 | Visitor can view **Team Members**, grouped by research group (CV-style: works & achievements). Backed by the relational `TeamMember` entity, not a "Research Groups" tab. |
| FR-5 | Visitor can view the **Events** tab: admin-authored events split into Upcoming and Past by `Event.eventDate` at render time, each with a title, description, photo gallery and YouTube embeds. Every event is public — there is no visibility flag. See [ADR-011](../decisions/ADR-011-events-replace-appointments.md). |
| FR-5a *(new, 2026-09-02, [ADR-012](../decisions/ADR-012-cv-entries-and-courses.md))* | Visitor can view the **Teaching** tab: courses grouped by level (code, title, term, description, optional link), followed by teaching roles and teaching awards. |
| FR-6 | The site is fully readable without any login. |

## Appointments (visitor)

There is **no visitor-facing appointment request form**, and since [ADR-011](../decisions/ADR-011-events-replace-appointments.md) no admin-facing appointment feature either — nothing a visitor books is recorded by this app at all. One visitor-facing appointment behavior exists:

| ID | Requirement |
|----|-------------|
| FR-7a | Visitor can **book directly** against the professor's live availability via the **embedded Calendly** widget, without admin approval. The booking happens entirely on Calendly's side (incl. Calendly's own confirmation email) — nothing about it reaches this app. See [ADR-005](../decisions/ADR-005-calendly-embed-only.md). |
| FR-10 | The **Make Appointment** tab shows the embedded Calendly widget for live availability + direct booking. This is the entire tab — no request form is rendered. Gated by a Turnstile challenge before the embed reveals (see [architecture/backend.md](../architecture/backend.md)). |

## Admin — content management

| ID | Requirement |
|----|-------------|
| FR-13 | Admin can log in via a single admin account. |
| FR-14 *(rewritten 2026-09-02, [ADR-012](../decisions/ADR-012-cv-entries-and-courses.md))* | Admin can edit the **Profile** (name, title, photo, position/affiliation, bio, research statement, LinkedIn/Google Scholar links), Research, Publications, Research Groups, and Team Members via simple forms. The seven CV lists — education, fellowships, scholarships, research interests, invited talks, teaching roles, teaching awards — are now `cv_entry` rows edited one at a time on the **Teaching** screen, not part of the profile document. **Extended 2026-09-06 ([ADR-015](../decisions/ADR-015-attribution-rows.md)):** the Research and Publication forms credit people by picking an existing team member or typing an outside name, with reordering; the list saves with the record rather than separately. |
| FR-14a *(new, 2026-09-02)* | Admin can create, edit and delete **courses** (code, title, level, term, description, link, order) and **CV entries** (section, title, subtitle, year, description, order) on `/admin/teaching`. |
| FR-15 | Each editing form has a clear **"Save changes"** action with success/error feedback. |
| FR-16c | Admin uploads event photos through `POST /api/admin/events/photo` (R2 `events` bucket, 4 MB per file, up to 20 per event) and adds videos by pasting a YouTube link, which is stored as a parsed video ID. No video file is ever uploaded or proxied. |

## Admin — event management

Events are plain published content: no status, no lifecycle, no approval step and no draft state, so nothing here can return `409`. See [ADR-011](../decisions/ADR-011-events-replace-appointments.md).

| ID | Requirement |
|----|-------------|
| FR-17 | Admin sees a table of events: title, date, whether it reads as Upcoming or Past, and how many photos and videos it carries. |
| FR-17a | Admin can **add** an event: title (required), date and time (required, entered as institution-local wall-clock), description (required), photos (optional), YouTube videos (optional). It is public immediately. |
| FR-17b | Admin can **edit** any event, including moving its date, which is what moves it between Upcoming and Past. |
| FR-17c | Admin can **delete** an event. `AuditLog` records the full before-state inside the delete transaction. Uploaded photos are left in R2 — see [ADR-011](../decisions/ADR-011-events-replace-appointments.md). |

## Historical (removed 2026-08-08) — do not implement

These requirement IDs existed in an earlier design and are **not current**. Kept here only so an
agent recognizes them as deliberately removed, not as a gap to fill:

- ~~FR-7~~ — visitor-submitted appointment request form.
- ~~FR-8~~/~~FR-9~~ — `pending`/`booked` status distinction shown to the visitor.
- ~~FR-11~~ — visitor self-cancel via a unique link/token.
- ~~FR-12~~ (original form) — bot-guarding a request form (repurposed: Turnstile now guards the
  Calendly embed's visibility instead, see FR-10).
- ~~FR-16a~~ — admin-configurable default appointment slot duration.
- ~~FR-18~~/~~FR-19~~/~~FR-20~~ — approve / decline / mark-booked admin actions.
- ~~FR-23~~ — appointment status-change notification emails.

**Removed 2026-08-13 (ADR-010):**

- ~~FR-16~~ — global admin toggle for Upcoming Events visibility (`Setting.upcoming_events_visible`).
  Replaced at the time by FR-16b (per-appointment `isPublic`), itself removed below.

**Removed 2026-09-01 ([ADR-011](../decisions/ADR-011-events-replace-appointments.md)):** the whole
admin appointment feature, replaced by Events. The `appointment` table and every row in it were
dropped.

- ~~FR-16b~~ — per-appointment `isPublic` toggle. Every event is public; there is no flag.
- ~~FR-21~~ — cancel a `scheduled` appointment. No lifecycle exists to cancel within.
- ~~FR-22~~ — hard-delete an appointment. Superseded by FR-17c (delete an event).

Full rationale: [PROJECT_SPEC.md §5.2/§5.4](../../PROJECT_SPEC.md#52-appointment-request-visitor).
