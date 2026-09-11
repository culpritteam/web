import { prisma } from '@/modules/shared/lib/prisma';
import { auditLogData } from '@/modules/shared/lib/audit';
import type { Prisma, Profile as PrismaProfile } from '@prisma/client';
import type { AuditContext, Profile } from './profile.types';
import type { PatchProfileInput, UpdateProfileInput } from './profile.schema';

// The ONLY place Prisma is used for profile data. Singleton: exactly one row is ever read/written.
// Seed/upsert-on-first-read — a fresh DB has no row until the admin's first save, so `get()`
// lazily creates a blank placeholder row rather than 404ing the public bio page.

export type UpdateProfileData = UpdateProfileInput;
export type PatchProfileData = PatchProfileInput;

export interface ProfileRepository {
  /** Returns the singleton row, creating a blank placeholder on first read. */
  get(): Promise<Profile>;
  /** Upsert the singleton row (every field) and write an audit entry in one transaction. */
  updateWithAudit(input: { data: UpdateProfileData; audit: AuditContext }): Promise<Profile>;
  /**
   * Merge only the supplied keys into the singleton row and write an audit entry in one
   * transaction. Absent key = column untouched; present key = column written (undefined/empty
   * clears it to NULL).
   */
  patchWithAudit(input: { data: PatchProfileData; audit: AuditContext }): Promise<Profile>;
}

/**
 * The writable scalar columns, all optional. Assignable to BOTH `ProfileUpdateInput` and
 * `ProfileCreateInput` — the update-operations union (e.g. `StringFieldUpdateOperationsInput`) is
 * only needed for atomic ops like `{ increment: 1 }`, which this module never uses.
 */
type ProfileWritableFields = {
  labName?: string;
  labTagline?: string | null;
  logoUrl?: string | null;
  labOverview?: string | null;
  positionAffiliation?: string | null;
  researchStatement?: string | null;
  calendlyUrl?: string | null;
  publicationsIntro?: string | null;
  teamIntro?: string | null;
  eventsIntro?: string | null;
  appointmentIntro?: string | null;
};

/** Nullable columns, in one list so full-write and partial-write stay in step. */
const NULLABLE_FIELDS = [
  'labTagline',
  'logoUrl',
  'labOverview',
  'positionAffiliation',
  'researchStatement',
  'calendlyUrl',
  'publicationsIntro',
  'teamIntro',
  'eventsIntro',
  'appointmentIntro',
] as const satisfies readonly (keyof ProfileWritableFields)[];

function toDomain(row: PrismaProfile): Profile {
  return {
    id: row.id,
    labName: row.labName,
    labTagline: row.labTagline,
    logoUrl: row.logoUrl,
    labOverview: row.labOverview,
    positionAffiliation: row.positionAffiliation,
    researchStatement: row.researchStatement,
    calendlyUrl: row.calendlyUrl,
    publicationsIntro: row.publicationsIntro,
    teamIntro: row.teamIntro,
    eventsIntro: row.eventsIntro,
    appointmentIntro: row.appointmentIntro,
    updatedAt: row.updatedAt,
  };
}

/** Whole-document write: every column is set, so an omitted optional field clears its column. */
function toFullWriteFields(data: UpdateProfileData): ProfileWritableFields {
  const fields: ProfileWritableFields = { labName: data.labName };
  for (const key of NULLABLE_FIELDS) fields[key] = data[key] ?? null;
  return fields;
}

/**
 * Partial write: only keys actually present in the parsed body are written. `in` (not a truthiness
 * or `!== undefined` check) is what distinguishes "field omitted, leave it alone" from "field sent
 * empty, clear it" — the schema's empty-string transform turns the latter into `undefined`.
 */
function toPatchFields(data: PatchProfileData): ProfileWritableFields {
  const fields: ProfileWritableFields = {};
  // A required scalar has no NULL to write to, so an explicit undefined is ignored rather than
  // being allowed to blank the row. The schema's `min(1)` means a present value is never empty.
  if (data.labName !== undefined) fields.labName = data.labName;
  for (const key of NULLABLE_FIELDS) {
    if (key in data) fields[key] = data[key] ?? null;
  }
  return fields;
}

/** Blank placeholder used only when the singleton row does not exist yet. */
const BLANK_PROFILE_DATA: Prisma.ProfileCreateInput = {
  labName: '',
};

const auditData = (audit: AuditContext, entityId: string) =>
  auditLogData('profile', audit, entityId);

export class PrismaProfileRepository implements ProfileRepository {
  async get(): Promise<Profile> {
    const existing = await prisma.profile.findFirst();
    if (existing) return toDomain(existing);
    const created = await prisma.profile.create({ data: BLANK_PROFILE_DATA });
    return toDomain(created);
  }

  async updateWithAudit(input: { data: UpdateProfileData; audit: AuditContext }): Promise<Profile> {
    return this.writeWithAudit(toFullWriteFields(input.data), input.audit);
  }

  async patchWithAudit(input: { data: PatchProfileData; audit: AuditContext }): Promise<Profile> {
    return this.writeWithAudit(toPatchFields(input.data), input.audit);
  }

  /** Single upsert-plus-audit transaction shared by the full and partial writes. */
  private async writeWithAudit(
    fields: ProfileWritableFields,
    audit: AuditContext,
  ): Promise<Profile> {
    const written = await prisma.$transaction(async (tx) => {
      const existing = await tx.profile.findFirst();

      const row = existing
        ? await tx.profile.update({ where: { id: existing.id }, data: fields })
        : await tx.profile.create({ data: { ...BLANK_PROFILE_DATA, ...fields } });

      await tx.auditLog.create({ data: auditData(audit, row.id) });
      return row;
    });
    return toDomain(written);
  }
}
