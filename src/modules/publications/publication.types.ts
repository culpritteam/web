// Domain model — the shape services/routes work with. Mapped from the Prisma row inside the
// repository so Prisma's generated types never leak across the service boundary.
/**
 * One credited author: a plain name (ADR-016). The public list links it to a lab member when it
 * matches one — see `matchMember` in the research-groups module.
 */
export type PublicationAuthor = {
  id: string;
  name: string;
  sortOrder: number;
};

export type Publication = {
  id: string;
  title: string;
  /** In citation order. Empty renders no byline. */
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
