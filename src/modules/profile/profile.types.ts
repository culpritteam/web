// Domain model — the shape services/routes work with. Mapped from the Prisma row inside the
// repository so Prisma's generated types never leak across the service boundary.
//
// The seven CV-style list fields that used to live here as Json columns moved to the `teaching`
// module's `cv_entry` table on 2026-09-02 (ADR-012). What is left is the singleton identity and
// prose: name, title, photo, bio, position, research statement and the two profile links.

export type Profile = {
  id: string;
  fullName: string;
  /** Byline form of the name, e.g. "J. Jaimunk". Null falls back to `fullName`. */
  citationName: string | null;
  title: string;
  photoUrl: string | null;
  bio: string | null;
  positionAffiliation: string | null;
  researchStatement: string | null;
  linkedinUrl: string | null;
  googleScholarUrl: string | null;
  /** Scheduling link embedded by the public Make Appointment tab (embed-only, never called server-side). */
  calendlyUrl: string | null;
  // Standfirst prose for the five public tabs that previously had no editable copy at all.
  // Null means "the page keeps its hardcoded default" — see prisma/schema.prisma.
  publicationsIntro: string | null;
  teachingIntro: string | null;
  teamIntro: string | null;
  eventsIntro: string | null;
  appointmentIntro: string | null;
  updatedAt: Date;
};

export type { AuditContext } from '@/modules/shared/lib/audit';
