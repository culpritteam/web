// Domain model — the shape services/routes work with. Mapped from the Prisma row inside the
// repository so Prisma's generated types never leak across the service boundary.

/**
 * Something a member built, rendered on their profile page at `/team/[id]`. Every team may have
 * projects — for a `development` member they are the only content section besides bio and links.
 */
export type Project = {
  id: string;
  /** The team member whose profile this project belongs to. */
  teamMemberId: string;
  title: string;
  summary: string;
  /** Optional external link — a repository, demo or write-up. */
  link: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

/** Aggregate counts for the admin dashboard, computed in SQL rather than by listing every row. */
export type ProjectStats = {
  total: number;
};

export type { AuditContext } from '@/modules/shared/lib/audit';
