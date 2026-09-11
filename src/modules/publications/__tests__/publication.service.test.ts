import { describe, expect, it, vi } from 'vitest';
import { createPublicationService } from '../publication.service';
import type {
  CreatePublicationData,
  PublicationRepository,
  UpdatePublicationData,
} from '../publication.repository';
import type { AuditContext, Publication, PublicationAuthor } from '../publication.types';

/** The repository turns the submitted array into rows; the fake does the same, minimally. */
function toAuthors(input: CreatePublicationData['authors'] | undefined): PublicationAuthor[] {
  return (input ?? []).map((author, index) => ({
    id: `author_${index}`,
    name: author.name,
    sortOrder: index,
  }));
}

class FakeRepository implements PublicationRepository {
  store = new Map<string, Publication>();
  audits: (AuditContext & { entityId: string })[] = [];
  private seq = 0;

  seed(publication: Publication) {
    this.store.set(publication.id, { ...publication });
  }

  async findById(id: string): Promise<Publication | null> {
    const found = this.store.get(id);
    return found ? { ...found } : null;
  }

  async list(): Promise<Publication[]> {
    return [...this.store.values()].sort(
      (a, b) => b.year - a.year || b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  // The reduction the admin dashboard used to run in memory over `list()`, kept as the reference
  // the SQL aggregate has to match. Years ascending, populated years only.
  async stats() {
    const rows = await this.list();
    const counts = new Map<number, number>();
    for (const row of rows) counts.set(row.year, (counts.get(row.year) ?? 0) + 1);
    const byYear = [...counts]
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => a.year - b.year);
    return { total: rows.length, byYear, latestYear: byYear.at(-1)?.year ?? null };
  }

  async createWithAudit(input: {
    data: CreatePublicationData;
    audit: AuditContext;
  }): Promise<Publication> {
    const id = `pub_${++this.seq}`;
    const now = new Date('2026-08-05T00:00:00Z');
    const publication: Publication = {
      id,
      title: input.data.title ?? '',
      authors: toAuthors(input.data.authors),
      venue: input.data.venue ?? '',
      year: input.data.year ?? 2024,
      link: input.data.link ?? '',
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(id, publication);
    this.audits.push({ ...input.audit, entityId: id });
    return { ...publication };
  }

  async updateWithAudit(input: {
    id: string;
    data: UpdatePublicationData;
    audit: AuditContext;
  }): Promise<Publication> {
    const current = this.store.get(input.id);
    if (!current) throw new Error('not found');
    const updated: Publication = {
      ...current,
      ...input.data,
      // An absent key leaves the stored list alone, exactly as the real repository does.
      authors: input.data.authors ? toAuthors(input.data.authors) : current.authors,
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
  const service = createPublicationService({
    repository,
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  });
  return { repository, service };
}

describe('publication service', () => {
  it('create() persists and audits', async () => {
    const { repository, service } = build();
    const result = await service.create(
      {
        title: 'X',
        authors: [{ name: 'Y' }],
        venue: 'Z',
        year: 2024,
        link: 'https://example.com',
      },
      'admin:1',
    );
    expect(result.ok).toBe(true);
    expect(repository.audits.at(-1)?.action).toBe('publication.create');
  });

  it('list() orders by year desc then createdAt desc', async () => {
    const { repository, service } = build();
    repository.seed({
      id: 'old',
      title: 'Old',
      authors: [],
      venue: 'V',
      year: 2020,
      link: 'https://example.com',
      createdAt: new Date('2020-01-01'),
      updatedAt: new Date('2020-01-01'),
    });
    repository.seed({
      id: 'new',
      title: 'New',
      authors: [],
      venue: 'V',
      year: 2024,
      link: 'https://example.com',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    });
    const result = await service.list();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.map((p) => p.id)).toEqual(['new', 'old']);
  });

  it('update() on a missing id returns NotFoundError', async () => {
    const { service } = build();
    const result = await service.update('missing', { year: 2025 }, 'admin:1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('not_found');
  });

  it('remove() returns the pre-delete snapshot and audits', async () => {
    const { repository, service } = build();
    repository.seed({
      id: 'pub_1',
      title: 'X',
      authors: [],
      venue: 'Z',
      year: 2024,
      link: 'https://example.com',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const result = await service.remove('pub_1', 'admin:1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.id).toBe('pub_1');
    expect(repository.audits.at(-1)?.action).toBe('publication.delete');
  });

  it('stats() returns the populated years ascending, with the latest year', async () => {
    const { repository, service } = build();
    const seed = (id: string, year: number) =>
      repository.seed({
        id,
        title: id,
        authors: [],
        venue: 'V',
        year,
        link: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    seed('p1', 2024);
    seed('p2', 2020);
    seed('p3', 2024);

    const result = await service.stats();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Only years that have publications are rows — 2021-2023 are the page's job to fill in.
    expect(result.data).toEqual({
      total: 3,
      byYear: [
        { year: 2020, count: 1 },
        { year: 2024, count: 2 },
      ],
      latestYear: 2024,
    });
  });

  it('stats() reports no latest year when there are no publications', async () => {
    const { service } = build();
    const result = await service.stats();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ total: 0, byYear: [], latestYear: null });
  });
});
