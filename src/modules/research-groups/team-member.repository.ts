import { prisma } from '@/modules/shared/lib/prisma';
import { auditLogData } from '@/modules/shared/lib/audit';
import type { Prisma, TeamMember as PrismaTeamMember } from '@prisma/client';
import type { AuditContext, TeamMember, TeamMemberStats } from './team-member.types';
import type { CreateTeamMemberInput, UpdateTeamMemberInput } from './team-member.schema';

// The ONLY place Prisma is used for team-member data. No business rules here — the service
// decides WHAT to write; the repository just persists it atomically alongside its audit entry.

export type CreateTeamMemberData = CreateTeamMemberInput;
export type UpdateTeamMemberData = UpdateTeamMemberInput;

export type ListTeamMembersFilter = {
  groupId?: string;
  /**
   * Only members with no research group. The public Team Members tab renders grouped members from
   * `researchGroupRepository.list()` (which includes them), so without this it would have to pull
   * the entire member table a second time purely to find the handful that aren't in a group.
   */
  ungroupedOnly?: boolean;
  /** Public reads pass this so byline-only collaborators stay off the Team tab. */
  visibleOnly?: boolean;
};

export interface TeamMemberRepository {
  findById(id: string): Promise<TeamMember | null>;
  /** Ordered by sortOrder asc; optionally filtered to one research group. */
  list(filter?: ListTeamMembersFilter): Promise<TeamMember[]>;
  /** Headline counts only — no rows leave the database. */
  stats(): Promise<TeamMemberStats>;
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
    nickname: row.nickname,
    role: row.role,
    bio: row.bio,
    photoUrl: row.photoUrl,
    showOnTeamTab: row.showOnTeamTab,
    researchGroupId: row.researchGroupId,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const auditData = (audit: AuditContext, entityId: string) =>
  auditLogData('team_member', audit, entityId);

export class PrismaTeamMemberRepository implements TeamMemberRepository {
  async findById(id: string): Promise<TeamMember | null> {
    const row = await prisma.teamMember.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async list(filter?: ListTeamMembersFilter): Promise<TeamMember[]> {
    // `ungroupedOnly` wins if both are given — a specific group and "no group" can't both hold.
    const where: Prisma.TeamMemberWhereInput = filter?.ungroupedOnly
      ? { researchGroupId: null }
      : filter?.groupId
        ? { researchGroupId: filter.groupId }
        : {};
    if (filter?.visibleOnly) where.showOnTeamTab = true;

    const rows = await prisma.teamMember.findMany({ where, orderBy: { sortOrder: 'asc' } });
    return rows.map(toDomain);
  }

  async stats(): Promise<TeamMemberStats> {
    // Batched into one round trip. Both are index-only counts; neither materializes a row.
    const [total, ungrouped] = await prisma.$transaction([
      prisma.teamMember.count(),
      prisma.teamMember.count({ where: { researchGroupId: null } }),
    ]);
    return { total, ungrouped };
  }

  async createWithAudit(input: {
    data: CreateTeamMemberData;
    audit: AuditContext;
  }): Promise<TeamMember> {
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.teamMember.create({
        data: {
          name: input.data.name,
          nickname: input.data.nickname ?? null,
          role: input.data.role,
          bio: input.data.bio ?? null,
          photoUrl: input.data.photoUrl ?? null,
          showOnTeamTab: input.data.showOnTeamTab ?? true,
          researchGroupId: input.data.researchGroupId ?? null,
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
      const row = await tx.teamMember.update({
        where: { id: input.id },
        // Prisma leaves a column untouched when its value is `undefined`, so the partial
        // input maps straight through — an absent key is not a cleared column.
        data: {
          name: input.data.name,
          nickname: input.data.nickname,
          role: input.data.role,
          bio: input.data.bio,
          photoUrl: input.data.photoUrl,
          showOnTeamTab: input.data.showOnTeamTab,
          researchGroupId: input.data.researchGroupId,
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
      await tx.teamMember.delete({ where: { id: input.id } });
      await tx.auditLog.create({ data: auditData(input.audit, input.id) });
    });
  }
}
