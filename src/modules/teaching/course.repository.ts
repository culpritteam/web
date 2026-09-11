import { prisma } from '@/modules/shared/lib/prisma';
import { auditLogData } from '@/modules/shared/lib/audit';
import type { Course as PrismaCourse } from '@prisma/client';
import type { AuditContext, Course, CourseStats } from './teaching.types';
import type { CreateCourseInput, UpdateCourseInput } from './teaching.schema';

// The ONLY place Prisma is used for course data. No business rules here — the service decides
// WHAT to write; the repository just persists it atomically alongside its audit entry.

export interface CourseRepository {
  findById(id: string): Promise<Course | null>;
  /** One member's courses, in the admin's arrangement. */
  listForMember(teamMemberId: string): Promise<Course[]>;
  /** Counts only — no course rows leave the database. */
  stats(): Promise<CourseStats>;
  createWithAudit(input: { data: CreateCourseInput; audit: AuditContext }): Promise<Course>;
  updateWithAudit(input: {
    id: string;
    data: UpdateCourseInput;
    audit: AuditContext;
  }): Promise<Course>;
  deleteWithAudit(input: { id: string; audit: AuditContext }): Promise<void>;
}

function toDomain(row: PrismaCourse): Course {
  return {
    id: row.id,
    teamMemberId: row.teamMemberId,
    code: row.code,
    title: row.title,
    level: row.level,
    term: row.term,
    description: row.description,
    link: row.link,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const auditData = (audit: AuditContext, entityId: string) =>
  auditLogData('course', audit, entityId);

export class PrismaCourseRepository implements CourseRepository {
  async findById(id: string): Promise<Course | null> {
    const row = await prisma.course.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async listForMember(teamMemberId: string): Promise<Course[]> {
    // `sortOrder` is the admin's arrangement; `title` only breaks ties so equal-ordered rows
    // don't shuffle between requests. The profile page groups by `level` in render order.
    const rows = await prisma.course.findMany({
      where: { teamMemberId },
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    });
    return rows.map(toDomain);
  }

  async stats(): Promise<CourseStats> {
    return { total: await prisma.course.count() };
  }

  async createWithAudit(input: { data: CreateCourseInput; audit: AuditContext }): Promise<Course> {
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.course.create({
        data: {
          teamMemberId: input.data.teamMemberId,
          code: input.data.code ?? null,
          title: input.data.title,
          level: input.data.level,
          term: input.data.term ?? null,
          description: input.data.description ?? null,
          link: input.data.link ?? null,
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
    data: UpdateCourseInput;
    audit: AuditContext;
  }): Promise<Course> {
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.course.update({
        where: { id: input.id },
        // Prisma leaves a column untouched when its value is `undefined`, so the partial
        // input maps straight through — an absent key is not a cleared column.
        data: {
          code: input.data.code,
          title: input.data.title,
          level: input.data.level,
          term: input.data.term,
          description: input.data.description,
          link: input.data.link,
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
      await tx.course.delete({ where: { id: input.id } });
      await tx.auditLog.create({ data: auditData(input.audit, input.id) });
    });
  }
}
