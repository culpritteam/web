import { describe, expect, it } from 'vitest';
import {
  createCourseService,
  createCvEntryService,
  groupByLevel,
  groupBySection,
} from '../teaching.service';
import type { CvEntryRepository } from '../cv-entry.repository';
import type { CourseRepository } from '../course.repository';
import { ABOUT_SECTIONS } from '../teaching.types';
import type { MemberTeamDirectory } from '../teaching.service';
import type { AuditContext, Course, CvEntry } from '../teaching.types';
import type { TeamKind } from '@/modules/shared/lib/team-kind';

const SILENT_LOGGER = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

/**
 * The injected team lookup. Every member in a test belongs to `kind`; `unknown` stands for an id
 * that does not resolve to a member at all.
 */
const membersOn = (kind: TeamKind | 'unknown'): MemberTeamDirectory => ({
  teamKindOf: async () => (kind === 'unknown' ? null : kind),
});
const NOW = new Date('2026-09-02T00:00:00Z');

function makeEntry(overrides: Partial<CvEntry> = {}): CvEntry {
  return {
    id: 'cv_1',
    teamMemberId: 'mem_1',
    section: 'education',
    title: 'PhD in Computer Science',
    subtitle: null,
    year: null,
    description: null,
    sortOrder: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: 'course_1',
    teamMemberId: 'mem_1',
    code: null,
    title: 'Applied Cryptography',
    level: 'Graduate',
    term: null,
    description: null,
    link: null,
    sortOrder: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

class FakeEntryRepository implements CvEntryRepository {
  store = new Map<string, CvEntry>();
  audits: (AuditContext & { entityId: string })[] = [];
  private seq = 0;

  seed(entry: CvEntry) {
    this.store.set(entry.id, { ...entry });
  }

  async findById(id: string) {
    const found = this.store.get(id);
    return found ? { ...found } : null;
  }

  async listForMember(teamMemberId: string) {
    return [...this.store.values()].filter((e) => e.teamMemberId === teamMemberId);
  }

  // The reduction the dashboard used to run in memory: every entry fetched, then `.length` and a
  // `some()` per About section to see which lists had anything in them.
  async stats() {
    const rows = [...this.store.values()];
    return { total: rows.length, sections: [...new Set(rows.map((row) => row.section))] };
  }

  async createWithAudit(input: { data: Partial<CvEntry>; audit: AuditContext }) {
    const id = `cv_${++this.seq}`;
    const entry = makeEntry({ ...input.data, id });
    this.store.set(id, entry);
    this.audits.push({ ...input.audit, entityId: id });
    return { ...entry };
  }

  async updateWithAudit(input: { id: string; data: Partial<CvEntry>; audit: AuditContext }) {
    const current = this.store.get(input.id);
    if (!current) throw new Error('not found');
    const updated = { ...current, ...input.data };
    this.store.set(input.id, updated);
    this.audits.push({ ...input.audit, entityId: input.id });
    return { ...updated };
  }

  async deleteWithAudit(input: { id: string; audit: AuditContext }) {
    this.store.delete(input.id);
    this.audits.push({ ...input.audit, entityId: input.id });
  }
}

class FakeCourseRepository implements CourseRepository {
  store = new Map<string, Course>();
  audits: (AuditContext & { entityId: string })[] = [];
  private seq = 0;

  seed(course: Course) {
    this.store.set(course.id, { ...course });
  }

  async findById(id: string) {
    const found = this.store.get(id);
    return found ? { ...found } : null;
  }

  async listForMember(teamMemberId: string) {
    return [...this.store.values()]
      .filter((c) => c.teamMemberId === teamMemberId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async stats() {
    return { total: this.store.size };
  }

  async createWithAudit(input: { data: Partial<Course>; audit: AuditContext }) {
    const id = `course_${++this.seq}`;
    const course = makeCourse({ ...input.data, id });
    this.store.set(id, course);
    this.audits.push({ ...input.audit, entityId: id });
    return { ...course };
  }

  async updateWithAudit(input: { id: string; data: Partial<Course>; audit: AuditContext }) {
    const current = this.store.get(input.id);
    if (!current) throw new Error('not found');
    const updated = { ...current, ...input.data };
    this.store.set(input.id, updated);
    this.audits.push({ ...input.audit, entityId: input.id });
    return { ...updated };
  }

  async deleteWithAudit(input: { id: string; audit: AuditContext }) {
    this.store.delete(input.id);
    this.audits.push({ ...input.audit, entityId: input.id });
  }
}

describe('cv entry service', () => {
  it('creates an entry and writes an audit row', async () => {
    const repository = new FakeEntryRepository();
    const service = createCvEntryService({ repository, members: membersOn('director'), logger: SILENT_LOGGER });

    const result = await service.create(
      { teamMemberId: 'mem_1', section: 'teaching_role', title: 'Lecturer' },
      'admin:1',
    );

    expect(result.ok).toBe(true);
    expect(repository.audits[0]).toMatchObject({ actor: 'admin:1', action: 'cv_entry.create' });
  });

  it('records the before-state when deleting', async () => {
    const repository = new FakeEntryRepository();
    repository.seed(makeEntry({ id: 'cv_9', section: 'teaching_award', title: 'Teaching Prize' }));
    const service = createCvEntryService({ repository, members: membersOn('director'), logger: SILENT_LOGGER });

    const result = await service.remove('cv_9', 'admin:1');

    expect(result.ok).toBe(true);
    expect(repository.store.has('cv_9')).toBe(false);
    expect(repository.audits[0]).toMatchObject({
      action: 'cv_entry.delete',
      metadata: { teamMemberId: 'mem_1', section: 'teaching_award', title: 'Teaching Prize' },
    });
  });

  it('refuses to update or delete an id that does not exist', async () => {
    const service = createCvEntryService({
      repository: new FakeEntryRepository(),
      members: membersOn('director'),
      logger: SILENT_LOGGER,
    });

    expect((await service.update('missing', { title: 'x' }, 'admin:1')).ok).toBe(false);
    expect((await service.remove('missing', 'admin:1')).ok).toBe(false);
  });

  it("returns only the given member's entries", async () => {
    const repository = new FakeEntryRepository();
    repository.seed(makeEntry({ id: 'a', teamMemberId: 'mem_1' }));
    repository.seed(makeEntry({ id: 'b', teamMemberId: 'mem_2' }));
    const service = createCvEntryService({ repository, members: membersOn('director'), logger: SILENT_LOGGER });

    const result = await service.listForMember('mem_2');

    expect(result.ok && result.data.map((e) => e.id)).toEqual(['b']);
  });

  it('stats() reports the total and which sections are populated', async () => {
    const repository = new FakeEntryRepository();
    repository.seed(makeEntry({ id: 'a', section: 'education' }));
    repository.seed(makeEntry({ id: 'b', section: 'education' }));
    repository.seed(makeEntry({ id: 'c', section: 'invited_talk' }));
    const service = createCvEntryService({ repository, members: membersOn('director'), logger: SILENT_LOGGER });

    const result = await service.stats();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.total).toBe(3);
    expect([...result.data.sections].sort()).toEqual(['education', 'invited_talk']);

    // The completeness meter counts About sections that have at least one entry — the same
    // answer the dashboard used to get by scanning every row with `.some()`.
    const entries = await repository.listForMember('mem_1');
    const populated = new Set(result.data.sections);
    expect(ABOUT_SECTIONS.filter((section) => populated.has(section)).length).toBe(
      ABOUT_SECTIONS.filter((section) => entries.some((entry) => entry.section === section)).length,
    );
  });
});

describe('course service', () => {
  it('creates a course and writes an audit row', async () => {
    const repository = new FakeCourseRepository();
    const service = createCourseService({ repository, members: membersOn('director'), logger: SILENT_LOGGER });

    const result = await service.create(
      { teamMemberId: 'mem_1', title: 'Systems Security', level: 'Undergraduate' },
      'admin:1',
    );

    expect(result.ok).toBe(true);
    expect(repository.audits[0]).toMatchObject({ action: 'course.create' });
  });

  it("returns only the given member's courses, in sort order", async () => {
    const repository = new FakeCourseRepository();
    repository.seed(makeCourse({ id: 'b', teamMemberId: 'mem_1', sortOrder: 2 }));
    repository.seed(makeCourse({ id: 'a', teamMemberId: 'mem_1', sortOrder: 1 }));
    repository.seed(makeCourse({ id: 'x', teamMemberId: 'mem_2' }));
    const service = createCourseService({ repository, members: membersOn('director'), logger: SILENT_LOGGER });

    const result = await service.listForMember('mem_1');

    expect(result.ok && result.data.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('refuses to delete an id that does not exist', async () => {
    const service = createCourseService({
      repository: new FakeCourseRepository(),
      members: membersOn('director'),
      logger: SILENT_LOGGER,
    });

    expect((await service.remove('missing', 'admin:1')).ok).toBe(false);
  });

  it('stats() counts the courses without listing them', async () => {
    const repository = new FakeCourseRepository();
    repository.seed(makeCourse({ id: 'a' }));
    repository.seed(makeCourse({ id: 'b' }));
    const service = createCourseService({ repository, members: membersOn('director'), logger: SILENT_LOGGER });

    const result = await service.stats();

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ total: 2 });
  });
});

// The per-team attribute rules (shared/lib/team-kind), enforced on write. Rejections are
// `validation` errors — nothing in this codebase has a state machine, so no service returns 409 —
// and they must leave NOTHING behind: no row, no audit entry.
describe('team rules', () => {
  const CV_INPUT = { teamMemberId: 'mem_1', section: 'education', title: 'PhD' } as const;
  const COURSE_INPUT = { teamMemberId: 'mem_1', title: 'Systems Security', level: 'Graduate' };

  function cvServiceFor(kind: TeamKind | 'unknown') {
    const repository = new FakeEntryRepository();
    return {
      repository,
      service: createCvEntryService({
        repository,
        members: membersOn(kind),
        logger: SILENT_LOGGER,
      }),
    };
  }

  function courseServiceFor(kind: TeamKind | 'unknown') {
    const repository = new FakeCourseRepository();
    return {
      repository,
      service: createCourseService({
        repository,
        members: membersOn(kind),
        logger: SILENT_LOGGER,
      }),
    };
  }

  it.each(['director', 'professor'] as const)('lets a %s member teach a course', async (kind) => {
    const { repository, service } = courseServiceFor(kind);

    expect((await service.create(COURSE_INPUT, 'admin:1')).ok).toBe(true);
    expect(repository.store.size).toBe(1);
  });

  it.each(['research', 'development'] as const)(
    'rejects a course for a %s member, writing nothing',
    async (kind) => {
      const { repository, service } = courseServiceFor(kind);

      const result = await service.create(COURSE_INPUT, 'admin:1');

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('validation');
      expect(repository.store.size).toBe(0);
      expect(repository.audits).toEqual([]);
    },
  );

  it('rejects updating a course whose member has since moved off a teaching team', async () => {
    const { repository, service } = courseServiceFor('research');
    repository.seed(makeCourse({ id: 'course_9' }));

    const result = await service.update('course_9', { title: 'Renamed' }, 'admin:1');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('validation');
    expect(repository.store.get('course_9')?.title).toBe('Applied Cryptography');
    expect(repository.audits).toEqual([]);
  });

  it.each(['director', 'professor'] as const)('lets a %s member have any CV section', async (kind) => {
    const { service } = cvServiceFor(kind);

    expect((await service.create({ ...CV_INPUT, section: 'education' }, 'admin:1')).ok).toBe(true);
    expect((await service.create({ ...CV_INPUT, section: 'teaching_award' }, 'admin:1')).ok).toBe(
      true,
    );
  });

  it('lets a research member have research interests only', async () => {
    const { repository, service } = cvServiceFor('research');

    const allowed = await service.create({ ...CV_INPUT, section: 'research_interest' }, 'admin:1');
    const rejected = await service.create({ ...CV_INPUT, section: 'education' }, 'admin:1');

    expect(allowed.ok).toBe(true);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.error.kind).toBe('validation');
    expect(repository.store.size).toBe(1);
  });

  it.each(['education', 'research_interest', 'teaching_role'] as const)(
    'rejects a %s entry for a development member',
    async (section) => {
      const { repository, service } = cvServiceFor('development');

      const result = await service.create({ ...CV_INPUT, section }, 'admin:1');

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('validation');
      expect(repository.store.size).toBe(0);
      expect(repository.audits).toEqual([]);
    },
  );

  it('rejects MOVING an entry into a section the member’s team cannot have', async () => {
    const { repository, service } = cvServiceFor('research');
    repository.seed(makeEntry({ id: 'cv_9', section: 'research_interest', title: 'Privacy' }));

    const result = await service.update('cv_9', { section: 'education' }, 'admin:1');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('validation');
    expect(repository.store.get('cv_9')?.section).toBe('research_interest');
    expect(repository.audits).toEqual([]);
  });

  it('allows an update that leaves the section where the team allows it', async () => {
    const { repository, service } = cvServiceFor('research');
    repository.seed(makeEntry({ id: 'cv_9', section: 'research_interest', title: 'Privacy' }));

    const result = await service.update('cv_9', { title: 'Privacy by design' }, 'admin:1');

    expect(result.ok).toBe(true);
    expect(repository.store.get('cv_9')?.title).toBe('Privacy by design');
  });

  it('rejects a write aimed at a member id that does not exist', async () => {
    const cv = cvServiceFor('unknown');
    const course = courseServiceFor('unknown');

    const cvResult = await cv.service.create(CV_INPUT, 'admin:1');
    const courseResult = await course.service.create(COURSE_INPUT, 'admin:1');

    expect(cvResult.ok).toBe(false);
    if (!cvResult.ok) expect(cvResult.error.kind).toBe('not_found');
    expect(courseResult.ok).toBe(false);
    if (!courseResult.ok) expect(courseResult.error.kind).toBe('not_found');
  });
});

describe('groupBySection', () => {
  it('orders groups the way the caller asked, not the way rows arrived', () => {
    const entries = [
      makeEntry({ id: 'talk', section: 'invited_talk' }),
      makeEntry({ id: 'edu', section: 'education' }),
    ];

    const groups = groupBySection(entries, ABOUT_SECTIONS);

    expect(groups.map((g) => g.section)).toEqual(['education', 'invited_talk']);
  });

  it('drops empty sections so no heading renders with nothing under it', () => {
    const groups = groupBySection([makeEntry({ section: 'education' })], ABOUT_SECTIONS);

    expect(groups).toHaveLength(1);
    expect(groupBySection([], ABOUT_SECTIONS)).toEqual([]);
  });
});

describe('groupByLevel', () => {
  it('keeps the admin ordering — first appearance fixes a level position', () => {
    const courses = [
      makeCourse({ id: '1', level: 'Graduate', sortOrder: 0 }),
      makeCourse({ id: '2', level: 'Undergraduate', sortOrder: 1 }),
      makeCourse({ id: '3', level: 'Graduate', sortOrder: 2 }),
    ];

    const groups = groupByLevel(courses);

    expect(groups.map((g) => g.level)).toEqual(['Graduate', 'Undergraduate']);
    expect(groups[0]!.courses.map((c) => c.id)).toEqual(['1', '3']);
  });

  it('handles an empty list', () => {
    expect(groupByLevel([])).toEqual([]);
  });
});
