import { describe, expect, it, vi } from 'vitest';
import {
  createTeamMemberService,
  type MemberCvDirectory,
  type MemberProjectDirectory,
} from '../team-member.service';
import type {
  CreateTeamMemberData,
  TeamMemberRepository,
  UpdateTeamMemberData,
} from '../team-member.repository';
import type { AuditContext, MemberLink, TeamMember } from '../team-member.types';
import type { Course, CvEntry } from '@/modules/teaching';
import type { Project } from '@/modules/projects';

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
    teamKind: 'research',
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
  /** Replaced wholesale by a write that carries a `links` array, like the Prisma repository. */
  links = new Map<string, MemberLink[]>();
  audits: (AuditContext & { entityId: string })[] = [];
  private seq = 0;

  seed(member: TeamMember, links: MemberLink[] = []) {
    this.store.set(member.id, { ...member });
    this.links.set(member.id, links);
  }

  async listLinks(teamMemberId: string): Promise<MemberLink[]> {
    return this.links.get(teamMemberId) ?? [];
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
      teamKind: input.data.teamKind,
      isDirector: input.data.isDirector ?? false,
      sortOrder: input.data.sortOrder ?? 0,
    });
    this.store.set(id, member);
    this.links.set(id, toLinkRows(input.data.links ?? []));
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
    const { links, ...columns } = defined;
    const updated: TeamMember = { ...current, ...columns, updatedAt: NOW };
    this.store.set(input.id, updated);
    // Absent means "leave them alone"; present replaces the whole list.
    if (links) this.links.set(input.id, toLinkRows(links as { label: string; url: string }[]));
    this.audits.push({ ...input.audit, entityId: input.id });
    return { ...updated };
  }

  async deleteWithAudit(input: { id: string; audit: AuditContext }) {
    if (!this.store.delete(input.id)) throw new Error('not found');
    this.links.delete(input.id);
    this.audits.push({ ...input.audit, entityId: input.id });
  }
}

const toLinkRows = (links: { label: string; url: string }[]): MemberLink[] =>
  links.map((link, index) => ({ id: `lnk_${index}`, ...link, sortOrder: index }));

const ENTRY = { id: 'cv_1', teamMemberId: 'mem_1', section: 'education', title: 'PhD' } as CvEntry;
const INTEREST = {
  id: 'cv_2',
  teamMemberId: 'mem_1',
  section: 'research_interest',
  title: 'Privacy',
} as CvEntry;
const COURSE = { id: 'course_1', teamMemberId: 'mem_1', title: 'Security' } as Course;
const PROJECT = { id: 'proj_1', teamMemberId: 'mem_1', title: 'Lab site' } as Project;

function build() {
  const repository = new FakeRepository();
  const cv: MemberCvDirectory = {
    cvEntriesFor: vi.fn(async (id: string) => (id === 'mem_1' ? [ENTRY, INTEREST] : [])),
    coursesFor: vi.fn(async (id: string) => (id === 'mem_1' ? [COURSE] : [])),
  };
  const projects: MemberProjectDirectory = {
    projectsFor: vi.fn(async (id: string) => (id === 'mem_1' ? [PROJECT] : [])),
  };
  const service = createTeamMemberService({
    repository,
    cv,
    projects,
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  });
  return { repository, service, cv, projects };
}

describe('team member service', () => {
  it('create() persists a non-director by default and audits', async () => {
    const { repository, service } = build();
    const result = await service.create(
      { name: 'Jane Doe', role: 'PhD Candidate', teamKind: 'research', links: [] },
      'admin:1',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.isDirector).toBe(false);
    expect(repository.audits.at(-1)?.action).toBe('team_member.create');
  });

  it('list() puts the director first, then orders by sortOrder', async () => {
    const { repository, service } = build();
    repository.seed(makeMember({ id: 'a', sortOrder: 2 }));
    repository.seed(makeMember({ id: 'b', sortOrder: 1 }));
    repository.seed(
      makeMember({ id: 'dir', sortOrder: 5, teamKind: 'director', isDirector: true }),
    );
    const result = await service.list();
    expect(result.ok && result.data.map((m) => m.id)).toEqual(['dir', 'b', 'a']);
  });

  it('making a second member director unsets the first', async () => {
    const { repository, service } = build();
    repository.seed(makeMember({ id: 'first', teamKind: 'director', isDirector: true }));
    repository.seed(makeMember({ id: 'second' }));

    const result = await service.update('second', { teamKind: 'director' }, 'admin:1');

    expect(result.ok).toBe(true);
    const directors = [...repository.store.values()].filter((m) => m.isDirector);
    expect(directors.map((m) => m.id)).toEqual(['second']);
  });

  it('creating a new director unsets the existing one', async () => {
    const { repository, service } = build();
    repository.seed(makeMember({ id: 'first', teamKind: 'director', isDirector: true }));

    const result = await service.create(
      { name: 'New Director', role: 'Professor', teamKind: 'director', links: [] },
      'admin:1',
    );

    expect(result.ok).toBe(true);
    expect(repository.store.get('first')?.isDirector).toBe(false);
  });

  it('findProfile() returns the member with their CV entries and courses', async () => {
    const { repository, service, cv } = build();
    repository.seed(makeMember({ id: 'mem_1', teamKind: 'director' }));

    const result = await service.findProfile('mem_1');

    expect(result.ok).toBe(true);
    if (!result.ok || !result.data) throw new Error('expected a profile');
    expect(result.data.member.id).toBe('mem_1');
    expect(result.data.cvEntries).toEqual([ENTRY, INTEREST]);
    expect(result.data.courses).toEqual([COURSE]);
    expect(result.data.projects).toEqual([PROJECT]);
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
    repository.seed(makeMember({ id: 'mem_1', teamKind: 'director' }));
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

// `teamKind` and `isDirector` are one decision stored in two columns. The service is the only place
// that keeps them in step, whichever of the two the caller sent.
describe('team member service — director flag consistency', () => {
  it('derives isDirector from the team on create', async () => {
    const { service } = build();

    const director = await service.create(
      { name: 'Dir', role: 'Professor', teamKind: 'director', links: [] },
      'admin:1',
    );
    const other = await service.create(
      { name: 'Dev', role: 'Developer', teamKind: 'development', links: [] },
      'admin:1',
    );

    expect(director.ok && director.data.isDirector).toBe(true);
    expect(other.ok && other.data.isDirector).toBe(false);
  });

  it('lets the legacy isDirector flag alone set the team', async () => {
    const { repository, service } = build();
    repository.seed(makeMember({ id: 'mem_1' }));

    const result = await service.update('mem_1', { isDirector: true }, 'admin:1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.teamKind).toBe('director');
    expect(result.data.isDirector).toBe(true);
  });

  it('clears the flag when the director is moved to another team', async () => {
    const { repository, service } = build();
    repository.seed(makeMember({ id: 'mem_1', teamKind: 'director', isDirector: true }));

    const result = await service.update('mem_1', { teamKind: 'professor' }, 'admin:1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.teamKind).toBe('professor');
    expect(result.data.isDirector).toBe(false);
  });

  it('lets the team win when the two disagree', async () => {
    const { service } = build();

    const result = await service.create(
      { name: 'Dev', role: 'Developer', teamKind: 'development', isDirector: true, links: [] },
      'admin:1',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.isDirector).toBe(false);
  });

  it('refuses to unset the flag on the director without a new team, writing nothing', async () => {
    const { repository, service } = build();
    repository.seed(makeMember({ id: 'mem_1', teamKind: 'director', isDirector: true }));

    const result = await service.update('mem_1', { isDirector: false }, 'admin:1');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('validation');
    expect(repository.store.get('mem_1')?.isDirector).toBe(true);
    expect(repository.audits).toEqual([]);
  });
});

// The read side of the per-team rules. Rows a member's team may not have are NOT deleted on a team
// change — they stay in the database and simply stop being returned.
describe('team member service — profile gating', () => {
  it('gives the director everything', async () => {
    const { repository, service } = build();
    repository.seed(makeMember({ id: 'mem_1', teamKind: 'director' }));

    const result = await service.findProfile('mem_1');

    expect(result.ok && result.data?.cvEntries).toEqual([ENTRY, INTEREST]);
    expect(result.ok && result.data?.courses).toEqual([COURSE]);
    expect(result.ok && result.data?.projects).toEqual([PROJECT]);
  });

  it('gives a research member research interests and projects, but no courses', async () => {
    const { repository, service, cv } = build();
    repository.seed(makeMember({ id: 'mem_1', teamKind: 'research' }));

    const result = await service.findProfile('mem_1');

    expect(result.ok && result.data?.cvEntries).toEqual([INTEREST]);
    expect(result.ok && result.data?.courses).toEqual([]);
    expect(result.ok && result.data?.projects).toEqual([PROJECT]);
    // Not merely filtered out — the query is never made.
    expect(cv.coursesFor).not.toHaveBeenCalled();
  });

  it('gives a development member projects and links only', async () => {
    const { repository, service, cv } = build();
    repository.seed(makeMember({ id: 'mem_1', teamKind: 'development' }), [
      { id: 'lnk_0', label: 'GitHub', url: 'https://github.com/example', sortOrder: 0 },
    ]);

    const result = await service.findProfile('mem_1');

    expect(result.ok && result.data?.cvEntries).toEqual([]);
    expect(result.ok && result.data?.courses).toEqual([]);
    expect(result.ok && result.data?.projects).toEqual([PROJECT]);
    expect(result.ok && result.data?.links.map((link) => link.label)).toEqual(['GitHub']);
    expect(cv.cvEntriesFor).not.toHaveBeenCalled();
    expect(cv.coursesFor).not.toHaveBeenCalled();
  });

  it('keeps the orphaned rows, so moving the member back brings them right back', async () => {
    const { repository, service } = build();
    repository.seed(makeMember({ id: 'mem_1', teamKind: 'development' }));

    expect((await service.findProfile('mem_1')).ok).toBe(true);
    await service.update('mem_1', { teamKind: 'professor' }, 'admin:1');
    const after = await service.findProfile('mem_1');

    expect(after.ok && after.data?.cvEntries).toEqual([ENTRY, INTEREST]);
    expect(after.ok && after.data?.courses).toEqual([COURSE]);
  });
});

// Links are edited as part of the member, like a publication's byline rows: the payload carries the
// whole list, and the repository replaces it inside the member's own write transaction.
describe('team member service — links', () => {
  const LINKS = [
    { label: 'LinkedIn', url: 'https://www.linkedin.com/in/example' },
    { label: 'ORCID', url: 'https://orcid.org/0000-0000-0000-0000' },
  ];

  it('stores the list in array order on create', async () => {
    const { repository, service } = build();

    const created = await service.create(
      { name: 'Jane', role: 'Researcher', teamKind: 'research', links: LINKS },
      'admin:1',
    );

    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(await repository.listLinks(created.data.id)).toEqual([
      { id: 'lnk_0', label: 'LinkedIn', url: 'https://www.linkedin.com/in/example', sortOrder: 0 },
      { id: 'lnk_1', label: 'ORCID', url: 'https://orcid.org/0000-0000-0000-0000', sortOrder: 1 },
    ]);
  });

  it('replaces the whole list when the update carries one', async () => {
    const { repository, service } = build();
    repository.seed(makeMember({ id: 'mem_1' }), [
      { id: 'old', label: 'LinkedIn', url: 'https://www.linkedin.com/in/old', sortOrder: 0 },
    ]);

    await service.update('mem_1', { links: [{ label: 'GitHub', url: 'https://github.com/x' }] }, 'admin:1');

    expect(await repository.listLinks('mem_1')).toEqual([
      { id: 'lnk_0', label: 'GitHub', url: 'https://github.com/x', sortOrder: 0 },
    ]);
  });

  it('leaves the list alone when the update does not mention it', async () => {
    const { repository, service } = build();
    const existing = [
      { id: 'keep', label: 'LinkedIn', url: 'https://www.linkedin.com/in/keep', sortOrder: 0 },
    ];
    repository.seed(makeMember({ id: 'mem_1' }), existing);

    await service.update('mem_1', { role: 'Senior Researcher' }, 'admin:1');

    expect(await repository.listLinks('mem_1')).toEqual(existing);
  });

  it('clears the list when the update carries an empty one', async () => {
    const { repository, service } = build();
    repository.seed(makeMember({ id: 'mem_1' }), [
      { id: 'old', label: 'LinkedIn', url: 'https://www.linkedin.com/in/old', sortOrder: 0 },
    ]);

    await service.update('mem_1', { links: [] }, 'admin:1');

    expect(await repository.listLinks('mem_1')).toEqual([]);
  });
});
