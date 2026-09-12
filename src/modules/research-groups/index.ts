// research-groups module — the lab's team members (ADR-016). The name predates the removal of
// research groups and is kept so imports did not all have to move; every member has a profile page,
// and the director is the member flagged `isDirector`.

export {
  createTeamMemberSchema,
  updateTeamMemberSchema,
  teamKindSchema,
  type CreateTeamMemberInput,
  type UpdateTeamMemberInput,
  type MemberLinkInput,
} from './team-member.schema';

export type {
  TeamMember,
  TeamMemberProfile,
  TeamMemberStats,
  MemberLink,
  AuditContext,
} from './team-member.types';

// The team vocabulary and the per-team attribute rules live in shared (the teaching module enforces
// the same rules on write, so neither module can own them) and are re-exported here as part of this
// module's public surface.
export {
  TEAM_KINDS,
  TEAM_KIND_LABELS,
  TEAM_KIND_RULES,
  allowsCourses,
  allowsCvSection,
  allowsProjects,
  allowsResearchAndPublications,
  isDirectorTeam,
  type TeamKind,
  type TeamKindRules,
} from '@/modules/shared/lib/team-kind';

export {
  groupByTeam,
  resolveTeamAssignment,
  type TeamAssignment,
  type TeamGroup,
} from './team-assignment';

export {
  createTeamMemberService,
  type TeamMemberService,
  type TeamMemberServiceDeps,
  type MemberCvDirectory,
  type MemberProjectDirectory,
} from './team-member.service';

export type { TeamMemberRepository } from './team-member.repository';

export {
  matchMember,
  isMemberByline,
  bylineSuggestions,
  type BylineMember,
} from './byline-match';

export { getTeamMemberService } from './container';

export { TeamMembersView, TeamMemberCard, memberInitials } from './ui/team-members-view';
export { BylineNames } from './ui/byline-names';
export { CreditedWorkList, type CreditedWork } from './ui/credited-works';
export { TeamMembersTable } from './ui/team-members-table';
