// Domain model — the shape services/routes work with. Mapped from the Prisma row inside the
// repository so Prisma's generated types never leak across the service boundary.
export type TeamMember = {
  id: string;
  name: string;
  /** What the person goes by, e.g. "Wyco". Optional — most people don't need one. */
  nickname: string | null;
  role: string;
  bio: string | null;
  photoUrl: string | null;
  /**
   * Whether this person belongs on the public Team tab. False for a research co-author created only
   * so their name can be linked across papers — a real collaborator, but not a member of this site's
   * team. Flip it on to promote them once they have a role and a bio.
   */
  showOnTeamTab: boolean;
  researchGroupId: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

/** Headline counts for the admin dashboard, computed in SQL rather than by listing every row. */
export type TeamMemberStats = {
  total: number;
  /** Members with no research group — the public tab lists them on their own. */
  ungrouped: number;
};

export type { AuditContext } from '@/modules/shared/lib/audit';
