import { describe, expect, it, vi } from 'vitest';
import { createTeamMemberService, type MemberCvDirectory } from '../team-member.service';
import type {
  CreateTeamMemberData,
  TeamMemberRepository,
  UpdateTeamMemberData,
} from '../team-member.repository';
import type { AuditContext, TeamMember } from '../team-member.types';
import type { Course, CvEntry } from '@/modules/teaching';

const NOW = new Date('2026-09-11T00:00:00Z');

function makeMember(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    id: 'mem_1',
    name: 'Jane Doe',
    citationName: null,
    role: 'PhD Candidate',
    affiliation: null,
    bio: null,
    photoUrl: null,
    linkedinUrl: null,
    googleScholarUrl: null,
    isDirector: false,
    sortOrder: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

/** Mirrors the Prisma repository's rules: director first, and one director at most. */
class FakeRepository implements TeamMemberRepository {
  store = new Map<string, TeamMember>();
  audits: (AuditContext & { entityId: string })[] = [];
  private seq = 0;

  seed(member: TeamMember) {
    this.store.set(member.id, { ...member });
  }

  async findById(id: string): Promise<TeamMember | null> {
    const found = this.store.get(id);
    return found ? { ...found } : null;
  }

  async list(): Promise<TeamMember[]> {
    return [...this.store.values()].sort(
      (a, b) => Number(b.isDirector) - Number(a.isDirector) || a.sortOrder - b.sortOrder,
    );
  }

  async stats() {
    return { total: this.store.size };
  }

  private clearOtherDirectors(exceptId?: string) {
    for (const member of this.store.values()) {
      if (member.id !== exceptId) member.isDirector = false;
    }
  }

  async createWithAudit(input: { data: CreateTeamMemberData; audit: AuditContext }) {
    if (input.data.isDirector) this.clearOtherDirectors();
    const id = `mem_${++this.seq}`;
    const member = makeMember({
      id,
      name: input.data.name,
      role: input.data.role,
      citationName: input.data.citationName ?? null,
      isDirector: input.data.isDirector ?? false,
      sortOrder: input.data.sortOrder ?? 0,
    });
    this.store.set(id, member);
    this.audits.push({ ...input.audit, entityId: id });
    return { ...member };
  }

  async updateWithAudit(input: { id: string; data: UpdateTeamMemberData; audit: AuditContext }) {
    const current = this.store.get(input.id);
    if (!current) throw new Error('not found');
    if (input.data.isDirector) this.clearOtherDirectors(input.id);
    const defined = Object.fromEntries(
      Object.entries(input.data).filter(([, value]) => value !== undefined),
    );
    const updated: TeamMember = { ...current, ...defined, updatedAt: NOW };
    this.store.set(input.id, updated);
    this.audits.push({ ...input.audit, entityId: input.id });
    return { ...updated };
  }

  async deleteWithAudit(input: { id: string; audit: AuditContext }) {
    if (!this.store.delete(input.id)) throw new Error('not found');
    this.audits.push({ ...input.audit, entityId: input.id });
  }
}

const ENTRY = { id: 'cv_1', teamMemberId: 'mem_1', title: 'PhD' } as CvEntry;
const COURSE = { id: 'course_1', teamMemberId: 'mem_1', title: 'Security' } as Course;

function build() {
  const repository = new FakeRepository();
  const cv: MemberCvDirectory = {
    cvEntriesFor: vi.fn(async (id: string) => (id === 'mem_1' ? [ENTRY] : [])),
    coursesFor: vi.fn(async (id: string) => (id === 'mem_1' ? [COURSE] : [])),
  };
  const service = createTeamMemberService({
    repository,
    cv,
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  });
  return { repository, service, cv };
}

describe('team member service', () => {
  it('create() persists a non-director by default and audits', async () => {
    const { repository, service } = build();
    const result = await service.create({ name: 'Jane Doe', role: 'PhD Candidate' }, 'admin:1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.isDirector).toBe(false);
    expect(repository.audits.at(-1)?.action).toBe('team_member.create');
  });

  it('list() puts the director first, then orders by sortOrder', async () => {
    const { repository, service } = build();
    repository.seed(makeMember({ id: 'a', sortOrder: 2 }));
    repository.seed(makeMember({ id: 'b', sortOrder: 1 }));
    repository.seed(makeMember({ id: 'dir', sortOrder: 5, isDirector: true }));
    const result = await service.list();
    expect(result.ok && result.data.map((m) => m.id)).toEqual(['dir', 'b', 'a']);
  });

  it('making a second member director unsets the first', async () => {
    const { repository, service } = build();
    repository.seed(makeMember({ id: 'first', isDirector: true }));
    repository.seed(makeMember({ id: 'second' }));

    const result = await service.update('second', { isDirector: true }, 'admin:1');

    expect(result.ok).toBe(true);
    const directors = [...repository.store.values()].filter((m) => m.isDirector);
    expect(directors.map((m) => m.id)).toEqual(['second']);
  });

  it('creating a new director unsets the existing one', async () => {
    const { repository, service } = build();
    repository.seed(makeMember({ id: 'first', isDirector: true }));

    const result = await service.create(
      { name: 'New Director', role: 'Professor', isDirector: true },
      'admin:1',
    );

    expect(result.ok).toBe(true);
    expect(repository.store.get('first')?.isDirector).toBe(false);
  });

  it('findProfile() returns the member with their CV entries and courses', async () => {
    const { repository, service, cv } = build();
    repository.seed(makeMember({ id: 'mem_1' }));

    const result = await service.findProfile('mem_1');

    expect(result.ok).toBe(true);
    if (!result.ok || !result.data) throw new Error('expected a profile');
    expect(result.data.member.id).toBe('mem_1');
    expect(result.data.cvEntries).toEqual([ENTRY]);
    expect(result.data.courses).toEqual([COURSE]);
    expect(cv.cvEntriesFor).toHaveBeenCalledWith('mem_1');
  });

  it('findProfile() returns null for an unknown id without reading CV data', async () => {
    const { service, cv } = build();
    const result = await service.findProfile('missing');
    expect(result.ok && result.data).toBeNull();
    expect(cv.cvEntriesFor).not.toHaveBeenCalled();
  });

  it('findProfile() maps a CV read failure onto the error channel', async () => {
    const { repository, service, cv } = build();
    repository.seed(makeMember({ id: 'mem_1' }));
    vi.mocked(cv.coursesFor).mockRejectedValueOnce(new Error('db down'));
    const result = await service.findProfile('mem_1');
    expect(result.ok).toBe(false);
  });

  it('findDirectorProfile() returns the director, or null when there is none', async () => {
    const { repository, service } = build();
    repository.seed(makeMember({ id: 'mem_2' }));
    expect(
      (await service.findDirectorProfile()).ok && (await service.findDirectorProfile()),
    ).toEqual({ ok: true, data: null });

    repository.seed(makeMember({ id: 'mem_1', isDirector: true }));
    const result = await service.findDirectorProfile();
    expect(result.ok && result.data?.member.id).toBe('mem_1');
  });

  it('update() on a missing id returns NotFoundError', async () => {
    const { service } = build();
    const result = await service.update('missing', { name: 'X' }, 'admin:1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('not_found');
  });

  it('remove() returns the pre-delete snapshot and audits the before-state', async () => {
    const { repository, service } = build();
    repository.seed(makeMember({ id: 'mem_1', name: 'Jane', citationName: 'J. Doe' }));
    const result = await service.remove('mem_1', 'admin:1');
    expect(result.ok && result.data.id).toBe('mem_1');
    expect(repository.audits.at(-1)).toMatchObject({
      action: 'team_member.delete',
      metadata: { name: 'Jane', citationName: 'J. Doe' },
    });
  });

  it('stats() counts members', async () => {
    const { repository, service } = build();
    repository.seed(makeMember({ id: 'a' }));
    repository.seed(makeMember({ id: 'b' }));
    const result = await service.stats();
    expect(result.ok && result.data).toEqual({ total: 2 });
  });
});
