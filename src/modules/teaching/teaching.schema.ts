import { z } from 'zod';
import {
  entityId,
  optionalText,
  optionalUrl,
  safeText,
  sortOrder,
} from '@/modules/shared/lib/schema-fields';
import { CV_SECTIONS } from './teaching.types';

/** Which list an entry belongs to. Mirrors the Prisma enum; validated at the boundary. */
export const cvSectionSchema = z.enum(CV_SECTIONS);

/**
 * Admin: create a CV entry for one team member. An unknown `teamMemberId` is rejected by the
 * foreign key, which rolls the write back.
 */
export const createCvEntrySchema = z.object({
  teamMemberId: entityId,
  section: cvSectionSchema,
  title: safeText(300),
  subtitle: optionalText(300),
  // Free text rather than a number — "2019-2023" and "present" are both normal.
  year: optionalText(50),
  description: optionalText(2000),
  sortOrder,
});
export type CreateCvEntryInput = z.infer<typeof createCvEntrySchema>;

/** Admin: partial update of a CV entry. The owning member cannot be changed. */
export const updateCvEntrySchema = createCvEntrySchema.omit({ teamMemberId: true }).partial();
export type UpdateCvEntryInput = z.infer<typeof updateCvEntrySchema>;

/** Admin: create a course taught by one team member. */
export const createCourseSchema = z.object({
  teamMemberId: entityId,
  code: optionalText(50),
  title: safeText(300),
  level: safeText(100),
  term: optionalText(100),
  description: optionalText(5000),
  link: optionalUrl,
  sortOrder,
});
export type CreateCourseInput = z.infer<typeof createCourseSchema>;

/** Admin: partial update of a course. The owning member cannot be changed. */
export const updateCourseSchema = createCourseSchema.omit({ teamMemberId: true }).partial();
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
