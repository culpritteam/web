import type { Metadata } from 'next';
import { getProfileCached } from '@/modules/profile';
import { getResearchService, ResearchList } from '@/modules/research';
import {
  CV_SECTION_LABELS,
  CvEntryList,
  getCvEntryService,
  groupBySection,
  RESEARCH_SECTIONS,
} from '@/modules/teaching';
import { cvSectionAnchorId } from '@/modules/teaching/ui/cv-entry-list';
import { EmptyState } from '@/modules/shared/ui/empty-state';
import { PageHeading } from '@/modules/shared/ui/page-heading';
import { SectionNav, type SectionNavItem } from '@/modules/shared/ui/section-nav';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Research',
    description: 'Research statement, interests, current works and areas of focus.',
  };
}

export default async function ResearchPage() {
  // Three reads: the research works list, the singleton profile (for the research statement — the
  // same field About used to render before it moved here), and the research_interest CV entries
  // (also moved off About; see teaching.types.ts CvSection for the full split).
  const [result, profileResult, entriesResult] = await Promise.all([
    getResearchService().list(),
    getProfileCached(),
    getCvEntryService().listBySections(RESEARCH_SECTIONS),
  ]);

  const entryGroups = groupBySection(entriesResult.ok ? entriesResult.data : [], RESEARCH_SECTIONS);
  const researchStatement = profileResult.ok ? profileResult.data?.researchStatement : null;
  const citationName = profileResult.ok ? profileResult.data?.citationName : null;
  const works = result.ok ? result.data : [];
  const hasIntro = Boolean(researchStatement) || entryGroups.length > 0;
  const isEmpty = !hasIntro && works.length === 0;

  // Three stacked blocks, so the jump list is worth having — but only the ones with content are
  // offered, and SectionNav renders nothing at all below two.
  const sections: SectionNavItem[] = [
    ...(researchStatement ? [{ id: 'statement', label: 'Statement' }] : []),
    ...entryGroups.map((group) => ({
      id: cvSectionAnchorId(group.section),
      label: CV_SECTION_LABELS[group.section],
    })),
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

          {/* `aria-label` on the wrapper, because the statement is prose with no heading of its
              own: it makes the block a named region an assistive-tech user can reach by the same
              name the jump list uses. The CV list and the works index already carry headings, so
              they are labelled by those instead of being renamed here. */}
          {researchStatement && (
            <section id="statement" aria-label="Research statement">
              <p className="rise max-w-[62ch] text-pretty break-words font-serif text-lg leading-[1.75] text-foreground sm:text-xl">
                {researchStatement}
              </p>
            </section>
          )}

          <CvEntryList groups={entryGroups} />

          {works.length > 0 && (
            <section id="works" aria-label="Research works">
              <ResearchList items={works} citationName={citationName} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
