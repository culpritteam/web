// Domain model — the shape services/routes work with. Mapped from the Prisma row inside the
// repository so Prisma's generated types never leak across the service boundary.
/** One credited contributor: a plain name. Same shape and same rules as `PublicationAuthor`. */
export type ResearchContributor = {
  id: string;
  name: string;
  sortOrder: number;
};

export type Research = {
  id: string;
  title: string;
  summary: string;
  area: string;
  link: string | null;
  /** In display order. Empty renders no byline. */
  contributors: ResearchContributor[];
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

/** Aggregate counts for the admin dashboard, computed in SQL rather than by listing every row. */
export type ResearchStats = {
  total: number;
  /**
   * One entry per distinct `area`, ordered by the lowest `sortOrder` in that area — i.e. the order
   * the areas first appear in `list()`, which is the admin's own arrangement. Alphabetical order
   * would silently override it.
   */
  byArea: { area: string; count: number }[];
};

export type { AuditContext } from '@/modules/shared/lib/audit';
