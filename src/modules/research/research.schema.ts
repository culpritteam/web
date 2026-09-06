import { z } from 'zod';
import { entityId, optionalUrl, safeText, sortOrder } from '@/modules/shared/lib/schema-fields';

/**
 * One credited contributor. Same shape and same reasoning as a publication author — see
 * `publication.schema.ts`. Deliberately duplicated rather than shared: the two lists already differ
 * in their bounds, and a shared fragment would couple two modules for fifteen lines.
 */
const researchContributor = z.object({
  teamMemberId: entityId.nullable().optional(),
  name: safeText(200),
});

/** Empty means the professor's own solo work; nothing is stored to represent him. */
const contributorList = z
  .array(researchContributor)
  .max(20)
  .superRefine((rows, ctx) => {
    const linked = rows.map((row) => row.teamMemberId).filter(Boolean);
    if (new Set(linked).size !== linked.length) {
      ctx.addIssue({ code: 'custom', message: 'Someone is listed twice.' });
    }
  });

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
