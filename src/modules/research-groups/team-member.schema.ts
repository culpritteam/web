import { z } from 'zod';
import { stripHtml } from '@/modules/shared/lib/sanitize';
import {
  httpUrl,
  optionalText,
  safeText,
  sortOrder,
} from '@/modules/shared/lib/schema-fields';
import { TEAM_KINDS } from '@/modules/shared/lib/team-kind';

/** Which team a member belongs to. Mirrors the Prisma enum; validated at the boundary. */
export const teamKindSchema = z.enum(TEAM_KINDS);

/**
 * One external profile link. `label` is free text the admin types — deliberately NOT validated
 * against a known list, so a new service is data rather than a migration. `url` goes through the
 * same http(s)-only check as every other stored URL: these render straight into an `href`.
 */
const memberLink = z.object({
  label: safeText(60),
  url: httpUrl,
});
export type MemberLinkInput = z.infer<typeof memberLink>;

/** An ordered link list; the array order is the display order. Empty renders no links. */
const linkList = z.array(memberLink).max(20);

/** Admin: create a team member. */
export const createTeamMemberSchema = z.object({
  name: safeText(200),
  /** How they are credited on a paper, e.g. "J. Jaimunk". Byline names are matched against it. */
  citationName: optionalText(200),
  role: safeText(200),
  affiliation: optionalText(300),
  // Optional-only, unlike the other free-text fields: an emptied bio arrives as `undefined`, whose
  // key JSON.stringify drops, so the update route leaves the column as it was.
  bio: z
    .string()
    .trim()
    .max(5000)
    .transform((value) => stripHtml(value) || undefined)
    .optional(),
  // Nullable, not just optional: an undefined key vanishes from the JSON body and the update
  // route reads that as "leave the column alone", so removing a photo needs an explicit null.
  photoUrl: httpUrl.nullable().optional(),
  /** Required: the team is an editorial decision, with no sensible default to fall back on. */
  teamKind: teamKindSchema,
  /**
   * Derived from `teamKind` by the service and accepted only for backward compatibility — sending
   * `isDirector: true` is the same as sending `teamKind: 'director'`. When both arrive, the team
   * wins. Setting it on one member clears it on every other member in the same write.
   */
  isDirector: z.boolean().optional(),
  /** The whole link list, replacing whatever is stored. Absent on an update means "leave alone". */
  links: linkList.default([]),
  sortOrder,
});
export type CreateTeamMemberInput = z.infer<typeof createTeamMemberSchema>;

/**
 * Admin: partial update of a team member.
 *
 * `links` is re-declared without its `.default([])`: `.partial()` alone keeps the default, so an
 * update that never mentions links would arrive as an empty array and the repository would replace
 * the stored list with nothing. Absent has to stay absent for "leave them alone" to hold.
 */
export const updateTeamMemberSchema = createTeamMemberSchema
  .partial()
  .extend({ links: linkList.optional() });
export type UpdateTeamMemberInput = z.infer<typeof updateTeamMemberSchema>;
