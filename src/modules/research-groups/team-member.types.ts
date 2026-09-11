import type { Course, CvEntry } from '@/modules/teaching';

// Domain model — the shape services/routes work with. Mapped from the Prisma row inside the
// repository so Prisma's generated types never leak across the service boundary.
export type TeamMember = {
  id: string;
  name: string;
  /** Byline form of the name, e.g. "J. Jaimunk". Byline names are matched against it and `name`. */
  citationName: string | null;
  role: string;
  affiliation: string | null;
  bio: string | null;
  photoUrl: string | null;
  linkedinUrl: string | null;
  googleScholarUrl: string | null;
  /** The lab director. At most one member has it; the list puts her first. */
  isDirector: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

/** Everything a member's public profile page renders: the member, their CV lines and courses. */
export type TeamMemberProfile = {
  member: TeamMember;
  cvEntries: CvEntry[];
  courses: Course[];
};

/** Headline counts for the admin dashboard, computed in SQL rather than by listing every row. */
export type TeamMemberStats = {
  total: number;
};

export type { AuditContext } from '@/modules/shared/lib/audit';
