---
status: current
source_of_truth: true
last_updated: 2026-09-11
related_modules: [profile, research-groups, teaching, research, publications, events]
related_decisions: [ADR-012, ADR-015]
---

# ADR-016: The site is the lab's; the director is a team member

## Status

Accepted. Supersedes the parts of ADR-012 that made CV entries and courses global, and the
`teamMemberId` / `isProfileOwner` attribution design of ADR-015.

## Date

2026-09-11

## Context

The customer re-scoped the site from Dr. Jaimunk's personal site to the site of her lab, "The
Culprit of Privacy Technologies". Until now the `profile` singleton *was* the professor: her name
headed every page, the About tab was her biography and CV, and bylines needed an `isProfileOwner`
flag because she was not a `team_member`.

The customer's decisions:

- The header and About tab present the lab.
- The director's bio, CV, links and teaching move to her profile page under Team; every member can
  have the same kind of page.
- One admin still edits everything. No per-member accounts.
- Research groups are dropped. Only the members of "Culprit Web Development Team" stay.
- Bylines are plain typed names. A name that matches a team member is highlighted and links to
  their profile; any other name is grey.

## Decision

1. **The director is a `team_member` row with `isDirector = true`.** At most one, enforced by the
   partial unique index `team_member_one_director` (Prisma cannot express it, so it is documented
   drift) and by the repository clearing the flag on other rows when one is set. The member gains
   `citationName`, `affiliation`, `linkedinUrl` and `googleScholarUrl`; it loses `nickname`,
   `showOnTeamTab` and `researchGroupId`.
2. **`cv_entry` and `course` belong to a member** (`team_member_id`, required, cascade). The
   existing rows were attached to the director. Each member's profile page at `/team/[id]` renders
   their CV sections and courses. The public Teaching tab is gone; `/teaching` redirects to the
   director's profile.
3. **`profile` is the lab's profile.** Its personal columns were renamed or dropped: `lab_name`,
   `lab_tagline`, `logo_url`, `lab_overview` replace the professor's name, title, photo and bio;
   her citation name and links moved to her member row. The per-tab intros, research statement and
   Calendly link stay.
4. **`research_group` is dropped**; the Team tab is a flat list, director first.
5. **Bylines are `{ name }` rows only.** `PublicationAuthor` / `ResearchContributor` keep their own
   table and order (ADR-015's shape) but lose `teamMemberId` and `isProfileOwner`. Highlighting is
   computed at render time: a case-insensitive, whitespace-trimmed exact match of the byline name
   against each member's `name` or `citationName` (`matchMember`). Nothing is stored, so renaming
   or removing a member only changes whether a name is highlighted, never what a paper says.

## Consequences

- **Data was deleted.** The migration `20260911120000_lab_team_profiles` deletes every research
  group and every member outside "Culprit Web Development Team", including the byline-only collaborator
  rows ADR-015's follow-up created. It writes an `audit_log` row with the full before-state for
  each deletion first, and aborts if no group of that name exists. Because staging and production
  share one database, a backup was required before it ran.
- **Matching is exact on purpose.** "J. Jaimunk" highlights because it is the director's citation
  name; a misspelt byline stays grey. The admin byline field offers member names as suggestions to
  keep them consistent.
- Event participants keep their soft link to members; deleted members fall back to the name
  snapshot on the participant row.
