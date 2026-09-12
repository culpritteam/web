// Type-only import: erased at build, so this file has NO runtime dependency on a domain module and
// both `research-groups` and `teaching` can import it without a module cycle. That is why the team
// vocabulary lives in shared rather than inside research-groups — teaching enforces the same rules
// on write that research-groups enforces on read, so neither module can own them.
import type { CvSection } from '@/modules/teaching';

/**
 * The four teams a member can belong to, in the fixed order the public Team tab displays them.
 * Owned here rather than imported from Prisma so nothing generated crosses the service boundary —
 * the same convention `CV_SECTIONS` follows.
 */
export const TEAM_KINDS = ['director', 'professor', 'research', 'development'] as const;

export type TeamKind = (typeof TEAM_KINDS)[number];

/** Heading for each team, used on the public Team tab and the admin screens. */
export const TEAM_KIND_LABELS: Record<TeamKind, string> = {
  director: 'Director',
  professor: 'Professors',
  research: 'Research Team',
  development: 'Development Team',
};

/** What a member of a given team may have on their profile. */
export type TeamKindRules = {
  /** The CV sections this team may have entries in. Empty means no CV at all. */
  cvSections: readonly CvSection[];
  courses: boolean;
  projects: boolean;
  /** Whether the profile page resolves research items and publications from bylines. */
  researchAndPublications: boolean;
};

const ALL_CV_SECTIONS = [
  'education',
  'fellowship',
  'scholarship',
  'research_interest',
  'invited_talk',
  'teaching_role',
  'teaching_award',
] as const satisfies readonly CvSection[];

const FULL_PROFILE: TeamKindRules = {
  cvSections: ALL_CV_SECTIONS,
  courses: true,
  projects: true,
  researchAndPublications: true,
};

/**
 * THE per-team attribute rules. Single source of truth: the services enforce them on write, the
 * profile read gates on them, and the admin UI hides what a team cannot have. Bio and links are not
 * listed because every team has both.
 */
export const TEAM_KIND_RULES: Record<TeamKind, TeamKindRules> = {
  director: FULL_PROFILE,
  professor: FULL_PROFILE,
  research: {
    // A researcher lists what they work on, not where they studied.
    cvSections: ['research_interest'],
    courses: false,
    projects: true,
    researchAndPublications: true,
  },
  development: {
    // The people who build the site. Their page is a bio, their projects and their links.
    cvSections: [],
    courses: false,
    projects: true,
    researchAndPublications: false,
  },
};

/** Whether a member of this team may have CV entries in `section`. */
export function allowsCvSection(kind: TeamKind, section: CvSection): boolean {
  return TEAM_KIND_RULES[kind].cvSections.includes(section);
}

/** Whether a member of this team may teach courses. */
export function allowsCourses(kind: TeamKind): boolean {
  return TEAM_KIND_RULES[kind].courses;
}

/** Whether a member of this team may have projects. Currently true for every team. */
export function allowsProjects(kind: TeamKind): boolean {
  return TEAM_KIND_RULES[kind].projects;
}

/** Whether this team's profile page credits them on research items and publications. */
export function allowsResearchAndPublications(kind: TeamKind): boolean {
  return TEAM_KIND_RULES[kind].researchAndPublications;
}

/**
 * The one rule tying `teamKind` and `isDirector` together: the flag is true exactly when the team
 * is `director`. `isDirector` stays because it is what the partial unique index
 * `team_member_one_director` constrains and what every "director first" ordering reads; keeping the
 * two in step is this function's whole job, and it is the only place that decides it.
 */
export function isDirectorTeam(kind: TeamKind): boolean {
  return kind === 'director';
}
