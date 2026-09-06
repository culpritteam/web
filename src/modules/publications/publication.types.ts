// Domain model — the shape services/routes work with. Mapped from the Prisma row inside the
// repository so Prisma's generated types never leak across the service boundary.
/**
 * One credited author. `teamMemberId` is null for an outside co-author, and is also nulled when a
 * linked member is deleted — `name` is a snapshot taken when the row was written, so the byline
 * survives either way.
 */
export type PublicationAuthor = {
  id: string;
  teamMemberId: string | null;
  name: string;
  sortOrder: number;
};

export type Publication = {
  id: string;
  title: string;
  /** In citation order. Empty means the professor's own solo work and renders no byline. */
  authors: PublicationAuthor[];
  venue: string;
  year: number;
  link: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Aggregate counts for the admin dashboard, computed in SQL. Deliberately not derived from
 * `list()`: the dashboard needs three numbers, not every column of every publication.
 */
export type PublicationStats = {
  total: number;
  /** One entry per year that actually has publications, ascending. Empty years are not rows. */
  byYear: { year: number; count: number }[];
  /** The most recent year with at least one publication, or null when there are none. */
  latestYear: number | null;
};

export type { AuditContext } from '@/modules/shared/lib/audit';
