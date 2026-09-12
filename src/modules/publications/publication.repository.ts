import { prisma } from '@/modules/shared/lib/prisma';
import { auditLogData } from '@/modules/shared/lib/audit';
import type {
  Publication as PrismaPublication,
  PublicationAuthor as PrismaPublicationAuthor,
} from '@prisma/client';
import type {
  AuditContext,
  Publication,
  PublicationAuthor,
  PublicationStats,
} from './publication.types';
import type {
  CreatePublicationInput,
  PublicationAuthorInput,
  UpdatePublicationInput,
} from './publication.schema';

// The ONLY place Prisma is used for publication data. No business rules here — the service
// decides WHAT to write; the repository just persists it atomically alongside its audit entry.

export type CreatePublicationData = CreatePublicationInput;
export type UpdatePublicationData = UpdatePublicationInput;

export interface PublicationRepository {
  findById(id: string): Promise<Publication | null>;
  /** Ordered by year desc, then createdAt desc (most recent first). */
  list(): Promise<Publication[]>;
  /** Counts only — no publication rows leave the database. */
  stats(): Promise<PublicationStats>;
  createWithAudit(input: {
    data: CreatePublicationData;
    audit: AuditContext;
  }): Promise<Publication>;
  updateWithAudit(input: {
    id: string;
    data: UpdatePublicationData;
    audit: AuditContext;
  }): Promise<Publication>;
  deleteWithAudit(input: { id: string; audit: AuditContext }): Promise<void>;
}

/**
 * Authors always come back in the order the admin arranged. `createdAt` only breaks a tie between
 * rows that somehow share a `sortOrder`, so the order is total and the list never reshuffles
 * between two reads.
 */
const AUTHOR_ORDER = [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }];

const withAuthors = { authors: { orderBy: AUTHOR_ORDER } };

type PrismaPublicationRow = PrismaPublication & { authors: PrismaPublicationAuthor[] };

function toAuthor(row: PrismaPublicationAuthor): PublicationAuthor {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sortOrder,
  };
}

/** The array's own order IS the stored order — the index becomes `sortOrder`. */
const toAuthorRows = (authors: PublicationAuthorInput[]) =>
  authors.map((author, index) => ({ name: author.name, sortOrder: index }));

function toDomain(row: PrismaPublicationRow): Publication {
  return {
    id: row.id,
    title: row.title,
    authors: row.authors.map(toAuthor),
    venue: row.venue,
    year: row.year,
    link: row.link,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const auditData = (audit: AuditContext, entityId: string) =>
  auditLogData('publication', audit, entityId);

export class PrismaPublicationRepository implements PublicationRepository {
  async findById(id: string): Promise<Publication | null> {
    const row = await prisma.publication.findUnique({ where: { id }, include: withAuthors });
    return row ? toDomain(row) : null;
  }

  async list(): Promise<Publication[]> {
    // `include` on a to-many is one extra query for the whole page, not one per row. Every
    // consumer — the public list, the admin table, the edit form — wants the names, so fetching
    // them unconditionally beats making each caller ask twice.
    const rows = await prisma.publication.findMany({
      orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
      include: withAuthors,
    });
    return rows.map(toDomain);
  }

  async stats(): Promise<PublicationStats> {
    // Batched into one round trip: a total, and a count per year ascending. The dashboard fills
    // the empty years in between itself — SQL has no rows for a year nothing was published in.
    const [total, byYear] = await prisma.$transaction([
      prisma.publication.count(),
      prisma.publication.groupBy({
        by: ['year'],
        _count: true,
        orderBy: { year: 'asc' },
      }),
    ]);
    return {
      total,
      byYear: byYear.map((row) => ({ year: row.year, count: row._count })),
      latestYear: byYear.at(-1)?.year ?? null,
    };
  }

  async createWithAudit(input: {
    data: CreatePublicationData;
    audit: AuditContext;
  }): Promise<Publication> {
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.publication.create({
        data: {
          title: input.data.title,
          authors: { create: toAuthorRows(input.data.authors) },
          venue: input.data.venue,
          year: input.data.year,
          link: input.data.link ?? null,
        },
        include: withAuthors,
      });
      await tx.auditLog.create({ data: auditData(input.audit, row.id) });
      return row;
    });
    return toDomain(created);
  }

  async updateWithAudit(input: {
    id: string;
    data: UpdatePublicationData;
    audit: AuditContext;
  }): Promise<Publication> {
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.publication.update({
        where: { id: input.id },
        // Prisma leaves a column untouched when its value is `undefined`, so the partial
        // input maps straight through — an absent key is not a cleared column.
        data: {
          title: input.data.title,
          venue: input.data.venue,
          year: input.data.year,
          link: input.data.link,
        },
      });

      // Replaced wholesale rather than diffed. The list is a handful of short rows, nothing holds a
      // reference to an author row's id, and an absent `authors` key still means "leave it alone" —
      // the same partial-update convention every scalar column above follows.
      //
      // Explicitly `!== undefined`, not a truthiness check: an empty array is truthy, so `[]` must
      // reach the replace below (clearing the byline is a real request) while `undefined` must not.
      // The schema now guarantees an omitted key stays undefined; this guard is the second line of
      // defence, because when it was `if (input.data.authors)` a defaulted `[]` sailed through it
      // and deleted every author row.
      if (input.data.authors !== undefined) {
        await tx.publicationAuthor.deleteMany({ where: { publicationId: row.id } });
        await tx.publicationAuthor.createMany({
          data: toAuthorRows(input.data.authors).map((author) => ({
            ...author,
            publicationId: row.id,
          })),
        });
      }

      await tx.auditLog.create({ data: auditData(input.audit, row.id) });
      return tx.publication.findUniqueOrThrow({ where: { id: row.id }, include: withAuthors });
    });
    return toDomain(updated);
  }

  async deleteWithAudit(input: { id: string; audit: AuditContext }): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.publication.delete({ where: { id: input.id } });
      await tx.auditLog.create({ data: auditData(input.audit, input.id) });
    });
  }
}
