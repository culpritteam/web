import { NotFoundError } from '@/modules/shared/lib/errors';
import { attempt, type Result } from '@/modules/shared/lib/result';
import { logger as defaultLogger, type Logger } from '@/modules/shared/lib/logger';
import type { Course, CvEntry } from '@/modules/teaching';
import type { TeamMemberRepository } from './team-member.repository';
import type { TeamMember, TeamMemberProfile, TeamMemberStats } from './team-member.types';
import type { CreateTeamMemberInput, UpdateTeamMemberInput } from './team-member.schema';

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

export type TeamMemberServiceDeps = {
  repository: TeamMemberRepository;
  cv: MemberCvDirectory;
  logger?: Logger;
};

export interface TeamMemberService {
  /** One member by id, or null. */
  findById(id: string): Promise<Result<TeamMember | null>>;
  /** Everything the member's public profile page renders, or null when the id is unknown. */
  findProfile(id: string): Promise<Result<TeamMemberProfile | null>>;
  /** The director's profile, or null when no member is flagged director. */
  findDirectorProfile(): Promise<Result<TeamMemberProfile | null>>;
  /** Every member, the director first, then by sortOrder. */
  list(): Promise<Result<TeamMember[]>>;
  /** Headline counts for the dashboard, aggregated in SQL. */
  stats(): Promise<Result<TeamMemberStats>>;
  create(input: CreateTeamMemberInput, actor: string): Promise<Result<TeamMember>>;
  update(id: string, input: UpdateTeamMemberInput, actor: string): Promise<Result<TeamMember>>;
  /** Returns the removed record (pre-delete snapshot) for confirmation. */
  remove(id: string, actor: string): Promise<Result<TeamMember>>;
}

export function createTeamMemberService(deps: TeamMemberServiceDeps): TeamMemberService {
  const { repository, cv } = deps;
  const log = deps.logger ?? defaultLogger;

  async function requireExisting(id: string): Promise<TeamMember> {
    const existing = await repository.findById(id);
    if (!existing) throw new NotFoundError('Team member not found.');
    return existing;
  }

  async function profileOf(member: TeamMember | null): Promise<TeamMemberProfile | null> {
    if (!member) return null;
    const [cvEntries, courses] = await Promise.all([
      cv.cvEntriesFor(member.id),
      cv.coursesFor(member.id),
    ]);
    return { member, cvEntries, courses };
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

    stats: () => attempt(() => repository.stats()),

    create: (input, actor) =>
      attempt(async () => {
        const created = await repository.createWithAudit({
          data: input,
          audit: { actor, action: 'team_member.create' },
        });
        log.info('team_member_created', { id: created.id, actor, isDirector: created.isDirector });
        return created;
      }),

    update: (id, input, actor) =>
      attempt(async () => {
        await requireExisting(id);
        const updated = await repository.updateWithAudit({
          id,
          data: input,
          audit: { actor, action: 'team_member.update' },
        });
        log.info('team_member_updated', { id, actor });
        return updated;
      }),

    remove: (id, actor) =>
      attempt(async () => {
        const existing = await requireExisting(id);
        // Their CV entries and courses cascade with them, so the before-state goes into the audit
        // entry: a hand-typed profile has no other copy once the row is gone.
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
              isDirector: existing.isDirector,
            },
          },
        });
        log.info('team_member_deleted', { id, actor });
        return existing;
      }),
  };
}
