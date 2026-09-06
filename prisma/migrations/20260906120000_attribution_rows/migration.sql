-- CreateTable
CREATE TABLE "publication_author" (
    "id" TEXT NOT NULL,
    "publication_id" TEXT NOT NULL,
    "team_member_id" TEXT,
    "name" TEXT NOT NULL,
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
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "research_contributor_pkey" PRIMARY KEY ("id")
);

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

-- DropColumn
-- Irreversible. The 16 original strings were inspected and saved to
-- `.backups/publication-authors-2026-09-06.json` before this was applied against the shared
-- Supabase database; nothing else can recover them.
ALTER TABLE "publication" DROP COLUMN "authors";
