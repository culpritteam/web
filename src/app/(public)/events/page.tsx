import type { Metadata } from 'next';
import { EventList, getEventService, PastEventList, splitByTiming } from '@/modules/events';
import { getProfileCached } from '@/modules/profile';
import { EmptyState } from '@/modules/shared/ui/empty-state';
import { PageHeading } from '@/modules/shared/ui/page-heading';
import { toMetaDescription } from '../_lib/page-meta';

// Tighter than the public layout's 3600s safety net, matching `/api/events`: the upcoming/past
// boundary is computed against the clock at prerender time, so a cached page can only be trusted
// for as long as it is plausible that no event has crossed it. Admin edits still reach the page
// immediately via `revalidatePath('/events')` — this only bounds clock drift.
export const revalidate = 300;

const FALLBACK_DESCRIPTION = 'Upcoming and past talks, workshops and visits.';

export async function generateMetadata(): Promise<Metadata> {
  const profileResult = await getProfileCached();
  return {
    title: 'Events',
    description: toMetaDescription(
      profileResult.ok ? profileResult.data?.eventsIntro : null,
      FALLBACK_DESCRIPTION,
    ),
  };
}

export default async function EventsPage() {
  // The profile read is the layout's, deduplicated per request — it is here only for the intro.
  const [result, profileResult] = await Promise.all([getEventService().list(), getProfileCached()]);
  const intro = profileResult.ok ? profileResult.data?.eventsIntro : null;
  // Upcoming vs past is decided here, against the clock at render time — the database stores only
  // the date. The route's 300s revalidate ceiling bounds how long a page can keep claiming an
  // event is upcoming after it has passed.
  const { upcoming, past } = splitByTiming(result.ok ? result.data : []);
  const isEmpty = upcoming.length === 0 && past.length === 0;

  return (
    <div>
      <PageHeading title="Events" />

      <div className="mt-12 space-y-14">
        {intro && (
          <p className="rise max-w-[62ch] text-pretty break-words font-serif text-lg leading-[1.75] text-foreground sm:text-xl">
            {intro}
          </p>
        )}

        {isEmpty ? (
          <EmptyState title="Nothing listed yet" />
        ) : (
          <>
            {/* Both sections are labelled even when only one has content: "Upcoming" with nothing
              under it is a real answer to the question a visitor came with, and silently showing
              only past events would read as if those were the next ones. */}
            <section aria-labelledby="events-upcoming-heading">
              <h2
                id="events-upcoming-heading"
                className="font-mono text-xs uppercase leading-5 tracking-[0.12em] text-accent"
              >
                Upcoming
              </h2>
              {upcoming.length === 0 ? (
                <EmptyState title="Nothing scheduled" className="mt-5" />
              ) : (
                <div className="mt-5">
                  <EventList events={upcoming} />
                </div>
              )}
            </section>

            {past.length > 0 && (
              <section aria-labelledby="events-past-heading">
                <h2
                  id="events-past-heading"
                  className="font-mono text-xs uppercase leading-5 tracking-[0.12em] text-muted-foreground"
                >
                  Past
                </h2>
                <div className="mt-5">
                  <PastEventList events={past} />
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
