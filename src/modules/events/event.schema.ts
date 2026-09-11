import { z } from 'zod';
import { stripHtml } from '@/modules/shared/lib/sanitize';
import { entityId, httpUrl, optionalText, safeText } from '@/modules/shared/lib/schema-fields';
import { parseInstitutionLocalDatetime } from '@/modules/shared/lib/timezone';
import { parseYouTubeVideoId } from '@/modules/integrations/youtube/youtube-utils';

// A bare `<input type="datetime-local">` value ("YYYY-MM-DDTHH:mm") carries no timezone, so a
// plain `z.coerce.date()` would interpret it using whatever machine happens to run the parse
// (browser on the client, container on the server) — see `parseInstitutionLocalDatetime`. Piped
// through `z.preprocess` so both the local admin string and the UTC ISO string it round-trips to
// on the wire (already zone-explicit) parse to the same instant. Carried over verbatim from the
// appointment schema this module replaced; the timezone problem did not go away with it.
const institutionDate = z.preprocess(
  (value) => (typeof value === 'string' ? parseInstitutionLocalDatetime(value) : value),
  z.date(),
);

/**
 * A photo URL produced by POST /api/admin/events/photo. Validated as a URL rather than trusted:
 * the client sends back whatever the upload route handed it, and this is a server boundary.
 */
const photoUrlSchema = httpUrl.min(1);

/**
 * A video reference. Accepts a YouTube watch/share/embed/shorts URL or a bare 11-character video
 * ID, and stores the *normalised ID* — parsing at the boundary means the render path never has to
 * cope with five URL shapes, and a non-YouTube URL is rejected here rather than silently rendering
 * an empty embed. YouTube is the project's only video host: no video file is stored or proxied
 * (see modules/integrations/youtube and the project's free-tier constraint).
 */
const videoRefSchema = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .refine((value) => parseYouTubeVideoId(value) !== null, {
    message: 'Must be a YouTube video link or ID.',
  })
  // `?? value` is unreachable — the refine above has already rejected anything that doesn't parse.
  // It is there so this stays an expression with no non-null assertion.
  .transform((value) => parseYouTubeVideoId(value) ?? value);

/** Admin: create an event. */
export const createEventSchema = z.object({
  title: safeText(300),
  description: safeText(10_000),
  content: optionalText(50_000),
  eventDate: institutionDate,
  photoUrls: z.array(photoUrlSchema).max(20).optional(),
  videoUrls: z.array(videoRefSchema).max(10).optional(),
});
export type CreateEventInput = z.infer<typeof createEventSchema>;

/** Admin: partial update of an event. */
export const updateEventSchema = createEventSchema.partial();
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

/** Admin: identify one participant row (DELETE path param). */
export const participantIdSchema = entityId;

/**
 * Admin: add one participant to an event.
 *
 * A discriminated union rather than one loose object with everything optional, so the two ways of
 * adding somebody cannot be mixed into a nonsensical request (a guest carrying a teamMemberId, or
 * a member with a hand-typed name that would disagree with the row it links to). The `member`
 * branch deliberately carries no name: the server reads it from the team member and snapshots it,
 * so the client cannot spoof who was there.
 */
export const addParticipantSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('member'),
    teamMemberId: entityId,
  }),
  z.object({
    kind: z.literal('guest'),
    name: safeText(200),
    role: z
      .string()
      .trim()
      .max(200)
      .transform((v) => stripHtml(v) || undefined)
      .optional(),
  }),
]);
export type AddParticipantInput = z.infer<typeof addParticipantSchema>;
