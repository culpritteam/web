import { z } from 'zod';
import { optionalUrl, safeText } from '@/modules/shared/lib/schema-fields';

/**
 * One credited author: a plain typed name, exactly as it appears on the paper (ADR-016). Whether
 * that name is a lab member is decided at render time by matching it against members' names.
 */
const publicationAuthor = z.object({
  name: safeText(200),
});

/** An ordered author list; the array order is the citation order. Empty renders no byline. */
const authorList = z.array(publicationAuthor).max(50);

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
