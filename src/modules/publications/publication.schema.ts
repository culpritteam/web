import { z } from 'zod';
import { entityId, optionalUrl, safeText } from '@/modules/shared/lib/schema-fields';

/**
 * One credited author.
 *
 * `teamMemberId` links the row to a team member so the same person cannot be credited twice; a
 * null id is an outside co-author who exists only as a name. The name is sent by the client rather
 * than resolved from the member on the server on purpose — it is a snapshot of what the admin saw
 * in the picker, and it is what renders from then on, even after that member is renamed or deleted.
 *
 * Not validated here: that `teamMemberId` refers to a real member. The foreign key does that, and a
 * bogus id rolls the whole transaction back.
 */
const publicationAuthor = z.object({
  teamMemberId: entityId.nullable().optional(),
  name: safeText(200),
});

/**
 * An ordered author list. Empty is valid and is the common case — it means the professor's own solo
 * work, and nothing is stored to represent him.
 *
 * The duplicate check is here rather than left to the composite unique index because the database
 * would reject it as a constraint violation the admin cannot read or act on.
 */
const authorList = z
  .array(publicationAuthor)
  .max(50)
  .superRefine((rows, ctx) => {
    const linked = rows.map((row) => row.teamMemberId).filter(Boolean);
    if (new Set(linked).size !== linked.length) {
      ctx.addIssue({ code: 'custom', message: 'Someone is listed twice.' });
    }
  });

/** Admin: create a publication. */
export const createPublicationSchema = z.object({
  title: safeText(400),
  authors: authorList.default([]),
  venue: safeText(400),
  year: z.coerce.number().int().min(1900).max(2100),
  /** Optional: many conference papers and book chapters have no stable public URL. */
  link: optionalUrl,
});
export type CreatePublicationInput = z.infer<typeof createPublicationSchema>;
export type PublicationAuthorInput = z.infer<typeof publicationAuthor>;

/** Admin: partial update of a publication. */
export const updatePublicationSchema = createPublicationSchema.partial();
export type UpdatePublicationInput = z.infer<typeof updatePublicationSchema>;
