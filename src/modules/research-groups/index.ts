// research-groups module — the lab's team members (ADR-016). The name predates the removal of
// research groups and is kept so imports did not all have to move; every member has a profile page,
// and the director is the member flagged `isDirector`.

export {
  createTeamMemberSchema,
  updateTeamMemberSchema,
  type CreateTeamMemberInput,
  type UpdateTeamMemberInput,
} from './team-member.schema';

export type {
  TeamMember,
  TeamMemberProfile,
  TeamMemberStats,
  AuditContext,
} from './team-member.types';

export {
  createTeamMemberService,
  type TeamMemberService,
  type TeamMemberServiceDeps,
  type MemberCvDirectory,
} from './team-member.service';

export type { TeamMemberRepository } from './team-member.repository';

export { matchMember, type BylineMember } from './byline-match';

export { getTeamMemberService } from './container';

export { TeamMembersView, TeamMemberCard, memberInitials } from './ui/team-members-view';
export { BylineNames } from './ui/byline-names';
export { TeamMembersTable } from './ui/team-members-table';
