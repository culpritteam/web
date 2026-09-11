import { describe, expect, it, vi } from 'vitest';
import { createResearchService } from '../research.service';
import type {
  CreateResearchData,
  ResearchRepository,
  UpdateResearchData,
} from '../research.repository';
import type { AuditContext, Research, ResearchContributor } from '../research.types';

/** The repository turns the submitted array into rows; the fake does the same, minimally. */
function toContributors(
  input: CreateResearchData['contributors'] | undefined,
): ResearchContributor[] {
  return (input ?? []).map((contributor, index) => ({
    id: `contributor_${index}`,
    name: contributor.name,
    sortOrder: index,
  }));
}

class FakeRepository implements ResearchRepository {
  store = new Map<string, Research>();
  audits: (AuditContext & { entityId: string })[] = [];
  private seq = 0;

  seed(research: Research) {
    this.store.set(research.id, { ...research });
  }

  async findById(id: string): Promise<Research | null> {
    const found = this.store.get(id);
    return found ? { ...found } : null;
  }

  async list(): Promise<Research[]> {
    return [...this.store.values()].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  // Deliberately the exact reduction the admin dashboard used to run in memory over `list()`:
  // a Map keyed by area, in first-appearance order. The Prisma implementation has to produce the
  // same numbers in the same order from `GROUP BY area ORDER BY MIN(sort_order)`.
  async stats() {
    const rows = await this.list();
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(row.area, (counts.get(row.area) ?? 0) + 1);
    return { total: rows.length, byArea: [...counts].map(([area, count]) => ({ area, count })) };
  }

  async createWithAudit(input: {
    data: CreateResearchData;
    audit: AuditContext;
  }): Promise<Research> {
    const id = `res_${++this.seq}`;
    const now = new Date('2026-08-05T00:00:00Z');
    const research: Research = {
      id,
      title: input.data.title ?? '',
      summary: input.data.summary ?? '',
      area: input.data.area ?? '',
      link: null,
      contributors: toContributors(input.data.contributors),
      sortOrder: input.data.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(id, research);
    this.audits.push({ ...input.audit, entityId: id });
    return { ...research };
  }

  async updateWithAudit(input: {
    id: string;
    data: UpdateResearchData;
    audit: AuditContext;
  }): Promise<Research> {
    const current = this.store.get(input.id);
    if (!current) throw new Error('not found');
    const updated: Research = {
      ...current,
      ...input.data,
      // An absent key leaves the stored list alone, exactly as the real repository does.
      contributors: input.data.contributors
        ? toContributors(input.data.contributors)
        : current.contributors,
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
  const service = createResearchService({
    repository,
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  });
  return { repository, service };
}

describe('research service', () => {
  it('create() persists and audits', async () => {
    const { repository, service } = build();
    const result = await service.create(
      {
        title: 'Malware Analysis',
        summary: 'Summary',
        area: 'security',
        contributors: [],
        sortOrder: 1,
      },
      'admin:1',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.title).toBe('Malware Analysis');
    expect(repository.audits.at(-1)?.action).toBe('research.create');
  });

  it('list() returns entries ordered by sortOrder', async () => {
    const { repository, service } = build();
    repository.seed({
      id: 'a',
      title: 'B',
      summary: 's',
      area: 'x',
      link: null,
      contributors: [],
      sortOrder: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    repository.seed({
      id: 'b',
      title: 'A',
      summary: 's',
      area: 'x',
      link: null,
      contributors: [],
      sortOrder: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const result = await service.list();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('update() on a missing id returns NotFoundError, no write', async () => {
    const { repository, service } = build();
    const result = await service.update('missing', { title: 'X' }, 'admin:1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('not_found');
    expect(repository.audits).toHaveLength(0);
  });

  it('remove() returns the pre-delete snapshot and audits', async () => {
    const { repository, service } = build();
    repository.seed({
      id: 'a',
      title: 'B',
      summary: 's',
      area: 'x',
      link: null,
      contributors: [],
      sortOrder: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const result = await service.remove('a', 'admin:1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.id).toBe('a');
    expect(repository.audits.at(-1)?.action).toBe('research.delete');
    expect(await repository.findById('a')).toBeNull();
  });

  it('remove() on a missing id returns NotFoundError', async () => {
    const { service } = build();
    const result = await service.remove('missing', 'admin:1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('not_found');
  });

  it('stats() counts by area in the admin arrangement, matching the old in-memory tally', async () => {
    const { repository, service } = build();
    const seed = (id: string, area: string, sortOrder: number) =>
      repository.seed({
        id,
        title: id,
        summary: 's',
        area,
        link: null,
        contributors: [],
        sortOrder,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    seed('c', 'formal methods', 3);
    seed('a', 'malware', 1);
    seed('d', 'malware', 4);
    seed('b', 'privacy', 2);

    const result = await service.stats();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Areas ordered by where they first appear in list() (sortOrder asc), not alphabetically.
    expect(result.data).toEqual({
      total: 4,
      byArea: [
        { area: 'malware', count: 2 },
        { area: 'privacy', count: 1 },
        { area: 'formal methods', count: 1 },
      ],
    });

    // Identical to reducing the full list in memory, which is what the dashboard used to do.
    const rows = await repository.list();
    const tally = new Map<string, number>();
    for (const row of rows) tally.set(row.area, (tally.get(row.area) ?? 0) + 1);
    expect(result.data.byArea).toEqual([...tally].map(([area, count]) => ({ area, count })));
    expect(result.data.total).toBe(rows.length);
  });

  it('stats() maps a repository failure onto the error channel', async () => {
    const { repository, service } = build();
    repository.stats = async () => {
      throw new Error('connection lost');
    };
    const result = await service.stats();
    expect(result.ok).toBe(false);
  });
});
