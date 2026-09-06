import { z } from 'zod';
import { stripHtml } from '@/modules/shared/lib/sanitize';
import {
  entityId,
  httpUrl,
  optionalText,
  safeText,
  sortOrder,
} from '@/modules/shared/lib/schema-fields';

/** Admin: create a team member. `researchGroupId` is optional — a member need not belong to a group. */
export const createTeamMemberSchema = z.object({
  name: safeText(200),
  nickname: optionalText(100),
  role: safeText(200),
  // Optional-only, unlike the other free-text fields: an emptied bio arrives as `undefined`, whose
  // key JSON.stringify drops, so the update route leaves the column as it was.
  bio: z
    .string()
    .trim()
    .max(3000)
    .transform((value) => stripHtml(value) || undefined)
    .optional(),
  // Nullable, not just optional: an undefined key vanishes from the JSON body and the update
  // route reads that as "leave the column alone", so removing a photo needs an explicit null.
  photoUrl: httpUrl.nullable().optional(),
  /**
   * Defaults to true. False is for a research co-author that exists only so a byline can link to a
   * single record — a real collaborator, but not part of this site's team, and listing them beside
   * the people who built the site would misrepresent both.
   */
  showOnTeamTab: z.boolean().optional(),
  researchGroupId: entityId.nullable().optional(),
  sortOrder,
});
export type CreateTeamMemberInput = z.infer<typeof createTeamMemberSchema>;

/** Admin: partial update of a team member. */
export const updateTeamMemberSchema = createTeamMemberSchema.partial();
export type UpdateTeamMemberInput = z.infer<typeof updateTeamMemberSchema>;

/** Public: `groupId` path param on the filtered list route (`/api/team-members/group/[groupId]`). */
export const teamMemberGroupIdSchema = entityId;
