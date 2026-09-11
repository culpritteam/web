import type { Metadata } from 'next';
import { getProfileCached } from '@/modules/profile';
import { getTeamMemberService, TeamMemberCard } from '@/modules/research-groups';
import { EmptyState } from '@/modules/shared/ui/empty-state';
import { PageHeading } from '@/modules/shared/ui/page-heading';
import { toMetaDescription } from './_lib/page-meta';

const FALLBACK_DESCRIPTION = 'About the lab, its work, and its director.';

export async function generateMetadata(): Promise<Metadata> {
  const result = await getProfileCached();
  return {
    title: 'About',
    description: toMetaDescription(
      result.ok ? result.data?.labOverview : null,
      FALLBACK_DESCRIPTION,
    ),
  };
}

export default async function AboutPage() {
  // The lab overview plus a card for the director (ADR-016). Her CV lives on her own profile page,
  // which the card links to. The member list is a handful of rows, ordered director-first.
  const [profileResult, membersResult] = await Promise.all([
    getProfileCached(),
    getTeamMemberService().list(),
  ]);

  const overview = profileResult.ok ? profileResult.data?.labOverview : null;
  const director = membersResult.ok
    ? membersResult.data.find((member) => member.isDirector)
    : undefined;

  return (
    <div>
      <PageHeading title="About" />

      {!overview && !director ? (
        <EmptyState title="Nothing here yet" className="mt-10" />
      ) : (
        <div className="mt-12 space-y-12">
          {overview && (
            <p className="rise max-w-[62ch] whitespace-pre-line text-pretty break-words font-serif text-lg leading-[1.75] text-foreground sm:text-xl">
              {overview}
            </p>
          )}

          {director && (
            <section aria-labelledby="about-director" className="max-w-md">
              <h3
                id="about-director"
                className="mb-4 font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground"
              >
                Lab director
              </h3>
              <TeamMemberCard member={director} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
