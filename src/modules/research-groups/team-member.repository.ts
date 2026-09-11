import { prisma } from '@/modules/shared/lib/prisma';
import { auditLogData } from '@/modules/shared/lib/audit';
import type { Prisma, TeamMember as PrismaTeamMember } from '@prisma/client';
import type { AuditContext, TeamMember, TeamMemberStats } from './team-member.types';
import type { CreateTeamMemberInput, UpdateTeamMemberInput } from './team-member.schema';

// The ONLY place Prisma is used for team-member data. No business rules here — the service
// decides WHAT to write; the repository just persists it atomically alongside its audit entry.

export type CreateTeamMemberData = CreateTeamMemberInput;
export type UpdateTeamMemberData = UpdateTeamMemberInput;

export interface TeamMemberRepository {
  findById(id: string): Promise<TeamMember | null>;
  /** The director first, then by sortOrder. */
  list(): Promise<TeamMember[]>;
  /** Headline counts only — no rows leave the database. */
  stats(): Promise<TeamMemberStats>;
  /**
   * Both writes clear `isDirector` on every other member in the same transaction when the input
   * sets it to true, so the one-director partial unique index is never the thing that says no.
   */
  createWithAudit(input: { data: CreateTeamMemberData; audit: AuditContext }): Promise<TeamMember>;
  updateWithAudit(input: {
    id: string;
    data: UpdateTeamMemberData;
    audit: AuditContext;
  }): Promise<TeamMember>;
  deleteWithAudit(input: { id: string; audit: AuditContext }): Promise<void>;
}

export function toDomain(row: PrismaTeamMember): TeamMember {
  return {
    id: row.id,
    name: row.name,
    citationName: row.citationName,
    role: row.role,
    affiliation: row.affiliation,
    bio: row.bio,
    photoUrl: row.photoUrl,
    linkedinUrl: row.linkedinUrl,
    googleScholarUrl: row.googleScholarUrl,
    isDirector: row.isDirector,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const LIST_ORDER: Prisma.TeamMemberOrderByWithRelationInput[] = [
  { isDirector: 'desc' },
  { sortOrder: 'asc' },
  { name: 'asc' },
];

const auditData = (audit: AuditContext, entityId: string) =>
  auditLogData('team_member', audit, entityId);

// Setting `isDirector` first unsets the previous director, in the same transaction, so the partial
// unique index never sees two. Not audited separately: the audit entry of the write that made
// someone else director records that this happened.
const UNSET_DIRECTOR = { isDirector: false };

export class PrismaTeamMemberRepository implements TeamMemberRepository {
  async findById(id: string): Promise<TeamMember | null> {
    const row = await prisma.teamMember.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async list(): Promise<TeamMember[]> {
    const rows = await prisma.teamMember.findMany({ orderBy: LIST_ORDER });
    return rows.map(toDomain);
  }

  async stats(): Promise<TeamMemberStats> {
    return { total: await prisma.teamMember.count() };
  }

  async createWithAudit(input: {
    data: CreateTeamMemberData;
    audit: AuditContext;
  }): Promise<TeamMember> {
    const created = await prisma.$transaction(async (tx) => {
      if (input.data.isDirector) {
        await tx.teamMember.updateMany({ where: { isDirector: true }, data: UNSET_DIRECTOR });
      }
      const row = await tx.teamMember.create({
        data: {
          name: input.data.name,
          citationName: input.data.citationName ?? null,
          role: input.data.role,
          affiliation: input.data.affiliation ?? null,
          bio: input.data.bio ?? null,
          photoUrl: input.data.photoUrl ?? null,
          linkedinUrl: input.data.linkedinUrl ?? null,
          googleScholarUrl: input.data.googleScholarUrl ?? null,
          isDirector: input.data.isDirector ?? false,
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
    data: UpdateTeamMemberData;
    audit: AuditContext;
  }): Promise<TeamMember> {
    const updated = await prisma.$transaction(async (tx) => {
      if (input.data.isDirector) {
        await tx.teamMember.updateMany({
          where: { isDirector: true, id: { not: input.id } },
          data: UNSET_DIRECTOR,
        });
      }
      const row = await tx.teamMember.update({
        where: { id: input.id },
        // Prisma leaves a column untouched when its value is `undefined`, so the partial
        // input maps straight through — an absent key is not a cleared column.
        data: {
          name: input.data.name,
          citationName: input.data.citationName,
          role: input.data.role,
          affiliation: input.data.affiliation,
          bio: input.data.bio,
          photoUrl: input.data.photoUrl,
          linkedinUrl: input.data.linkedinUrl,
          googleScholarUrl: input.data.googleScholarUrl,
          isDirector: input.data.isDirector,
          sortOrder: input.data.sortOrder,
        },
      });
      await tx.auditLog.create({ data: auditData(input.audit, row.id) });
      return row;
    });
    return toDomain(updated);
  }

  async deleteWithAudit(input: { id: string; audit: AuditContext }): Promise<void> {
    // CV entries and courses cascade with the member. The service puts the member's before-state
    // in the audit metadata.
    await prisma.$transaction(async (tx) => {
      await tx.teamMember.delete({ where: { id: input.id } });
      await tx.auditLog.create({ data: auditData(input.audit, input.id) });
    });
  }
}
