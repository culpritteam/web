import type { Metadata } from 'next';
import Link from 'next/link';
import { getProfileCached } from '@/modules/profile';
import { getResearchService } from '@/modules/research';
import { getPublicationService } from '@/modules/publications';
import { getTeamMemberService } from '@/modules/research-groups';
import { getEventService } from '@/modules/events';
import { getCourseService, getCvEntryService } from '@/modules/teaching';
import { unwrapOr } from '@/modules/shared/lib/result';
import { INSTITUTION_TIME_ZONE } from '@/modules/shared/lib/timezone';
import { PageHeading } from '@/modules/shared/ui/page-heading';
import { YearColumns, DistributionBars, CompletenessMeter } from './_components/charts';
import type { YearDatum } from './_components/charts';

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Admin Dashboard' };
}

// The dashboard reports on what is actually published, using only fields the admin has already
// entered — publication years, research areas, event dates, courses. Nothing here
// is a vanity metric or an invented number; if the data isn't in the database, the panel isn't
// rendered at all.
//
// The forms follow from the data's job rather than from what looks impressive: output over time is
// a column chart, magnitude across named categories is a horizontal bar, a ratio against a ceiling
// is a meter, and a lone number is just a number. Each is a single series in one hue, so length
// carries the magnitude and colour carries nothing.
//
// Reads go through each module's service (a Server Component read, no client round trip). Every
// number here is an aggregate computed in SQL — a `stats()` call per module. This page used to `list()` eight tables
// in full and reduce them with `.length`, pulling every column of every row across the wire to
// render nine numbers and three charts.
//
// What stays in this file is the shaping that is a property of the chart rather than of the data:
// filling the empty years between the populated ones, and relabelling grouped counts.

/**
 * What a complete lab identity needs: the fields the site header and the public About tab render.
 * Member CVs are not counted — each is its own profile, and an empty list there is normal.
 */
const LAB_FIELDS = ['labName', 'labTagline', 'logoUrl', 'positionAffiliation', 'labOverview'] as const;

/**
 * Restores the empty years between the populated ones — a gap in output is itself information, and
 * `GROUP BY year` has no row for a year nothing was published in. This stays in the page because
 * it describes the chart, not the data.
 */
function toYearSeries(byYear: readonly { year: number; count: number }[]): YearDatum[] {
  if (byYear.length === 0) return [];
  const counts = new Map(byYear.map(({ year, count }) => [year, count]));
  // The repository returns years ascending, so the extremes are the ends of the array.
  const min = byYear[0].year;
  const max = byYear[byYear.length - 1].year;
  // Bound the span: one mistyped year would otherwise generate thousands of empty slots.
  const from = Math.max(min, max - 19);
  return Array.from({ length: max - from + 1 }, (_, index) => ({
    year: from + index,
    count: counts.get(from + index) ?? 0,
  }));
}

export default async function AdminDashboardPage() {
  const [profileResult, research, publications, teamMembers, events, courses, cvEntries] =
    await Promise.all([
      getProfileCached(),
      getResearchService().stats(),
      getPublicationService().stats(),
      getTeamMemberService().stats(),
      // No `now` argument: the upcoming boundary is evaluated at render time against the same
      // clock the public Events tab hands splitByTiming, so the two can never disagree.
      getEventService().stats(),
      getCourseService().stats(),
      getCvEntryService().stats(),
    ]);

  // A failed read degrades to zeroes, which hides the panel — exactly what the empty list did.
  const profile = unwrapOr(profileResult, null);
  const researchStats = unwrapOr(research, { total: 0, byArea: [] });
  const publicationStats = unwrapOr(publications, { total: 0, byYear: [], latestYear: null });
  const memberStats = unwrapOr(teamMembers, { total: 0 });
  const eventStats = unwrapOr(events, { total: 0, upcoming: 0, nextEventDate: null });
  const courseStats = unwrapOr(courses, { total: 0 });
  const cvEntryStats = unwrapOr(cvEntries, { total: 0, sections: [] });

  const years = toYearSeries(publicationStats.byYear);
  const byArea = researchStats.byArea.map(({ area, count }) => ({ label: area, count }));

  const filledFields = profile ? LAB_FIELDS.filter((field) => Boolean(profile[field])).length : 0;

  const nextDate = eventStats.nextEventDate
    ? new Intl.DateTimeFormat('en', {
        day: '2-digit',
        month: 'short',
        timeZone: INSTITUTION_TIME_ZONE,
      }).format(eventStats.nextEventDate)
    : null;

  const latestYear = publicationStats.latestYear;

  return (
    <div className="flex flex-col gap-12">
      <PageHeading as="h1" title="Dashboard" />

      {/* Headline counts. A number with a label is the right form for a single current value — a
          one-bar chart would say the same thing with more ink. */}
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Figure href="/admin/publications" label="Publications" value={publicationStats.total} />
        <Figure href="/admin/research" label="Research" value={researchStats.total} />
        <Figure href="/admin/team" label="People" value={memberStats.total} />
        <Figure
          href="/admin/team"
          label="Courses"
          value={courseStats.total}
          note={cvEntryStats.total > 0 ? `${cvEntryStats.total} CV entries` : undefined}
        />
        <Figure
          href="/admin/events"
          label="Upcoming"
          value={eventStats.upcoming}
          note={nextDate ? `next ${nextDate}` : undefined}
        />
      </dl>

      {years.length > 0 && (
        <Panel title="Output by year" note={latestYear ? `latest ${latestYear}` : undefined}>
          <YearColumns data={years} />
        </Panel>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {byArea.length > 0 && (
          <Panel title="Research areas">
            <DistributionBars data={byArea} />
          </Panel>
        )}


        <Panel
          title="Lab profile completeness"
          note={filledFields < LAB_FIELDS.length ? 'incomplete' : undefined}
        >
          <CompletenessMeter filled={filledFields} total={LAB_FIELDS.length} />
        </Panel>

        {/* Every event is public now — there is no visibility flag to report on — so the useful
            ratio here is how much of the events list is still ahead rather than already archive. */}
        {eventStats.total > 0 && (
          <Panel title="Events still to come" note={`of ${eventStats.total} total`}>
            <CompletenessMeter filled={eventStats.upcoming} total={eventStats.total} />
          </Panel>
        )}
      </div>
    </div>
  );
}

/** A headline count, linking into the screen that manages it. */
function Figure({
  href,
  label,
  value,
  note,
}: {
  href: string;
  label: string;
  value: number;
  note?: string;
}) {
  return (
    // `relative` + the link's `after` overlay make the whole tile the hit target, rather than just
    // the four-character number. The overlay is on the link itself, so there is still exactly one
    // focusable element with one accessible name — a second wrapping anchor would double it up,
    // and moving the anchor outside the <dd> would break the dl/dt/dd structure.
    <div className="group relative rounded-lg border border-border-strong bg-surface p-5 shadow-hairline transition-colors duration-300 ease-[var(--ease-out-expo)] hover:border-accent/40 has-[a:focus-visible]:outline has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-ring">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1">
        <Link
          href={href}
          aria-label={`${label}: ${value}`}
          className="tabular inline-block rounded-xs font-serif text-4xl leading-none text-foreground transition-colors duration-300 ease-[var(--ease-out-expo)] after:absolute after:inset-0 after:content-[''] group-hover:text-accent focus-visible:outline-none"
        >
          {value}
        </Link>
        {note && <p className="mt-1.5 font-mono text-xs text-muted-foreground">{note}</p>}
      </dd>
    </div>
  );
}

function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border-strong bg-surface shadow-hairline">
      <div className="flex items-baseline justify-between gap-4 border-b border-border px-6 py-4">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {note && <span className="font-mono text-xs text-muted-foreground">{note}</span>}
      </div>
      <div className="px-6 py-6">{children}</div>
    </section>
  );
}
