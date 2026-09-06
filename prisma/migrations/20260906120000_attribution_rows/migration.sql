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

-- Backfill: split each publication's comma-separated `authors` string into ordered rows.
--
-- WITH ORDINALITY preserves the written order, which is the citation order. Whitespace is trimmed
-- and empty fragments (a trailing comma, "A. Osei, , B. Lee") are dropped, so `sort_order` can skip
-- a number — it only has to be monotonic, never contiguous.
--
-- Ids are derived from the parent id rather than randomly generated, so this statement is
-- deterministic and safe to re-run against a truncated table.
--
-- Every backfilled row is unlinked (`team_member_id` NULL). Linking a historical byline to a team
-- member is a judgement call about which "R. Lindqvist" is meant; the admin makes it in the UI.
INSERT INTO "publication_author" ("id", "publication_id", "team_member_id", "name", "sort_order", "created_at", "updated_at")
SELECT
    p."id" || '-a' || t.ord,
    p."id",
    NULL,
    btrim(t.part),
    (t.ord - 1)::int,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "publication" p,
     unnest(string_to_array(p."authors", ',')) WITH ORDINALITY AS t(part, ord)
WHERE btrim(t.part) <> '';

-- DropColumn
-- Irreversible, and lossy for a name that itself contains a comma ("Smith, Jr., J." becomes two
-- rows). Inspect `SELECT id, authors FROM publication;` and take a `pg_dump -t publication` before
-- applying this against the shared Supabase database.
ALTER TABLE "publication" DROP COLUMN "authors";
