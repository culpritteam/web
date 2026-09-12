import { prisma } from '@/modules/shared/lib/prisma';
import { auditLogData } from '@/modules/shared/lib/audit';
import type {
  Prisma,
  MemberLink as PrismaMemberLink,
  TeamMember as PrismaTeamMember,
} from '@prisma/client';
import type {
  AuditContext,
  MemberLink,
  TeamMember,
  TeamMemberStats,
} from './team-member.types';
import type {
  CreateTeamMemberInput,
  MemberLinkInput,
  UpdateTeamMemberInput,
} from './team-member.schema';

// The ONLY place Prisma is used for team-member data. No business rules here — the service
// decides WHAT to write; the repository just persists it atomically alongside its audit entry.

export type CreateTeamMemberData = CreateTeamMemberInput;
export type UpdateTeamMemberData = UpdateTeamMemberInput;

export interface TeamMemberRepository {
  findById(id: string): Promise<TeamMember | null>;
  /** The director first, then by sortOrder. */
  list(): Promise<TeamMember[]>;
  /** One member's external links, in the admin's arrangement. */
  listLinks(teamMemberId: string): Promise<MemberLink[]>;
  /** Headline counts only — no rows leave the database. */
  stats(): Promise<TeamMemberStats>;
  /**
   * Both writes clear `isDirector` on every other member in the same transaction when the input
   * sets it to true, so the one-director partial unique index is never the thing that says no, and
   * replace the member's links wholesale in that same transaction when the input carries a list.
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
    teamKind: row.teamKind,
    isDirector: row.isDirector,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toLink(row: PrismaMemberLink): MemberLink {
  return { id: row.id, label: row.label, url: row.url, sortOrder: row.sortOrder };
}

/** The array's own order IS the stored order — the index becomes `sortOrder`. */
const toLinkRows = (links: MemberLinkInput[]) =>
  links.map((link, index) => ({ label: link.label, url: link.url, sortOrder: index }));

const LIST_ORDER: Prisma.TeamMemberOrderByWithRelationInput[] = [
  { isDirector: 'desc' },
  { sortOrder: 'asc' },
  { name: 'asc' },
];

/**
 * Links always come back in the order the admin arranged. `createdAt` only breaks a tie between
 * rows that somehow share a `sortOrder`, so the order is total and the list never reshuffles.
 */
const LINK_ORDER: Prisma.MemberLinkOrderByWithRelationInput[] = [
  { sortOrder: 'asc' },
  { createdAt: 'asc' },
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

  async listLinks(teamMemberId: string): Promise<MemberLink[]> {
    // Read separately rather than `include`d on every member: only the profile page and the admin
    // edit form need links, and the Team tab lists every member without rendering any of them.
    const rows = await prisma.memberLink.findMany({
      where: { teamMemberId },
      orderBy: LINK_ORDER,
    });
    return rows.map(toLink);
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
          teamKind: input.data.teamKind,
          isDirector: input.data.isDirector ?? false,
          links: { create: toLinkRows(input.data.links ?? []) },
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
          teamKind: input.data.teamKind,
          isDirector: input.data.isDirector,
          sortOrder: input.data.sortOrder,
        },
      });

      // Replaced wholesale rather than diffed, inside the same transaction as the member write and
      // its audit entry — the same call `PublicationAuthor` rows make. The list is a handful of
      // short rows, nothing holds a reference to a link row's id, and an absent `links` key still
      // means "leave it alone", like every scalar column above.
      if (input.data.links) {
        await tx.memberLink.deleteMany({ where: { teamMemberId: row.id } });
        await tx.memberLink.createMany({
          data: toLinkRows(input.data.links).map((link) => ({ ...link, teamMemberId: row.id })),
        });
      }

      await tx.auditLog.create({ data: auditData(input.audit, row.id) });
      return row;
    });
    return toDomain(updated);
  }

  async deleteWithAudit(input: { id: string; audit: AuditContext }): Promise<void> {
    // CV entries, courses, projects and links cascade with the member. The service puts the
    // member's before-state in the audit metadata.
    await prisma.$transaction(async (tx) => {
      await tx.teamMember.delete({ where: { id: input.id } });
      await tx.auditLog.create({ data: auditData(input.audit, input.id) });
    });
  }
}
