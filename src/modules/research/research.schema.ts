import { z } from 'zod';
import { optionalUrl, safeText, sortOrder } from '@/modules/shared/lib/schema-fields';

/**
 * One credited contributor: a plain typed name. Same shape and reasoning as a publication author —
 * see `publication.schema.ts`. Duplicated rather than shared: the two lists differ in their bounds,
 * and a shared fragment would couple two modules for a few lines.
 */
const researchContributor = z.object({
  name: safeText(200),
});

/** In display order. Empty renders no byline. */
const contributorList = z.array(researchContributor).max(20);

/** Admin: create a research work. */
export const createResearchSchema = z.object({
  title: safeText(300),
  summary: safeText(5000),
  area: safeText(200),
  /** Optional external artefact — a tool listing, project page or dataset. */
  link: optionalUrl,
  contributors: contributorList.default([]),
  sortOrder,
});
export type CreateResearchInput = z.infer<typeof createResearchSchema>;
export type ResearchContributorInput = z.infer<typeof researchContributor>;

/** Admin: partial update of a research work. */
export const updateResearchSchema = createResearchSchema.partial();
export type UpdateResearchInput = z.infer<typeof updateResearchSchema>;
