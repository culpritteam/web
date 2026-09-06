import { z } from 'zod';
import { stripHtml } from '@/modules/shared/lib/sanitize';
import { httpUrl, optionalUrl, safeText } from '@/modules/shared/lib/schema-fields';

// The CV list fields are gone from this schema: they are `cv_entry` rows now, edited one at a
// time through the teaching module rather than as part of this whole-document PUT (ADR-012).

// Local rather than the shared `optionalText`: these fields parse an emptied value to `undefined`,
// which the profile repository's `key in data` check still writes as NULL. The shared helper's
// explicit null would widen `UpdateProfileInput`, which the admin form's own types are built on.
const optionalSafeText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => stripHtml(value) || undefined)
    .optional();

/** Admin: replace the whole structured profile (singleton, full-document PUT). */
export const updateProfileSchema = z.object({
  fullName: safeText(200),
  /**
   * How she is credited on a paper — "J. Jaimunk", not "Jenjira Jaimunk, PhD.". Optional: leave it
   * empty and a self-credited byline falls back to the full name.
   */
  citationName: optionalSafeText(200),
  title: safeText(200),
  photoUrl: httpUrl.nullable().optional(),
  bio: optionalSafeText(5000),
  positionAffiliation: optionalSafeText(3000),
  researchStatement: optionalSafeText(5000),
  linkedinUrl: optionalUrl,
  googleScholarUrl: optionalUrl,
  calendlyUrl: optionalUrl,
  // Per-tab standfirst prose. 2000 chars is a standfirst, not an essay — the long-form fields
  // (bio, researchStatement) keep their 5000.
  publicationsIntro: optionalSafeText(2000),
  teachingIntro: optionalSafeText(2000),
  teamIntro: optionalSafeText(2000),
  eventsIntro: optionalSafeText(2000),
  appointmentIntro: optionalSafeText(2000),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/**
 * Admin: update SOME fields of the singleton, leaving every unmentioned field alone.
 *
 * The admin IA gives each public tab its own admin screen — About edits identity/bio/links,
 * Research edits `researchStatement`, Teaching edits `teachingIntro`, and so on. With only the
 * whole-document PUT above, every one of those screens would have to round-trip the other
 * screens' fields and would clobber them on a concurrent save. A partial write is what makes
 * that IA correct.
 *
 * Semantics: a key that is ABSENT is untouched. A key that is PRESENT is written — including an
 * empty string, which `optionalSafeText`/`optionalUrl` parse to undefined/null and the repository
 * persists as NULL. That is how a screen clears its own field.
 *
 * An empty object is rejected rather than accepted as a no-op: a PATCH whose whole body was
 * dropped as unknown keys is a client bug, and a silent 200 would hide it.
 */
export const patchProfileSchema = updateProfileSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update.',
  });
export type PatchProfileInput = z.infer<typeof patchProfileSchema>;
