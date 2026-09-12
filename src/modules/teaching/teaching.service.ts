import { NotFoundError, ValidationError } from '@/modules/shared/lib/errors';
import { attempt, type Result } from '@/modules/shared/lib/result';
import { logger as defaultLogger, type Logger } from '@/modules/shared/lib/logger';
import {
  TEAM_KIND_LABELS,
  allowsCourses,
  allowsCvSection,
  type TeamKind,
} from '@/modules/shared/lib/team-kind';
import type { CvEntryRepository } from './cv-entry.repository';
import type { CourseRepository } from './course.repository';
import { CV_SECTION_LABELS } from './teaching.types';
import type { Course, CourseStats, CvEntry, CvEntryStats, CvSection } from './teaching.types';
import type {
  CreateCourseInput,
  CreateCvEntryInput,
  UpdateCourseInput,
  UpdateCvEntryInput,
} from './teaching.schema';

// Business layer for the CV and Teaching sections of a team member's profile page. Courses and CV entries are plain published
// content — no status, no lifecycle, nothing that can return 409 — so the services are thin:
// existence checks, the per-team attribute rules below, audit context, structured logging, errors
// on the Result channel.

/**
 * Port onto the research-groups module's team lookup. Injected rather than imported so this service
 * never reaches into another module's repository, and so the team rules are testable without a
 * database. Wired in `container.ts`.
 */
export interface MemberTeamDirectory {
  /** The member's team, or null when the id is unknown. */
  teamKindOf(teamMemberId: string): Promise<TeamKind | null>;
}

/**
 * The team a write is aimed at. Not every team may have every kind of row — see
 * shared/lib/team-kind for the rules table, the single source of truth that these services enforce
 * on write and the public profile read gates on.
 */
async function requireTeamKind(
  members: MemberTeamDirectory,
  teamMemberId: string,
): Promise<TeamKind> {
  const kind = await members.teamKindOf(teamMemberId);
  if (!kind) throw new NotFoundError('Team member not found.');
  return kind;
}

export type CvEntryServiceDeps = {
  repository: CvEntryRepository;
  members: MemberTeamDirectory;
  logger?: Logger;
};

export interface CvEntryService {
  /** One member's entries, every section, ordered by section then the admin's arrangement. */
  listForMember(teamMemberId: string): Promise<Result<CvEntry[]>>;
  /** Headline counts for the dashboard, aggregated in SQL. */
  stats(): Promise<Result<CvEntryStats>>;
  create(input: CreateCvEntryInput, actor: string): Promise<Result<CvEntry>>;
  update(id: string, input: UpdateCvEntryInput, actor: string): Promise<Result<CvEntry>>;
  /** Returns the removed record (pre-delete snapshot) for confirmation. */
  remove(id: string, actor: string): Promise<Result<CvEntry>>;
}

export function createCvEntryService(deps: CvEntryServiceDeps): CvEntryService {
  const { repository, members } = deps;
  const log = deps.logger ?? defaultLogger;

  async function requireExisting(id: string): Promise<CvEntry> {
    const existing = await repository.findById(id);
    if (!existing) throw new NotFoundError('Entry not found.');
    return existing;
  }

  /**
   * Rejects a CV entry the owning member's team may not have: a `research` member keeps research
   * interests and nothing else, and a `development` member has no CV at all. A validation error,
   * not a conflict — nothing here has a state machine, and no service in this codebase returns 409.
   */
  async function requireSectionAllowed(teamMemberId: string, section: CvSection): Promise<void> {
    const kind = await requireTeamKind(members, teamMemberId);
    if (!allowsCvSection(kind, section)) {
      throw new ValidationError(
        `${TEAM_KIND_LABELS[kind]} members cannot have "${CV_SECTION_LABELS[section]}" entries.`,
        { section: ['Not available for this team.'] },
      );
    }
  }

  return {
    listForMember: (teamMemberId) => attempt(() => repository.listForMember(teamMemberId)),

    stats: () => attempt(() => repository.stats()),

    create: (input, actor) =>
      attempt(async () => {
        await requireSectionAllowed(input.teamMemberId, input.section);
        const created = await repository.createWithAudit({
          data: input,
          audit: { actor, action: 'cv_entry.create' },
        });
        log.info('cv_entry_created', {
          id: created.id,
          teamMemberId: created.teamMemberId,
          section: created.section,
          actor,
        });
        return created;
      }),

    update: (id, input, actor) =>
      attempt(async () => {
        const existing = await requireExisting(id);
        // Checked against where the entry is GOING — an update can move it to another section. The
        // owning member cannot change, but their team can have changed since the entry was written.
        await requireSectionAllowed(existing.teamMemberId, input.section ?? existing.section);
        const updated = await repository.updateWithAudit({
          id,
          data: input,
          audit: { actor, action: 'cv_entry.update' },
        });
        log.info('cv_entry_updated', { id, actor });
        return updated;
      }),

    remove: (id, actor) =>
      attempt(async () => {
        const existing = await requireExisting(id);
        // The before-state goes into the audit entry inside the delete transaction. A CV line is
        // typed by hand and has no other copy once the row is gone.
        await repository.deleteWithAudit({
          id,
          audit: {
            actor,
            action: 'cv_entry.delete',
            metadata: {
              teamMemberId: existing.teamMemberId,
              section: existing.section,
              title: existing.title,
              subtitle: existing.subtitle,
              year: existing.year,
              description: existing.description,
            },
          },
        });
        log.info('cv_entry_deleted', { id, actor });
        return existing;
      }),
  };
}

export type CourseServiceDeps = {
  repository: CourseRepository;
  members: MemberTeamDirectory;
  logger?: Logger;
};

export interface CourseService {
  /** One member's courses, in the admin's arrangement. */
  listForMember(teamMemberId: string): Promise<Result<Course[]>>;
  /** Headline counts for the dashboard, aggregated in SQL. */
  stats(): Promise<Result<CourseStats>>;
  create(input: CreateCourseInput, actor: string): Promise<Result<Course>>;
  update(id: string, input: UpdateCourseInput, actor: string): Promise<Result<Course>>;
  remove(id: string, actor: string): Promise<Result<Course>>;
}

export function createCourseService(deps: CourseServiceDeps): CourseService {
  const { repository, members } = deps;
  const log = deps.logger ?? defaultLogger;

  async function requireExisting(id: string): Promise<Course> {
    const existing = await repository.findById(id);
    if (!existing) throw new NotFoundError('Course not found.');
    return existing;
  }

  /**
   * Only the director and professors teach. A validation error, not a conflict — nothing here has a
   * state machine, and no service in this codebase returns 409.
   */
  async function requireCoursesAllowed(teamMemberId: string): Promise<void> {
    const kind = await requireTeamKind(members, teamMemberId);
    if (!allowsCourses(kind)) {
      throw new ValidationError(`${TEAM_KIND_LABELS[kind]} members cannot teach courses.`, {
        teamMemberId: ['Courses are only available to the director and professors.'],
      });
    }
  }

  return {
    listForMember: (teamMemberId) => attempt(() => repository.listForMember(teamMemberId)),

    stats: () => attempt(() => repository.stats()),

    create: (input, actor) =>
      attempt(async () => {
        await requireCoursesAllowed(input.teamMemberId);
        const created = await repository.createWithAudit({
          data: input,
          audit: { actor, action: 'course.create' },
        });
        log.info('course_created', { id: created.id, actor });
        return created;
      }),

    update: (id, input, actor) =>
      attempt(async () => {
        const existing = await requireExisting(id);
        // Re-checked on every update: the owning member cannot change, but their team can have
        // changed since the course was written.
        await requireCoursesAllowed(existing.teamMemberId);
        const updated = await repository.updateWithAudit({
          id,
          data: input,
          audit: { actor, action: 'course.update' },
        });
        log.info('course_updated', { id, actor });
        return updated;
      }),

    remove: (id, actor) =>
      attempt(async () => {
        const existing = await requireExisting(id);
        await repository.deleteWithAudit({
          id,
          audit: {
            actor,
            action: 'course.delete',
            metadata: {
              teamMemberId: existing.teamMemberId,
              code: existing.code,
              title: existing.title,
              level: existing.level,
              term: existing.term,
            },
          },
        });
        log.info('course_deleted', { id, actor });
        return existing;
      }),
  };
}

/**
 * Groups entries under their section heading, in the order the caller asked for the sections.
 * Empty sections are dropped — a heading with nothing under it is noise on a public page.
 */
export function groupBySection(
  entries: CvEntry[],
  sections: readonly CvSection[],
): { section: CvSection; entries: CvEntry[] }[] {
  return sections
    .map((section) => ({ section, entries: entries.filter((entry) => entry.section === section) }))
    .filter((group) => group.entries.length > 0);
}

/**
 * Groups courses by `level`, keeping the admin's own ordering: the service returns rows by
 * `sortOrder`, so the first time a level appears fixes its position. Sorting levels alphabetically
 * would silently override the sequence the admin arranged — same reasoning as the Research index.
 */
export function groupByLevel(courses: Course[]): { level: string; courses: Course[] }[] {
  const groups = new Map<string, Course[]>();
  for (const course of courses) {
    const existing = groups.get(course.level);
    if (existing) existing.push(course);
    else groups.set(course.level, [course]);
  }
  return [...groups].map(([level, grouped]) => ({ level, courses: grouped }));
}
