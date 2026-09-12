import { prisma } from '@/modules/shared/lib/prisma';
import { auditLogData } from '@/modules/shared/lib/audit';
import type { Project as PrismaProject } from '@prisma/client';
import type { AuditContext, Project, ProjectStats } from './project.types';
import type { CreateProjectInput, UpdateProjectInput } from './project.schema';

// The ONLY place Prisma is used for project data. No business rules here — the service decides
// WHAT to write; the repository just persists it atomically alongside its audit entry.

export interface ProjectRepository {
  findById(id: string): Promise<Project | null>;
  /** One member's projects, in the admin's arrangement. */
  listForMember(teamMemberId: string): Promise<Project[]>;
  /** Counts only — no project rows leave the database. */
  stats(): Promise<ProjectStats>;
  createWithAudit(input: { data: CreateProjectInput; audit: AuditContext }): Promise<Project>;
  updateWithAudit(input: {
    id: string;
    data: UpdateProjectInput;
    audit: AuditContext;
  }): Promise<Project>;
  deleteWithAudit(input: { id: string; audit: AuditContext }): Promise<void>;
}

function toDomain(row: PrismaProject): Project {
  return {
    id: row.id,
    teamMemberId: row.teamMemberId,
    title: row.title,
    summary: row.summary,
    link: row.link,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const auditData = (audit: AuditContext, entityId: string) =>
  auditLogData('project', audit, entityId);

export class PrismaProjectRepository implements ProjectRepository {
  async findById(id: string): Promise<Project | null> {
    const row = await prisma.project.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async listForMember(teamMemberId: string): Promise<Project[]> {
    // `sortOrder` is the admin's arrangement; `title` only breaks ties so equal-ordered rows don't
    // shuffle between requests.
    const rows = await prisma.project.findMany({
      where: { teamMemberId },
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    });
    return rows.map(toDomain);
  }

  async stats(): Promise<ProjectStats> {
    return { total: await prisma.project.count() };
  }

  async createWithAudit(input: {
    data: CreateProjectInput;
    audit: AuditContext;
  }): Promise<Project> {
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.project.create({
        data: {
          teamMemberId: input.data.teamMemberId,
          title: input.data.title,
          summary: input.data.summary,
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
    data: UpdateProjectInput;
    audit: AuditContext;
  }): Promise<Project> {
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.project.update({
        where: { id: input.id },
        // Prisma leaves a column untouched when its value is `undefined`, so the partial input
        // maps straight through — an absent key is not a cleared column.
        data: {
          title: input.data.title,
          summary: input.data.summary,
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
      await tx.project.delete({ where: { id: input.id } });
      await tx.auditLog.create({ data: auditData(input.audit, input.id) });
    });
  }
}
