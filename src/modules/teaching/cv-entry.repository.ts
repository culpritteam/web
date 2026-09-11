import { prisma } from '@/modules/shared/lib/prisma';
import { auditLogData } from '@/modules/shared/lib/audit';
import type { Prisma, CvEntry as PrismaCvEntry } from '@prisma/client';
import type { AuditContext, CvEntry, CvEntryStats } from './teaching.types';
import type { CreateCvEntryInput, UpdateCvEntryInput } from './teaching.schema';

// The ONLY place Prisma is used for CV entries. No business rules here — the service decides WHAT
// to write; the repository just persists it atomically alongside its audit entry.

export interface CvEntryRepository {
  findById(id: string): Promise<CvEntry | null>;
  /** One member's entries, ordered by section then the admin's arrangement. */
  listForMember(teamMemberId: string): Promise<CvEntry[]>;
  /** Counts only — how many entries there are and which sections are populated. */
  stats(): Promise<CvEntryStats>;
  createWithAudit(input: { data: CreateCvEntryInput; audit: AuditContext }): Promise<CvEntry>;
  updateWithAudit(input: {
    id: string;
    data: UpdateCvEntryInput;
    audit: AuditContext;
  }): Promise<CvEntry>;
  deleteWithAudit(input: { id: string; audit: AuditContext }): Promise<void>;
}

function toDomain(row: PrismaCvEntry): CvEntry {
  return {
    id: row.id,
    teamMemberId: row.teamMemberId,
    section: row.section,
    title: row.title,
    subtitle: row.subtitle,
    year: row.year,
    description: row.description,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// `sortOrder` is scoped per section, so section has to lead the ordering or two sections'
// positions interleave. `title` only breaks ties, so equal-ordered rows don't shuffle between
// requests.
const LIST_ORDER: Prisma.CvEntryOrderByWithRelationInput[] = [
  { section: 'asc' },
  { sortOrder: 'asc' },
  { title: 'asc' },
];

const auditData = (audit: AuditContext, entityId: string) =>
  auditLogData('cv_entry', audit, entityId);

export class PrismaCvEntryRepository implements CvEntryRepository {
  async findById(id: string): Promise<CvEntry | null> {
    const row = await prisma.cvEntry.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async listForMember(teamMemberId: string): Promise<CvEntry[]> {
    const rows = await prisma.cvEntry.findMany({ where: { teamMemberId }, orderBy: LIST_ORDER });
    return rows.map(toDomain);
  }

  async stats(): Promise<CvEntryStats> {
    // Batched into one round trip. The groupBy answers "which sections have anything in them"
    // without reading a single entry.
    const [total, sections] = await prisma.$transaction([
      prisma.cvEntry.count(),
      prisma.cvEntry.groupBy({ by: ['section'] }),
    ]);
    return { total, sections: sections.map((row) => row.section) };
  }

  async createWithAudit(input: {
    data: CreateCvEntryInput;
    audit: AuditContext;
  }): Promise<CvEntry> {
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.cvEntry.create({
        data: {
          teamMemberId: input.data.teamMemberId,
          section: input.data.section,
          title: input.data.title,
          subtitle: input.data.subtitle ?? null,
          year: input.data.year ?? null,
          description: input.data.description ?? null,
          sortOrder: input.data.sortOrder ?? 0,
        },
      });
      await tx.auditLog.create({ data: auditData(input.audit, row.id) });
      return row;
    });
    return toDomain(created);
  }

  async updateWithAudit(input: {
    id: string;
    data: UpdateCvEntryInput;
    audit: AuditContext;
  }): Promise<CvEntry> {
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.cvEntry.update({
        where: { id: input.id },
        // Prisma leaves a column untouched when its value is `undefined`, so the partial
        // input maps straight through — an absent key is not a cleared column.
        data: {
          section: input.data.section,
          title: input.data.title,
          subtitle: input.data.subtitle,
          year: input.data.year,
          description: input.data.description,
          sortOrder: input.data.sortOrder,
        },
      });
      await tx.auditLog.create({ data: auditData(input.audit, row.id) });
      return row;
    });
    return toDomain(updated);
  }

  async deleteWithAudit(input: { id: string; audit: AuditContext }): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.cvEntry.delete({ where: { id: input.id } });
      await tx.auditLog.create({ data: auditData(input.audit, input.id) });
    });
  }
}
