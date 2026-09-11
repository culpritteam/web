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
import type { AuditContext, Course, CvEntry } from '../teaching.types';

const SILENT_LOGGER = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
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
    const service = createCvEntryService({ repository, logger: SILENT_LOGGER });

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
    const service = createCvEntryService({ repository, logger: SILENT_LOGGER });

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
      logger: SILENT_LOGGER,
    });

    expect((await service.update('missing', { title: 'x' }, 'admin:1')).ok).toBe(false);
    expect((await service.remove('missing', 'admin:1')).ok).toBe(false);
  });

  it("returns only the given member's entries", async () => {
    const repository = new FakeEntryRepository();
    repository.seed(makeEntry({ id: 'a', teamMemberId: 'mem_1' }));
    repository.seed(makeEntry({ id: 'b', teamMemberId: 'mem_2' }));
    const service = createCvEntryService({ repository, logger: SILENT_LOGGER });

    const result = await service.listForMember('mem_2');

    expect(result.ok && result.data.map((e) => e.id)).toEqual(['b']);
  });

  it('stats() reports the total and which sections are populated', async () => {
    const repository = new FakeEntryRepository();
    repository.seed(makeEntry({ id: 'a', section: 'education' }));
    repository.seed(makeEntry({ id: 'b', section: 'education' }));
    repository.seed(makeEntry({ id: 'c', section: 'invited_talk' }));
    const service = createCvEntryService({ repository, logger: SILENT_LOGGER });

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
    const service = createCourseService({ repository, logger: SILENT_LOGGER });

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
    const service = createCourseService({ repository, logger: SILENT_LOGGER });

    const result = await service.listForMember('mem_1');

    expect(result.ok && result.data.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('refuses to delete an id that does not exist', async () => {
    const service = createCourseService({
      repository: new FakeCourseRepository(),
      logger: SILENT_LOGGER,
    });

    expect((await service.remove('missing', 'admin:1')).ok).toBe(false);
  });

  it('stats() counts the courses without listing them', async () => {
    const repository = new FakeCourseRepository();
    repository.seed(makeCourse({ id: 'a' }));
    repository.seed(makeCourse({ id: 'b' }));
    const service = createCourseService({ repository, logger: SILENT_LOGGER });

    const result = await service.stats();

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ total: 2 });
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
