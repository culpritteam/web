-- Team grouping: members are sorted into four teams, projects become their own entity, and the two
-- fixed profile-link columns become free-form `member_link` rows.
--
-- THIS DROPS COLUMNS. `team_member.linkedin_url` and `team_member.google_scholar_url` are removed,
-- and staging and production share one Supabase database — take a backup before this runs anywhere.
-- Nothing is lost by the drop itself: both columns are copied into `member_link` rows FIRST, in the
-- same transaction, so the statement order below is load-bearing.
--
-- One explicit transaction: a failure anywhere must leave the backfill and the drop either both
-- applied or both un-applied.
BEGIN;

-- CreateEnum
-- The four teams. A discriminator on `team_member`, not a groups table — ADR-016 deleted
-- `research_group` on purpose and this must not reintroduce it.
CREATE TYPE "TeamKind" AS ENUM ('director', 'professor', 'research', 'development');

-- AlterTable: team_kind, added nullable, backfilled, then made NOT NULL.
-- No DB-level default: the app always supplies the team (the create schema requires it), so a
-- default would only mask a missing value rather than surface it.
ALTER TABLE "team_member" ADD COLUMN "team_kind" "TeamKind";

-- Backfill: the director is the `director` team; everyone else starts on `research`, which is the
-- team that keeps the most of what they already have (bio, research interests, projects, bylines).
UPDATE "team_member"
SET "team_kind" = CASE WHEN "is_director" THEN 'director'::"TeamKind" ELSE 'research'::"TeamKind" END;

ALTER TABLE "team_member" ALTER COLUMN "team_kind" SET NOT NULL;

-- CreateTable
CREATE TABLE "project" (
    "id" TEXT NOT NULL,
    "team_member_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "link" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_link" (
    "id" TEXT NOT NULL,
    "team_member_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_link_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Every read of either table is "this member's rows, in the admin's order".
CREATE INDEX "project_team_member_id_sort_order_idx" ON "project"("team_member_id", "sort_order");

-- CreateIndex
CREATE INDEX "member_link_team_member_id_sort_order_idx" ON "member_link"("team_member_id", "sort_order");

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_team_member_id_fkey" FOREIGN KEY ("team_member_id") REFERENCES "team_member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_link" ADD CONSTRAINT "member_link_team_member_id_fkey" FOREIGN KEY ("team_member_id") REFERENCES "team_member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill the links BEFORE the columns are dropped. A member with both gets two rows in the order
-- the old profile block rendered them: LinkedIn (0), then Google Scholar (1).
INSERT INTO "member_link" ("id", "team_member_id", "label", "url", "sort_order", "created_at", "updated_at")
SELECT gen_random_uuid()::text, m."id", 'LinkedIn', m."linkedin_url", 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "team_member" m
WHERE m."linkedin_url" IS NOT NULL;

INSERT INTO "member_link" ("id", "team_member_id", "label", "url", "sort_order", "created_at", "updated_at")
SELECT gen_random_uuid()::text, m."id", 'Google Scholar', m."google_scholar_url", 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "team_member" m
WHERE m."google_scholar_url" IS NOT NULL;

-- Only now are the columns gone. Anything they held is a `member_link` row above.
ALTER TABLE "team_member" DROP COLUMN "linkedin_url",
DROP COLUMN "google_scholar_url";

COMMIT;
