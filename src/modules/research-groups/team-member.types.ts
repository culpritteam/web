import type { Course, CvEntry } from '@/modules/teaching';
import type { Project } from '@/modules/projects';
import type { TeamKind } from '@/modules/shared/lib/team-kind';

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
  /** Which team they belong to, and therefore which profile sections they may have. */
  teamKind: TeamKind;
  /**
   * The lab director. True exactly when `teamKind` is `director` — the service keeps the two in
   * step (`resolveTeamAssignment`). At most one member has it; the list puts her first.
   */
  isDirector: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * One external profile link on a member's page — "LinkedIn", "GitHub", "ORCID", whatever the admin
 * typed. Replaced the fixed `linkedinUrl`/`googleScholarUrl` columns. Edited as part of the member,
 * the way `PublicationAuthor` rows are edited as part of their publication.
 */
export type MemberLink = {
  id: string;
  label: string;
  url: string;
  sortOrder: number;
};

/**
 * Everything a member's public profile page renders.
 *
 * The CV, course and project arrays are ALREADY GATED by the member's team (see
 * shared/lib/team-kind): a member whose team changed after those rows were written keeps the rows —
 * nothing is deleted, and a team change is never blocked — they simply stop being returned here,
 * so the page can render this straight through.
 */
export type TeamMemberProfile = {
  member: TeamMember;
  links: MemberLink[];
  cvEntries: CvEntry[];
  courses: Course[];
  projects: Project[];
};

/** Headline counts for the admin dashboard, computed in SQL rather than by listing every row. */
export type TeamMemberStats = {
  total: number;
};

export type { AuditContext } from '@/modules/shared/lib/audit';
