import type { Metadata } from 'next';
import { getProfileCached } from '@/modules/profile';
import { getResearchService, ResearchList } from '@/modules/research';
import { getTeamMemberService } from '@/modules/research-groups';
import { EmptyState } from '@/modules/shared/ui/empty-state';
import { PageHeading } from '@/modules/shared/ui/page-heading';
import { SectionNav, type SectionNavItem } from '@/modules/shared/ui/section-nav';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Research',
    description: 'Research statement, current works and areas of focus.',
  };
}

export default async function ResearchPage() {
  // Research interests moved to member profiles (ADR-016); the members are read here so a
  // contributor name that matches one links to their profile.
  const [result, profileResult, membersResult] = await Promise.all([
    getResearchService().list(),
    getProfileCached(),
    getTeamMemberService().list(),
  ]);

  const researchStatement = profileResult.ok ? profileResult.data?.researchStatement : null;
  const members = membersResult.ok ? membersResult.data : [];
  const works = result.ok ? result.data : [];
  const isEmpty = !researchStatement && works.length === 0;

  const sections: SectionNavItem[] = [
    ...(researchStatement ? [{ id: 'statement', label: 'Statement' }] : []),
    ...(works.length > 0 ? [{ id: 'works', label: 'Works' }] : []),
  ];

  return (
    <div>
      <PageHeading title="Research" />

      {isEmpty ? (
        <EmptyState title="No research listed yet" className="mt-10" />
      ) : (
        <div className="mt-12 space-y-10">
          <SectionNav items={sections} />

          {researchStatement && (
            <section id="statement" aria-label="Research statement">
              <p className="rise max-w-[62ch] text-pretty break-words font-serif text-lg leading-[1.75] text-foreground sm:text-xl">
                {researchStatement}
              </p>
            </section>
          )}

          {works.length > 0 && (
            <section id="works" aria-label="Research works">
              <ResearchList items={works} members={members} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
