---
status: current
source_of_truth: true
last_updated: 2026-09-12
related_modules: [research-groups, teaching, projects, research, publications]
related_decisions: [ADR-012, ADR-015, ADR-016]
---

# ADR-017: Members belong to a team; projects and member links become their own tables

## Status

Accepted. Extends ADR-016 (which made every member a flat row on one Team tab) and ADR-012 (whose
one-table-with-a-discriminator pattern this reuses).

## Date

2026-09-12

## Context

ADR-016 left the Team tab a flat list: every member rendered the same card, and every profile page
offered the same sections regardless of who the person was. That was right while the lab was the
director plus one web-development team, but it does not survive the lab actually having distinct
kinds of people in it.

The customer's decisions:

- Members are grouped into four teams: **director**, **professor**, **research**, **development**.
- Director and professor can have everything a profile page offers.
- The research team has projects, research and publications — not courses, and not the teaching
  side of the CV.
- The development team has projects and links only. Its people are engineers, not authors, so
  LinkedIn and Google Scholar are the wrong two fields to hard-code for them; they need a portfolio,
  a GitHub, a personal site — whatever they actually have.

The last point is the one that forced a schema change rather than a display rule. `team_member`
carried exactly two link columns, `linkedin_url` and `google_scholar_url`, chosen when the site was
one professor's. Adding `github_url` and `portfolio_url` beside them would repeat the mistake at a
larger size: the set of links a person has is open, and hard-coding it means a migration every time
someone joins with a kind of profile nobody anticipated.

## Decision

1. **A `team_kind` enum column on `team_member`**, not a groups table. `ResearchGroup` was deleted
   on purpose in ADR-016 and does not come back. This is the same judgement ADR-012 made for
   `cv_entry.section`: one entity with a category, not several entities. All four teams share an
   identical attribute set at the database level — the differences are rules about which related
   rows are allowed and which sections render, not different columns.

   ```prisma
   enum TeamKind { director  professor  research  development }
   ```

   Existing rows are backfilled from `is_director`: the director becomes `director`, everyone else
   becomes `research`.

2. **`isDirector` stays and keeps owning the one-director invariant.** The partial unique index
   `team_member_one_director` (documented drift since ADR-016 — Prisma cannot express a partial
   index) is the only thing that actually enforces "at most one", and an enum value cannot replace
   it. The two are kept consistent in one place in the service: `isDirector === (teamKind ===
   'director')`, set together in the same transaction that already clears the flag on every other
   row. The redundancy is accepted deliberately, with a single writer, rather than dropping a
   working database-level constraint to remove it.

3. **Per-team rules are enforced server-side**, in the service layer, as `400 validation_error`.

   | team | bio | CV sections | courses | projects | research + publications | links |
   |---|---|---|---|---|---|---|
   | `director` | yes | all seven | yes | yes | yes | yes |
   | `professor` | yes | all seven | yes | yes | yes | yes |
   | `research` | yes | `research_interest` only | no | yes | yes | yes |
   | `development` | yes | none | no | yes | no | yes |

   Not `409`: this codebase has no state machines and no service returns one (see the project
   rules). A course assigned to a development member is a rejected input, not a rejected transition.

   Not `422` either, though a rule violation is arguably unprocessable rather than malformed:
   `ValidationError` in `shared/lib/errors.ts` maps to 400 for the whole app, and these rejections
   carry `fieldErrors` exactly like a schema rejection does. Adding a second error kind so that one
   rule could answer 422 would mean two different statuses for two kinds of "this input is not
   allowed", which is a worse API than one consistent status.

   **A team change never deletes rows and is never blocked by them.** Moving someone from professor
   to development leaves their courses in the database, orphaned and unrendered. The public profile
   read gates by team on the way out, so the rule holds for data written before the rule existed —
   or before the person moved. Deleting on a team change would destroy real history to enforce a
   display rule; refusing the change would make the admin delete their CV to reclassify them.

4. **`project` is its own table**, owned by a member (`team_member_id`, required, cascade). It is
   not a `Research` row with a convention on `area`. Research is lab output with an ordered byline
   and no owner; a project belongs to exactly one person and appears only on their page. Reusing
   `Research` would have meant a member-owned thing living in a table whose whole attribution model
   (ADR-015, ADR-016) is deliberately ownerless. Projects are available to all four teams.

5. **`member_link` replaces `linkedin_url` and `google_scholar_url`** — a labelled, ordered list of
   rows, `{ label, url, sortOrder }`, with the label free text the admin types. No enum and no
   allow-list of known providers: the point of the change is that the set is open. `url` is
   validated by the existing `httpUrl` schema field, so the boundary is no weaker than the columns
   it replaces.

   Links are edited as part of the member, not through their own CRUD surface — the member payload
   carries the whole array and the repository replaces the rows in one transaction. That is the
   established shape for owned child rows in this codebase (`PublicationAuthor`, ADR-015), and it
   keeps one audited write per member edit instead of several.

6. **Research and publications on a profile page stay render-time matches.** A member's papers are
   still found by matching byline names against `name` / `citationName` through `byline-match.ts`.
   No relation was added. ADR-016's reasoning is unchanged by this ADR: a byline is a fixed
   historical fact, and renaming or removing a member must never rewrite what a paper says.

## Consequences

- **The migration is destructive and runs against production.** It drops two columns, and staging
  and production still share one Supabase database (see CLAUDE.md), so a backup is required before
  it runs. It backfills `member_link` rows from both columns *before* dropping them, in one
  transaction — the reverse order loses every existing link silently.
- The Team tab is now grouped by team in a fixed display order — director, professor, research,
  development — instead of one flat grid. Ordering within a team is still `sortOrder`.
- `linkedinUrl` and `googleScholarUrl` no longer exist anywhere: not on the model, the domain type,
  the Zod schemas, the public API response for a member, or the seed. Any external consumer reading
  those two fields from `GET /api/team-members` sees them disappear.
- Two new rule surfaces can silently rot the way ADR-007's paths did: the team gating in the
  profile read, and the enforcement checks in the teaching service. Both are unit-tested against
  the reject cases specifically, not only the happy path.
- `development` members have no publications section at all, even if a byline happens to match
  their name. That is intended: a name collision should not manufacture a publication list for an
  engineer.

## Supersedes / Superseded by

Does not supersede ADR-016. It changes two things ADR-016 decided — the flat Team tab, and the two
fixed link columns it gave `team_member` — and leaves the rest (director-as-member, plain-name
bylines, member-owned CV entries and courses) exactly as ADR-016 set them.
