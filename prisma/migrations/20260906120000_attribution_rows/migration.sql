-- CreateTable
CREATE TABLE "publication_author" (
    "id" TEXT NOT NULL,
    "publication_id" TEXT NOT NULL,
    "team_member_id" TEXT,
    "name" TEXT NOT NULL,
    "is_profile_owner" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "publication_author_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_contributor" (
    "id" TEXT NOT NULL,
    "research_id" TEXT NOT NULL,
    "team_member_id" TEXT,
    "name" TEXT NOT NULL,
    "is_profile_owner" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "research_contributor_pkey" PRIMARY KEY ("id")
);

-- AlterTable: how the professor is credited on a paper.
ALTER TABLE "profile" ADD COLUMN "citation_name" TEXT;

-- AlterTable: keeps research co-authors off the public Team tab. They are real collaborators, but
-- not members of the site's own team, and the existing rows there are the people who built the site.
ALTER TABLE "team_member" ADD COLUMN "show_on_team_tab" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "publication_author_publication_id_idx" ON "publication_author"("publication_id");

-- CreateIndex
CREATE UNIQUE INDEX "publication_author_publication_id_team_member_id_key" ON "publication_author"("publication_id", "team_member_id");

-- CreateIndex
CREATE INDEX "research_contributor_research_id_idx" ON "research_contributor"("research_id");

-- CreateIndex
CREATE UNIQUE INDEX "research_contributor_research_id_team_member_id_key" ON "research_contributor"("research_id", "team_member_id");

-- AddForeignKey
ALTER TABLE "publication_author" ADD CONSTRAINT "publication_author_publication_id_fkey" FOREIGN KEY ("publication_id") REFERENCES "publication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_author" ADD CONSTRAINT "publication_author_team_member_id_fkey" FOREIGN KEY ("team_member_id") REFERENCES "team_member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_contributor" ADD CONSTRAINT "research_contributor_research_id_fkey" FOREIGN KEY ("research_id") REFERENCES "research"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_contributor" ADD CONSTRAINT "research_contributor_team_member_id_fkey" FOREIGN KEY ("team_member_id") REFERENCES "team_member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: split each publication's existing `authors` string into ordered rows.
--
-- The real bylines are written the way a citation is, not as a plain comma list:
--   "M. Fernandez, J. Jaimunk and B. Thuraisingham (alphabetical order)"
-- so the separator is a comma OR the word "and", and a trailing "(alphabetical order)" annotation
-- is stripped rather than glued onto the last author's name. Splitting on commas alone would have
-- produced "J. Jaimunk and B. Thuraisingham (alphabetical order)" as a single author.
--
-- Multi-word surnames survive this ("A. Franch Tapia", "M. Martinez Chamorro"): only a separator
-- splits, never a space. WITH ORDINALITY preserves the written order, which is the citation order.
-- Empty fragments are dropped, so `sort_order` can skip a number — it only has to be monotonic.
--
-- Ids are derived from the parent id rather than randomly generated, so this is deterministic and
-- safe to re-run against a truncated table.
--
-- Every backfilled row is unlinked (`team_member_id` NULL). Deciding which "J. Jaimunk" a 2013
-- byline meant is a judgement call the admin makes in the UI, not one a migration guesses.
--
-- KNOWN LOSS: the "(alphabetical order)" annotation on five publications has nowhere to go — it
-- describes the byline, not any one author, and the new model has no field for it. The original
-- strings are kept in `.backups/publication-authors-2026-09-06.json` so it can be restored if a
-- note column is ever added.
INSERT INTO "publication_author" ("id", "publication_id", "team_member_id", "name", "sort_order", "created_at", "updated_at")
SELECT
    p."id" || '-a' || t.ord,
    p."id",
    NULL,
    btrim(regexp_replace(t.part, '\s*\(alphabetical order\)\s*$', '')),
    (t.ord - 1)::int,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "publication" p,
     unnest(regexp_split_to_array(p."authors", ',\s*|\s+and\s+')) WITH ORDINALITY AS t(part, ord)
WHERE btrim(regexp_replace(t.part, '\s*\(alphabetical order\)\s*$', '')) <> '';

-- Backfill step 2: record how the professor is credited.
--
-- Set explicitly rather than derived. `full_name` is "Jenjira Jaimunk, PhD." and every byline reads
-- "J. Jaimunk"; no rule turns one into the other reliably (initials, particles, honorific suffixes),
-- and guessing wrong would mis-credit all 16 papers. Guarded so a value set by hand wins.
UPDATE "profile" SET "citation_name" = 'J. Jaimunk' WHERE "citation_name" IS NULL;

-- Backfill step 3: claim her own rows.
--
-- These become owner rows rather than plain names: they render `profile.citation_name` live and
-- always sort first, so she is never stored as though she were an outside collaborator.
UPDATE "publication_author" a
SET "is_profile_owner" = true
FROM "profile" p
WHERE p."citation_name" IS NOT NULL
  AND btrim(a."name") = btrim(p."citation_name");

-- Backfill step 4: turn every remaining distinct co-author into a real team member.
--
-- The same people recur across papers — M. Fernandez on six, B. Thuraisingham on five — and leaving
-- them as loose strings means the same human is retyped per publication and can never be counted,
-- filtered or corrected in one place. One `team_member` row each, linked from every occurrence.
--
-- Names are grouped on an accent-folded, case-folded key so "M. Fernandez" and "M. Fernández" (both
-- present, same person) collapse into one record; `min(name)` picks the unaccented spelling as the
-- canonical one. This is the only fuzziness here, and it is deliberate and narrow: two byline
-- strings that differ ONLY by accent or case are the same person. Anything else stays separate.
--
-- `show_on_team_tab` is false: they are collaborators, not staff of this site. `role` is a
-- placeholder the admin edits — the column is NOT NULL, so it needs some value.
WITH candidates AS (
    SELECT
        lower(translate(btrim(a."name"),
                        'áéíóúàèìòùâêîôûäëïöüñçÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÄËÏÖÜÑÇ',
                        'aeiouaeiouaeiouaeioun cAEIOUAEIOUAEIOUAEIOUNC')) AS match_key,
        min(btrim(a."name")) AS canonical_name
    FROM "publication_author" a
    WHERE a."is_profile_owner" = false
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
    RETURNING "id", "name"
)
UPDATE "publication_author" a
SET "team_member_id" = created."id"
FROM created, candidates c
WHERE a."is_profile_owner" = false
  AND created."name" = c.canonical_name
  AND lower(translate(btrim(a."name"),
                      'áéíóúàèìòùâêîôûäëïöüñçÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÄËÏÖÜÑÇ',
                      'aeiouaeiouaeiouaeioun cAEIOUAEIOUAEIOUAEIOUNC')) = c.match_key;

-- One owner row per record. Postgres cannot express this as a plain UNIQUE constraint and Prisma
-- cannot express a partial index at all, so it lives here and is documented in schema.prisma.
-- Created after the backfill so it validates the rows the backfill just wrote.
CREATE UNIQUE INDEX "publication_author_one_owner_per_publication"
    ON "publication_author" ("publication_id") WHERE "is_profile_owner";
CREATE UNIQUE INDEX "research_contributor_one_owner_per_research"
    ON "research_contributor" ("research_id") WHERE "is_profile_owner";

-- DropColumn
-- Irreversible. The 16 original strings were inspected and saved to
-- `.backups/publication-authors-2026-09-06.json` before this was applied against the shared
-- Supabase database; nothing else can recover them.
ALTER TABLE "publication" DROP COLUMN "authors";
