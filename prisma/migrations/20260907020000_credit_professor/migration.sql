-- Two gaps in the attribution model, found against the real data after 20260906120000 had already
-- been applied. That migration is untouched — it ran, and its checksum is recorded.
--
--   1. The professor had no way to credit herself. She is the `profile` singleton, not a
--      `team_member`, so the only way onto her own byline was to type her name into the
--      outside-collaborator box, storing her exactly like a stranger.
--   2. Co-authors recur — M. Fernandez on six papers, B. Thuraisingham on five — and the previous
--      backfill left every one of them as loose text, so the same human could not be counted,
--      corrected or linked in one place.

-- AlterTable: how she is credited on a paper.
ALTER TABLE "profile" ADD COLUMN "citation_name" TEXT;

-- AlterTable: keeps research co-authors off the public Team tab. They are real collaborators, but
-- the rows already there are the people who built this website.
ALTER TABLE "team_member" ADD COLUMN "show_on_team_tab" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable: her own rows. No `team_member_id` — she is not one — and rendered from
-- `profile.citation_name` live rather than from the row's snapshot.
ALTER TABLE "publication_author" ADD COLUMN "is_profile_owner" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "research_contributor" ADD COLUMN "is_profile_owner" BOOLEAN NOT NULL DEFAULT false;

-- Backfill 1: record how she is credited.
--
-- Set explicitly rather than derived. `full_name` is "Jenjira Jaimunk, PhD." and every byline reads
-- "J. Jaimunk"; no rule turns one into the other reliably (initials, particles, honorific suffixes),
-- and guessing wrong would mis-credit all 16 papers. Guarded so a value set by hand wins.
UPDATE "profile" SET "citation_name" = 'J. Jaimunk' WHERE "citation_name" IS NULL;

-- Backfill 2: claim her own rows out of the 42 the previous migration created.
UPDATE "publication_author" a
SET "is_profile_owner" = true, "team_member_id" = NULL
FROM "profile" p
WHERE p."citation_name" IS NOT NULL
  AND btrim(a."name") = btrim(p."citation_name");

-- Backfill 3: turn every remaining distinct co-author into a real team member, linked from every
-- occurrence, so one person is one record across all their papers.
--
-- Names are grouped on an accent-folded, case-folded key so "M. Fernandez" and "M. Fernández" (both
-- present, the same person) collapse into one record; `min(name)` picks the unaccented spelling as
-- canonical. This is the only fuzziness here and it is deliberately narrow: two byline strings that
-- differ ONLY by accent or case are the same person. Anything else stays separate.
--
-- `show_on_team_tab` is false and `role` is a placeholder the admin edits — the column is NOT NULL,
-- so it needs some value. Only rows not already linked are touched, so this is safe to re-run.
WITH candidates AS (
    SELECT
        lower(translate(btrim(a."name"),
                        'áéíóúàèìòùâêîôûäëïöüñçÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÄËÏÖÜÑÇ',
                        'aeiouaeiouaeiouaeioun cAEIOUAEIOUAEIOUAEIOUNC')) AS match_key,
        min(btrim(a."name")) AS canonical_name
    FROM "publication_author" a
    WHERE a."is_profile_owner" = false
      AND a."team_member_id" IS NULL
    GROUP BY 1
),
created AS (
    INSERT INTO "team_member" ("id", "name", "role", "show_on_team_tab", "sort_order", "created_at", "updated_at")
    SELECT
        'tm-byline-' || substr(md5(match_key), 1, 20),
        canonical_name,
        'Research collaborator',
        false,
        0,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    FROM candidates
    ON CONFLICT ("id") DO NOTHING
    RETURNING "id", "name"
)
UPDATE "publication_author" a
SET "team_member_id" = created."id"
FROM created, candidates c
WHERE a."is_profile_owner" = false
  AND a."team_member_id" IS NULL
  AND created."name" = c.canonical_name
  AND lower(translate(btrim(a."name"),
                      'áéíóúàèìòùâêîôûäëïöüñçÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÄËÏÖÜÑÇ',
                      'aeiouaeiouaeiouaeioun cAEIOUAEIOUAEIOUAEIOUNC')) = c.match_key;

-- One owner row per record. Postgres can express this only as a partial index, and Prisma cannot
-- express a partial index at all, so it lives here and is documented in schema.prisma —
-- `prisma migrate dev` will report it as drift. Created after the backfill so it validates the rows
-- the backfill just wrote.
CREATE UNIQUE INDEX "publication_author_one_owner_per_publication"
    ON "publication_author" ("publication_id") WHERE "is_profile_owner";
CREATE UNIQUE INDEX "research_contributor_one_owner_per_research"
    ON "research_contributor" ("research_id") WHERE "is_profile_owner";
