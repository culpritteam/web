import { beforeEach, describe, expect, it, vi } from 'vitest';

// Regression coverage for the byline wipe. A publication's authors are child rows replaced
// wholesale on update, so the guard deciding WHETHER to replace them is the whole safety margin: if
// it fires when the caller never mentioned authors, every `publication_author` row for that
// publication is deleted and the byline is gone with no way to tell it ever existed.
//
// It did fire. `updatePublicationSchema` was `createPublicationSchema.partial()`, and `.partial()`
// does not strip `.default([])` in Zod 4 — an update omitting `authors` parsed to `authors: []`,
// which is truthy, so the old `if (input.data.authors)` guard ran the deleteMany + createMany pair
// with zero rows. The schema is fixed (the key now stays absent) and the guard is now an explicit
// `!== undefined`; this asserts the guard half, against a faked Prisma so there is no database.

const calls: string[] = [];
const tx = {
  publication: {
    update: vi.fn(async ({ where }: { where: { id: string } }) => {
      calls.push('update');
      return { id: where.id };
    }),
    findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => ({
      id: where.id,
      title: 'T',
      venue: 'V',
      year: 2024,
      link: null,
      authors: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  },
  publicationAuthor: {
    deleteMany: vi.fn(async () => {
      calls.push('authors.deleteMany');
      return { count: 2 };
    }),
    createMany: vi.fn(async () => {
      calls.push('authors.createMany');
      return { count: 0 };
    }),
  },
  auditLog: {
    create: vi.fn(async () => {
      calls.push('audit');
    }),
  },
};

vi.mock('@/modules/shared/lib/prisma', () => ({
  prisma: { $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx) },
}));

const { PrismaPublicationRepository } = await import('../publication.repository');

const AUDIT = { actor: 'admin:1', action: 'publication.update' };

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
});

describe('PrismaPublicationRepository author replacement', () => {
  it('leaves the stored authors untouched when the update omits the key', async () => {
    await new PrismaPublicationRepository().updateWithAudit({
      id: 'pub-1',
      data: { title: 'A new title' },
      audit: AUDIT,
    });

    expect(tx.publicationAuthor.deleteMany).not.toHaveBeenCalled();
    expect(tx.publicationAuthor.createMany).not.toHaveBeenCalled();
    expect(calls).toEqual(['update', 'audit']);
  });

  it('clears the byline when the update sends an explicit empty array', async () => {
    await new PrismaPublicationRepository().updateWithAudit({
      id: 'pub-1',
      data: { authors: [] },
      audit: AUDIT,
    });

    expect(tx.publicationAuthor.deleteMany).toHaveBeenCalledWith({
      where: { publicationId: 'pub-1' },
    });
    expect(calls).toContain('authors.deleteMany');
  });

  it('replaces the byline when the update sends authors', async () => {
    await new PrismaPublicationRepository().updateWithAudit({
      id: 'pub-1',
      data: { authors: [{ name: 'J. Jaimunk' }, { name: 'A. Other' }] },
      audit: AUDIT,
    });

    expect(calls).toEqual(['update', 'authors.deleteMany', 'authors.createMany', 'audit']);
    expect(tx.publicationAuthor.createMany).toHaveBeenCalledWith({
      data: [
        { name: 'J. Jaimunk', sortOrder: 0, publicationId: 'pub-1' },
        { name: 'A. Other', sortOrder: 1, publicationId: 'pub-1' },
      ],
    });
  });
});
