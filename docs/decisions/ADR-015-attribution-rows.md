---
status: current
source_of_truth: true
last_updated: 2026-09-06
related_modules: [research, publications, research-groups]
related_decisions: [ADR-011, ADR-012]
---

# ADR-015: Research and publications are credited with rows, not columns

## Status

Accepted

## Date

2026-09-06

## Context

Research works and publications could not be credited to the team.

`Research` had no attribution field at all — the only grouping was the free-text `area`. Nothing
connected a research work to the person who did it. `Publication` had `authors`, a single free-text
`String` holding a byline like `'A. Osei, R. Lindqvist, T. Meyer'`. That column could render and
nothing else: it could not link a name to the `TeamMember` row that already held it, could not be
filtered or counted by person, and drifted the moment someone's name changed in one place and not
the other. Meanwhile `team_member` held the same people as real rows, with photos and roles, backing
the public Team tab.

The obvious fix — hang an owner or a group off each row — runs straight into the shape of this
site's content. Much of it is the professor's own solo work. A nullable `team_member_id` or
`research_group_id` on `research` and `publication` would have been NULL on the majority of rows,
and a column that is usually NULL teaches everyone reading the schema to ignore it. It also caps
attribution at one person, which is wrong for a paper.

A third constraint: a byline is a historical fact. Renaming a team member, or deleting them when
they leave, must not silently rewrite what a 2021 paper says it was written by.

## Decision

**Attribution is rows in a join table, not columns on the entity.** Two new models,
`PublicationAuthor` and `ResearchContributor`, both copying the `EventParticipant` pattern already
in the schema:

- explicit join row with its own `cuid` id, cascading from its parent;
- `teamMemberId` nullable with `onDelete: SetNull` — a soft link, never a cascade;
- a `name` **snapshot**, copied from the member when the row is written, which is what renders;
- `sortOrder`, assigned from the submitted array's own index;
- `@@unique([parentId, teamMemberId])`, which constrains linked members while leaving the number of
  outside collaborators unbounded, because Postgres treats NULLs as distinct.

Three consequences follow, and they are the point of the decision:

1. **Zero rows means the professor's own solo work.** Nothing is stored to represent him, and the
   public tab renders no byline at all — not an empty line, not a placeholder. Solo work costs no
   NULL columns because it costs no columns.
2. **An unlinked row is an outside collaborator**, a name with no corresponding team member. The
   same list holds both kinds, in one order.
3. **`Publication.authors` (the string) is gone.** Existing values were split on commas by the
   migration, preserving order, into unlinked rows.

Only `name` is snapshotted, unlike `EventParticipant`, which also freezes `role` and `photoUrl`. An
event card renders a person; a byline renders a name. A snapshot column nothing displays could only
drift.

The list is submitted **with the record**, in the same request, and the repository replaces it
wholesale inside the same transaction as the audit entry — one `AuditLog` row per edit. It is not
an immediately-persisting side panel like the event-participants dialog or the research-group roster
editor. Those lists are independently meaningful: an event with no participants is a normal event.
A byline is part of the publication it belongs to, so Cancel has to discard it along with the title.

## Consequences

- **Solo work has no NULLs and no ceremony.** The admin leaves the list empty and the public site
  says nothing about authorship, which is the correct rendering.
- **A byline survives its people.** Deleting a team member nulls the link and leaves the printed
  name intact. This is why the snapshot exists; without it, deleting a graduating PhD student would
  quietly erase them from four papers.
- **The API surface did not grow.** No new endpoints. The array rides along in the existing
  create/update payloads and is validated at the boundary by the module's own Zod schema, which also
  rejects a duplicate `teamMemberId` before the database would reject it as an unreadable
  constraint error. That a `teamMemberId` exists at all is left to the foreign key.
- **The migration is destructive and hits production.** Staging and production share one Supabase
  database, so `DROP COLUMN authors` is irreversible the moment it is applied anywhere. The split is
  additionally lossy for a name that itself contains a comma (`"Smith, Jr., J."` becomes two rows).
  A `pg_dump -t publication` before applying is the mitigation. The deployed build also errors on
  `/publications` between the column drop and the new build going live; the window is short and a
  two-phase deploy was judged not worth building for this site.
- **Two near-identical models, deliberately not abstracted.** A shared repository helper would have
  to take a Prisma delegate as a parameter, putting Prisma types in a shared file and breaking the
  "Prisma is imported only in repositories" rule. The one thing that *is* shared is the UI control,
  `src/modules/shared/ui/byline-field.tsx`, which knows nothing about either module.
- **Backfilled rows are all unlinked.** Deciding which "R. Lindqvist" a 2021 byline meant is a
  judgement call, so the admin makes it in the UI rather than a migration guessing by surname.

## Alternatives considered

- **A nullable `research_group_id` on each entity.** One column, no new tables, and the smallest
  possible diff. Rejected: it is precisely the mostly-NULL column this decision exists to avoid, it
  credits a group rather than the people in it, and it cannot express two named co-authors.
- **Keeping the `authors` string and adding links alongside it.** No data migration and no risk to
  existing rows. Rejected: authorship would then live in two places that nothing keeps in agreement,
  which is the failure mode the `cv_entry` change ([ADR-012](ADR-012-cv-entries-and-courses.md))
  already worked to end.
- **A single polymorphic attribution table** covering both entities. Prisma has no clean
  polymorphic relation, so it would mean two nullable parent FKs on every row — trading one
  mostly-NULL column for two.
