import { z } from 'zod';
import { stripHtml } from '@/modules/shared/lib/sanitize';
import {
  httpUrl,
  optionalText,
  optionalUrl,
  safeText,
  sortOrder,
} from '@/modules/shared/lib/schema-fields';

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
  linkedinUrl: optionalUrl,
  googleScholarUrl: optionalUrl,
  /** Setting this on one member clears it on every other member in the same write. */
  isDirector: z.boolean().optional(),
  sortOrder,
});
export type CreateTeamMemberInput = z.infer<typeof createTeamMemberSchema>;

/** Admin: partial update of a team member. */
export const updateTeamMemberSchema = createTeamMemberSchema.partial();
export type UpdateTeamMemberInput = z.infer<typeof updateTeamMemberSchema>;
