-- The site is re-scoped from the professor's personal site to the lab's site, "The Culprit of
-- Privacy Technologies" (ADR-016). Customer decisions this migration carries out:
--
--   1. The professor becomes the lab DIRECTOR — a `team_member` row like everyone else, with her
--      bio, links, photo, CV entries and courses attached to it. `profile` becomes the lab's own
--      singleton (name, tagline, logo, overview).
--   2. Research groups are removed entirely, and every member who is not in "Culprit Web Development Team"
--      is deleted. That includes the byline-only collaborator rows 20260907020000 created.
--   3. Bylines become plain typed names. The team-member link and the professor's own-row flag on
--      `publication_author` / `research_contributor` are dropped; the public site now matches a
--      byline name against members' names at render time instead.
--
-- THIS DESTROYS DATA. Take a Supabase backup before it runs anywhere — staging and production
-- share one database. Every deleted member and group is first written to `audit_log` with its
-- full before-state, so what was removed stays recoverable from the audit trail.

-- Guard: the group whose members survive must exist, exactly once. Without this, a renamed or
-- missing group would make step 2 below delete every member.
--
-- Skipped only when `team_member` is empty — a fresh database has nothing to delete, and without
-- this exception `migrate deploy` could never run on a new, empty database.
-- One explicit transaction: a failure anywhere below must leave the deletes above un-run, not
-- half-applied.
BEGIN;

DO $$
DECLARE
    keep_count integer;
BEGIN
    SELECT count(*) INTO keep_count
    FROM "research_group"
    WHERE lower(btrim("name")) = 'culprit web development team';

    IF keep_count <> 1 AND EXISTS (SELECT 1 FROM "team_member") THEN
        RAISE EXCEPTION
            'lab_team_profiles: expected exactly one research_group named "Culprit Web Development Team", found %. Nothing was changed.',
            keep_count;
    END IF;
END
$$;

-- Audit, then delete. Actor `migration`; the whole row as jsonb in `metadata`, so a deleted record
-- can be rebuilt from the audit trail alone.
INSERT INTO "audit_log" ("id", "actor", "action", "entity_type", "entity_id", "metadata", "created_at")
SELECT gen_random_uuid()::text, 'migration', 'team_member.delete', 'team_member', m."id", to_jsonb(m), CURRENT_TIMESTAMP
FROM "team_member" m
WHERE m."research_group_id" IS DISTINCT FROM (
    SELECT g."id" FROM "research_group" g WHERE lower(btrim(g."name")) = 'culprit web development team'
);

INSERT INTO "audit_log" ("id", "actor", "action", "entity_type", "entity_id", "metadata", "created_at")
SELECT gen_random_uuid()::text, 'migration', 'research_group.delete', 'research_group', g."id", to_jsonb(g), CURRENT_TIMESTAMP
FROM "research_group" g;

-- `event_participant`, `publication_author` and `research_contributor` point here with ON DELETE
-- SET NULL, so each falls back to its own name snapshot: event history and bylines are untouched.
DELETE FROM "team_member" m
WHERE m."research_group_id" IS DISTINCT FROM (
    SELECT g."id" FROM "research_group" g WHERE lower(btrim(g."name")) = 'culprit web development team'
);

-- Bylines. Her own rows rendered `profile.citation_name` live rather than their stored name; write
-- that value into the row now, while the flag that identifies them still exists, so they keep
-- reading "J. Jaimunk" once the name is all a byline has.
UPDATE "publication_author" a
SET "name" = p."citation_name"
FROM "profile" p
WHERE a."is_profile_owner" AND p."citation_name" IS NOT NULL;

UPDATE "research_contributor" c
SET "name" = p."citation_name"
FROM "profile" p
WHERE c."is_profile_owner" AND p."citation_name" IS NOT NULL;

-- The two partial indexes from 20260907020000, then the link, its unique index and the flag.
DROP INDEX "publication_author_one_owner_per_publication";
DROP INDEX "research_contributor_one_owner_per_research";

ALTER TABLE "publication_author" DROP CONSTRAINT "publication_author_team_member_id_fkey";
ALTER TABLE "research_contributor" DROP CONSTRAINT "research_contributor_team_member_id_fkey";

DROP INDEX "publication_author_publication_id_team_member_id_key";
DROP INDEX "research_contributor_research_id_team_member_id_key";

ALTER TABLE "publication_author" DROP COLUMN "team_member_id",
DROP COLUMN "is_profile_owner";

ALTER TABLE "research_contributor" DROP COLUMN "team_member_id",
DROP COLUMN "is_profile_owner";

-- `team_member`: no nickname, no Team-tab toggle (every member is on the Team tab now), no group.
ALTER TABLE "team_member" DROP CONSTRAINT "team_member_research_group_id_fkey";
DROP INDEX "team_member_research_group_id_idx";

ALTER TABLE "team_member" DROP COLUMN "nickname",
DROP COLUMN "show_on_team_tab",
DROP COLUMN "research_group_id",
ADD COLUMN "is_director" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "citation_name" TEXT,
ADD COLUMN "affiliation" TEXT,
ADD COLUMN "linkedin_url" TEXT,
ADD COLUMN "google_scholar_url" TEXT;

-- One director at most. Postgres can express this only as a partial index, and Prisma cannot
-- express a partial index at all, so it lives here and is documented in schema.prisma —
-- `prisma migrate dev` will report it as drift. Created before the insert below so it validates it.
CREATE UNIQUE INDEX "team_member_one_director" ON "team_member" ("is_director") WHERE "is_director";

-- The director row, built from what `profile` held about her. `sort_order = -1` puts her ahead of
-- every existing member even where the director flag is not what a query orders on.
INSERT INTO "team_member" (
    "id", "name", "citation_name", "role", "affiliation", "bio", "photo_url",
    "linkedin_url", "google_scholar_url", "is_director", "sort_order", "created_at", "updated_at"
)
SELECT
    gen_random_uuid()::text,
    p."full_name",
    p."citation_name",
    p."title",
    p."position_affiliation",
    p."bio",
    p."photo_url",
    p."linkedin_url",
    p."google_scholar_url",
    true,
    -1,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "profile" p
ORDER BY p."updated_at" DESC
LIMIT 1;

-- `cv_entry` and `course` now belong to a member. Every existing row was the professor's, so all of
-- them go to the director. Added nullable, backfilled, then made NOT NULL: if there were CV rows but
-- no profile to build a director from, SET NOT NULL fails and the whole migration rolls back.
ALTER TABLE "cv_entry" ADD COLUMN "team_member_id" TEXT;
ALTER TABLE "course" ADD COLUMN "team_member_id" TEXT;

UPDATE "cv_entry" SET "team_member_id" = (SELECT "id" FROM "team_member" WHERE "is_director");
UPDATE "course" SET "team_member_id" = (SELECT "id" FROM "team_member" WHERE "is_director");

ALTER TABLE "cv_entry" ALTER COLUMN "team_member_id" SET NOT NULL;
ALTER TABLE "course" ALTER COLUMN "team_member_id" SET NOT NULL;

ALTER TABLE "cv_entry" ADD CONSTRAINT "cv_entry_team_member_id_fkey" FOREIGN KEY ("team_member_id") REFERENCES "team_member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course" ADD CONSTRAINT "course_team_member_id_fkey" FOREIGN KEY ("team_member_id") REFERENCES "team_member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every read is now "this member's entries", so the member leads both indexes.
DROP INDEX "cv_entry_section_sort_order_idx";
DROP INDEX "course_sort_order_idx";
CREATE INDEX "cv_entry_team_member_id_section_sort_order_idx" ON "cv_entry"("team_member_id", "section", "sort_order");
CREATE INDEX "course_team_member_id_sort_order_idx" ON "course"("team_member_id", "sort_order");

-- `profile` becomes the lab's profile. Renamed rather than dropped and re-added: same data type,
-- same slot, and the admin screens keep their row. The old values were her personal text and now
-- live on the director row, so the renamed columns are reset to the lab's.
-- The profile's full before-state, so the columns overwritten or dropped below stay recoverable.
INSERT INTO "audit_log" ("id", "actor", "action", "entity_type", "entity_id", "metadata", "created_at")
SELECT gen_random_uuid()::text, 'migration', 'profile.update', 'profile', p."id", to_jsonb(p), CURRENT_TIMESTAMP
FROM "profile" p;

ALTER TABLE "profile" RENAME COLUMN "full_name" TO "lab_name";
ALTER TABLE "profile" RENAME COLUMN "title" TO "lab_tagline";
ALTER TABLE "profile" RENAME COLUMN "photo_url" TO "logo_url";
ALTER TABLE "profile" RENAME COLUMN "bio" TO "lab_overview";
ALTER TABLE "profile" ALTER COLUMN "lab_tagline" DROP NOT NULL;

UPDATE "profile"
SET "lab_name" = 'The Culprit of Privacy Technologies',
    "lab_tagline" = NULL,
    "logo_url" = NULL,
    "lab_overview" = NULL,
    "updated_at" = CURRENT_TIMESTAMP;

-- Kept: `position_affiliation` (the lab's department), `research_statement` (the Research intro),
-- `calendly_url` and the remaining `*_intro` columns. Dropped: what only described her, and the
-- Teaching intro — Teaching is a section of her profile page now, not a tab.
ALTER TABLE "profile" DROP COLUMN "citation_name",
DROP COLUMN "linkedin_url",
DROP COLUMN "google_scholar_url",
DROP COLUMN "teaching_intro";

-- Groups. Nothing references this table any more.
DROP TABLE "research_group";

COMMIT;
