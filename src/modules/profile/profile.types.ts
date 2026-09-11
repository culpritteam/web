// Domain model — the shape services/routes work with. Mapped from the Prisma row inside the
// repository so Prisma's generated types never leak across the service boundary.
//
// The lab's singleton (ADR-016). The professor's name, photo, bio, citation name and links moved to
// her team-member row (the director); her CV lines are `cv_entry` rows on that member (ADR-012).

export type Profile = {
  id: string;
  /** "The Culprit of Privacy Technologies" — the site header's h1. */
  labName: string;
  labTagline: string | null;
  logoUrl: string | null;
  /** The About page body. */
  labOverview: string | null;
  /** The lab's department / host institution. */
  positionAffiliation: string | null;
  /** The Research tab's intro prose. */
  researchStatement: string | null;
  /** Scheduling link embedded by the public Make Appointment tab (embed-only, never called server-side). */
  calendlyUrl: string | null;
  // Standfirst prose for public tabs. Null means "the page keeps its hardcoded default" — see
  // prisma/schema.prisma.
  publicationsIntro: string | null;
  teamIntro: string | null;
  eventsIntro: string | null;
  appointmentIntro: string | null;
  updatedAt: Date;
};

export type { AuditContext } from '@/modules/shared/lib/audit';
