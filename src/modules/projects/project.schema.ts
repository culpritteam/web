import { z } from 'zod';
import {
  entityId,
  optionalUrl,
  safeText,
  sortOrder,
} from '@/modules/shared/lib/schema-fields';

/**
 * Admin: create a project for one team member. An unknown `teamMemberId` is rejected by the foreign
 * key, which rolls the write back. Every team may have projects, so there is no team rule here.
 */
export const createProjectSchema = z.object({
  teamMemberId: entityId,
  title: safeText(300),
  summary: safeText(5000),
  link: optionalUrl,
  sortOrder,
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

/** Admin: partial update of a project. The owning member cannot be changed. */
export const updateProjectSchema = createProjectSchema.omit({ teamMemberId: true }).partial();
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

/** Admin: the list query — one member's projects. */
export const listProjectsQuerySchema = z.object({ teamMemberId: entityId });
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
