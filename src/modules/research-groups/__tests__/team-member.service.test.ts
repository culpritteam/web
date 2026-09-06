import { describe, expect, it, vi } from 'vitest';
import { createTeamMemberService } from '../team-member.service';
import type { ListTeamMembersFilter, TeamMemberRepository } from '../team-member.repository';
import type { AuditContext, TeamMember } from '../team-member.types';

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

  async list(filter?: ListTeamMembersFilter): Promise<TeamMember[]> {
    return [...this.store.values()]
      .filter((m) => !filter?.groupId || m.researchGroupId === filter.groupId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  // The reduction the admin dashboard used to run in memory: every member row fetched, then
  // `.length` and a filter on `researchGroupId === null`.
  async stats() {
    const rows = [...this.store.values()];
    return {
      total: rows.length,
      ungrouped: rows.filter((member) => member.researchGroupId === null).length,
    };
  }

  async createWithAudit(input: {
    data: Partial<TeamMember>;
    audit: AuditContext;
  }): Promise<TeamMember> {
    const id = `mem_${++this.seq}`;
    const now = new Date('2026-08-05T00:00:00Z');
    const member: TeamMember = {
      id,
      name: input.data.name ?? '',
      nickname: input.data.nickname ?? null,
      role: input.data.role ?? '',
      bio: input.data.bio ?? null,
      photoUrl: input.data.photoUrl ?? null,
      showOnTeamTab: input.data.showOnTeamTab ?? true,
      researchGroupId: input.data.researchGroupId ?? null,
      sortOrder: input.data.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(id, member);
    this.audits.push({ ...input.audit, entityId: id });
    return { ...member };
  }

  async updateWithAudit(input: {
    id: string;
    data: Partial<TeamMember>;
    audit: AuditContext;
  }): Promise<TeamMember> {
    const current = this.store.get(input.id);
    if (!current) throw new Error('not found');
    const updated: TeamMember = {
      ...current,
      ...input.data,
      updatedAt: new Date('2026-08-05T01:00:00Z'),
    };
    this.store.set(input.id, updated);
    this.audits.push({ ...input.audit, entityId: input.id });
    return { ...updated };
  }

  async deleteWithAudit(input: { id: string; audit: AuditContext }): Promise<void> {
    if (!this.store.delete(input.id)) throw new Error('not found');
    this.audits.push({ ...input.audit, entityId: input.id });
  }
}

function build() {
  const repository = new FakeRepository();
  const service = createTeamMemberService({
    repository,
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  });
  return { repository, service };
}

describe('team member service', () => {
  it('create() persists with no group by default and audits', async () => {
    const { repository, service } = build();
    const result = await service.create({ name: 'Jane Doe', role: 'PhD Candidate' }, 'admin:1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.researchGroupId).toBeNull();
    expect(repository.audits.at(-1)?.action).toBe('team_member.create');
  });

  it('list() filters by groupId and orders by sortOrder', async () => {
    const { repository, service } = build();
    repository.seed({
      id: 'a',
      name: 'A',
      role: 'x',
      bio: null,
      nickname: null,
      photoUrl: null,
      showOnTeamTab: true,
      researchGroupId: 'g1',
      sortOrder: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    repository.seed({
      id: 'b',
      name: 'B',
      role: 'x',
      bio: null,
      nickname: null,
      photoUrl: null,
      showOnTeamTab: true,
      researchGroupId: 'g1',
      sortOrder: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    repository.seed({
      id: 'c',
      name: 'C',
      role: 'x',
      bio: null,
      nickname: null,
      photoUrl: null,
      showOnTeamTab: true,
      researchGroupId: 'g2',
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const result = await service.list({ groupId: 'g1' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.map((m) => m.id)).toEqual(['b', 'a']);
  });

  it('update() on a missing id returns NotFoundError', async () => {
    const { service } = build();
    const result = await service.update('missing', { name: 'X' }, 'admin:1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('not_found');
  });

  it('remove() returns the pre-delete snapshot', async () => {
    const { repository, service } = build();
    repository.seed({
      id: 'mem_1',
      name: 'Jane',
      role: 'PhD',
      bio: null,
      nickname: null,
      photoUrl: null,
      showOnTeamTab: true,
      researchGroupId: null,
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const result = await service.remove('mem_1', 'admin:1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.id).toBe('mem_1');
  });

  it('stats() matches the in-memory count the dashboard used to compute', async () => {
    const { repository, service } = build();
    const seed = (id: string, researchGroupId: string | null) =>
      repository.seed({
        id,
        name: id,
        role: 'PhD',
        bio: null,
        nickname: null,
        photoUrl: null,
        showOnTeamTab: true,
        researchGroupId,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    seed('a', 'g1');
    seed('b', 'g1');
    seed('c', null);
    seed('d', null);
    seed('e', 'g2');

    const result = await service.stats();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({ total: 5, ungrouped: 2 });

    // The exact reduction the dashboard used to run over the full member list.
    const rows = await repository.list();
    expect(result.data.total).toBe(rows.length);
    expect(result.data.ungrouped).toBe(
      rows.filter((member) => member.researchGroupId === null).length,
    );
  });
});
