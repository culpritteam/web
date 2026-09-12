import { NotFoundError } from '@/modules/shared/lib/errors';
import { attempt, type Result } from '@/modules/shared/lib/result';
import { logger as defaultLogger, type Logger } from '@/modules/shared/lib/logger';
import { TEAM_KIND_RULES } from '@/modules/shared/lib/team-kind';
import type { Course, CvEntry } from '@/modules/teaching';
import type { Project } from '@/modules/projects';
import type { TeamMemberRepository } from './team-member.repository';
import type {
  MemberLink,
  TeamMember,
  TeamMemberProfile,
  TeamMemberStats,
} from './team-member.types';
import type { CreateTeamMemberInput, UpdateTeamMemberInput } from './team-member.schema';
import { resolveTeamAssignment } from './team-assignment';

/**
 * Port onto the teaching module's per-member reads. Injected rather than imported so this service
 * never reaches into another module's repository, and so `findProfile` is testable without a
 * database. Wired to the teaching services in `container.ts`. Both reads throw on failure; the
 * service runs inside `attempt()`, which maps a throw onto the Result channel.
 */
export interface MemberCvDirectory {
  cvEntriesFor(teamMemberId: string): Promise<CvEntry[]>;
  coursesFor(teamMemberId: string): Promise<Course[]>;
}

/** The same port pattern onto the projects module's per-member read. */
export interface MemberProjectDirectory {
  projectsFor(teamMemberId: string): Promise<Project[]>;
}

export type TeamMemberServiceDeps = {
  repository: TeamMemberRepository;
  cv: MemberCvDirectory;
  projects: MemberProjectDirectory;
  logger?: Logger;
};

export interface TeamMemberService {
  /** One member by id, or null. */
  findById(id: string): Promise<Result<TeamMember | null>>;
  /** Everything the member's public profile page renders, or null when the id is unknown. */
  findProfile(id: string): Promise<Result<TeamMemberProfile | null>>;
  /** The director's profile, or null when no member is flagged director. */
  findDirectorProfile(): Promise<Result<TeamMemberProfile | null>>;
  /** Every member, the director first, then by sortOrder. Group them with `groupByTeam`. */
  list(): Promise<Result<TeamMember[]>>;
  /** One member's external links, in the admin's arrangement. */
  listLinks(teamMemberId: string): Promise<Result<MemberLink[]>>;
  /** Headline counts for the dashboard, aggregated in SQL. */
  stats(): Promise<Result<TeamMemberStats>>;
  create(input: CreateTeamMemberInput, actor: string): Promise<Result<TeamMember>>;
  update(id: string, input: UpdateTeamMemberInput, actor: string): Promise<Result<TeamMember>>;
  /** Returns the removed record (pre-delete snapshot) for confirmation. */
  remove(id: string, actor: string): Promise<Result<TeamMember>>;
}

export function createTeamMemberService(deps: TeamMemberServiceDeps): TeamMemberService {
  const { repository, cv, projects } = deps;
  const log = deps.logger ?? defaultLogger;

  async function requireExisting(id: string): Promise<TeamMember> {
    const existing = await repository.findById(id);
    if (!existing) throw new NotFoundError('Team member not found.');
    return existing;
  }

  /**
   * Assembles the profile, gated by the member's team (see shared/lib/team-kind).
   *
   * A section the team is not allowed is not read at all — and rows written while the member was on
   * another team are left exactly where they are. Deleting them on a team change would destroy
   * hand-typed content on what is meant to be a reversible editorial decision, and refusing the team
   * change because rows exist would make the admin clear a CV before they could move someone. So
   * they stay, orphaned and invisible, and come back if the member moves back.
   */
  async function profileOf(member: TeamMember | null): Promise<TeamMemberProfile | null> {
    if (!member) return null;
    const rules = TEAM_KIND_RULES[member.teamKind];
    const [links, cvEntries, courses, memberProjects] = await Promise.all([
      repository.listLinks(member.id),
      rules.cvSections.length > 0 ? cv.cvEntriesFor(member.id) : Promise.resolve([]),
      rules.courses ? cv.coursesFor(member.id) : Promise.resolve([]),
      rules.projects ? projects.projectsFor(member.id) : Promise.resolve([]),
    ]);
    return {
      member,
      links,
      // The team may allow only some sections (a `research` member has research interests and
      // nothing else), so what is read is filtered too, not just switched on and off.
      cvEntries: cvEntries.filter((entry) => rules.cvSections.includes(entry.section)),
      courses,
      projects: memberProjects,
    };
  }

  return {
    findById: (id) => attempt(() => repository.findById(id)),

    findProfile: (id) => attempt(async () => profileOf(await repository.findById(id))),

    findDirectorProfile: () =>
      attempt(async () => {
        // The list is already ordered director-first and is a handful of rows.
        const [first] = await repository.list();
        return profileOf(first?.isDirector ? first : null);
      }),

    list: () => attempt(() => repository.list()),

    listLinks: (teamMemberId) => attempt(() => repository.listLinks(teamMemberId)),

    stats: () => attempt(() => repository.stats()),

    create: (input, actor) =>
      attempt(async () => {
        const created = await repository.createWithAudit({
          // `teamKind` and `isDirector` are reconciled in exactly one place; the repository then
          // clears the flag on every other member inside the same transaction.
          data: { ...input, ...resolveTeamAssignment(input) },
          audit: { actor, action: 'team_member.create' },
        });
        log.info('team_member_created', {
          id: created.id,
          actor,
          teamKind: created.teamKind,
          isDirector: created.isDirector,
        });
        return created;
      }),

    update: (id, input, actor) =>
      attempt(async () => {
        const existing = await requireExisting(id);
        const updated = await repository.updateWithAudit({
          id,
          data: { ...input, ...resolveTeamAssignment(input, existing) },
          audit: { actor, action: 'team_member.update' },
        });
        log.info('team_member_updated', { id, actor, teamKind: updated.teamKind });
        return updated;
      }),

    remove: (id, actor) =>
      attempt(async () => {
        const existing = await requireExisting(id);
        // Their CV entries, courses, projects and links cascade with them, so the before-state goes
        // into the audit entry: a hand-typed profile has no other copy once the row is gone.
        await repository.deleteWithAudit({
          id,
          audit: {
            actor,
            action: 'team_member.delete',
            metadata: {
              name: existing.name,
              citationName: existing.citationName,
              role: existing.role,
              affiliation: existing.affiliation,
              teamKind: existing.teamKind,
              isDirector: existing.isDirector,
            },
          },
        });
        log.info('team_member_deleted', { id, actor });
        return existing;
      }),
  };
}
