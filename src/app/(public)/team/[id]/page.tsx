import { cache } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ProfileLinks } from '@/modules/profile';
import { ProjectList } from '@/modules/projects';
import { getPublicationService } from '@/modules/publications';
import { getResearchService } from '@/modules/research';
import {
  allowsResearchAndPublications,
  CreditedWorkList,
  getTeamMemberService,
  isMemberByline,
  memberInitials,
  type CreditedWork,
} from '@/modules/research-groups';
import {
  CourseList,
  CV_SECTION_LABELS,
  CV_SECTIONS,
  CvEntryList,
  groupByLevel,
  groupBySection,
} from '@/modules/teaching';
import { cvSectionAnchorId } from '@/modules/teaching/ui/cv-entry-list';
import { Avatar } from '@/modules/shared/ui/avatar';
import { PageHeading } from '@/modules/shared/ui/page-heading';
import { SectionNav, type SectionNavItem } from '@/modules/shared/ui/section-nav';
import { toMetaDescription } from '../../_lib/page-meta';

type Props = { params: Promise<{ id: string }> };

// Request-scoped, so generateMetadata and the page share one read.
const loadProfile = cache(async (id: string) => {
  const result = await getTeamMemberService().findProfile(id);
  return result.ok ? result.data : null;
});

/**
 * The research items and publications this member is credited on.
 *
 * Resolved here, at render time, against the full lists: a byline carries no link to a member
 * (ADR-016), so the match is `isMemberByline` over names. Both lists are the lab's whole output —
 * tens of rows, already read on their own tabs — so filtering two arrays in the page is cheaper
 * than a per-member query, and it is skipped entirely for a team whose profile has no such section
 * (ADR-017: a name collision must not manufacture a publication list for an engineer).
 *
 * Each row links back to its tab rather than repeating the entry. Publications carry a year anchor,
 * which the year rail on /publications renders for every year that has rows; research areas are
 * ordered by the admin's arrangement and their anchors are positional, so those rows land on the
 * works section instead of guessing an index.
 */
async function creditedWorks(member: { name: string; citationName: string | null }) {
  const [researchResult, publicationsResult] = await Promise.all([
    getResearchService().list(),
    getPublicationService().list(),
  ]);

  const research: CreditedWork[] = (researchResult.ok ? researchResult.data : [])
    .filter((item) => item.contributors.some((c) => isMemberByline(member, c.name)))
    .map((item) => ({ id: item.id, title: item.title, meta: item.area, href: '/research#works' }));

  const publications: CreditedWork[] = (publicationsResult.ok ? publicationsResult.data : [])
    .filter((item) => item.authors.some((author) => isMemberByline(member, author.name)))
    .map((item) => ({
      id: item.id,
      title: item.title,
      meta: `${item.venue}, ${item.year}`,
      href: `/publications#publications-${item.year}`,
    }));

  return { research, publications };
}

// Prerender every member's profile at build time so these pages join the Full Route Cache with the
// rest of the public site. Without this the route builds as Dynamic and is re-rendered — and
// re-queried — on every visit, which also left the `/team/[id]` template purges in
// shared/lib/revalidate as dead calls: there was no cache entry for them to drop.
// `dynamicParams` keeps its default, so a member added after the build still renders on demand and
// is cached from then on.
export async function generateStaticParams() {
  const result = await getTeamMemberService().list();
  return result.ok ? result.data.map((member) => ({ id: member.id })) : [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const profile = await loadProfile((await params).id);
  if (!profile) return { title: 'Team member not found', robots: { index: false } };
  const { member } = profile;
  return {
    title: member.name,
    description: toMetaDescription(member.bio, `${member.name}, ${member.role}.`),
  };
}

export default async function TeamMemberPage({ params }: Props) {
  const profile = await loadProfile((await params).id);
  if (!profile) notFound();

  // Every array here is already gated by the member's team in the service — a section their team
  // cannot have simply arrives empty, so this page renders what it is given.
  const { member, links, cvEntries, courses, projects } = profile;
  const entryGroups = groupBySection(cvEntries, CV_SECTIONS);
  const courseGroups = groupByLevel(courses);
  const { research, publications } = allowsResearchAndPublications(member.teamKind)
    ? await creditedWorks(member)
    : { research: [], publications: [] };

  // The jump list mirrors what is on the page: only sections that have content.
  const sections: SectionNavItem[] = [
    ...(member.bio ? [{ id: 'biography', label: 'Biography' }] : []),
    ...entryGroups.map((group) => ({
      id: cvSectionAnchorId(group.section),
      label: CV_SECTION_LABELS[group.section],
    })),
    ...(courseGroups.length > 0 ? [{ id: 'courses', label: 'Courses' }] : []),
    ...(projects.length > 0 ? [{ id: 'projects', label: 'Projects' }] : []),
    ...(research.length > 0 ? [{ id: 'research', label: 'Research' }] : []),
    ...(publications.length > 0 ? [{ id: 'publications', label: 'Publications' }] : []),
  ];

  return (
    <div>
      <Link
        href="/team"
        className="mb-8 inline-flex items-center gap-2 rounded-sm text-sm tracking-tight text-muted-foreground transition-colors duration-300 ease-[var(--ease-out-expo)] hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to Team
      </Link>

      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:gap-8">
        <Avatar
          src={member.photoUrl}
          alt={`Portrait of ${member.name}`}
          fallback={memberInitials(member.name)}
          size="lg"
        />
        <div className="min-w-0">
          {member.isDirector && (
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.12em] text-accent">
              Director
            </p>
          )}
          <PageHeading title={member.name} />
          <p className="mt-2 break-words font-serif text-lg italic text-accent">{member.role}</p>
          {member.affiliation && (
            <p className="mt-1 max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground">
              {member.affiliation}
            </p>
          )}
        </div>
      </div>

      <div className="mt-12 space-y-10">
        <SectionNav items={sections} />

        {(member.bio || links.length > 0) && (
          <section id="biography" aria-label="Biography" className="space-y-8">
            {member.bio && (
              <p className="rise max-w-[62ch] whitespace-pre-line text-pretty break-words font-serif text-lg leading-[1.75] text-foreground sm:text-xl">
                {member.bio}
              </p>
            )}
            <ProfileLinks links={links} />
          </section>
        )}

        <CvEntryList groups={entryGroups} />

        {courseGroups.length > 0 && (
          <section id="courses" aria-label="Courses">
            <CourseList groups={courseGroups} />
          </section>
        )}

        {/* The headings below are set exactly like the CV section headings, so the page reads as
            one sequence of sections rather than two families of them. */}
        {projects.length > 0 && (
          <section id="projects" aria-labelledby="projects-heading">
            <h2 id="projects-heading" className="font-serif text-xl font-semibold text-accent">
              Projects
            </h2>
            <div className="mt-5">
              <ProjectList projects={projects} />
            </div>
          </section>
        )}

        {research.length > 0 && (
          <section id="research" aria-labelledby="research-heading">
            <h2 id="research-heading" className="font-serif text-xl font-semibold text-accent">
              Research
            </h2>
            <div className="mt-5">
              <CreditedWorkList items={research} />
            </div>
          </section>
        )}

        {publications.length > 0 && (
          <section id="publications" aria-labelledby="publications-heading">
            <h2 id="publications-heading" className="font-serif text-xl font-semibold text-accent">
              Publications
            </h2>
            <div className="mt-5">
              <CreditedWorkList items={publications} />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
