import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProfileLinks } from '@/modules/profile';
import { getTeamMemberService, memberInitials } from '@/modules/research-groups';
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

  const { member, cvEntries, courses } = profile;
  const entryGroups = groupBySection(cvEntries, CV_SECTIONS);
  const courseGroups = groupByLevel(courses);

  // The jump list mirrors what is on the page: only sections that have content.
  const sections: SectionNavItem[] = [
    ...(member.bio ? [{ id: 'biography', label: 'Biography' }] : []),
    ...entryGroups.map((group) => ({
      id: cvSectionAnchorId(group.section),
      label: CV_SECTION_LABELS[group.section],
    })),
    ...(courseGroups.length > 0 ? [{ id: 'courses', label: 'Courses' }] : []),
  ];

  return (
    <div>
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

        {(member.bio || member.linkedinUrl || member.googleScholarUrl) && (
          <section id="biography" aria-label="Biography" className="space-y-8">
            {member.bio && (
              <p className="rise max-w-[62ch] whitespace-pre-line text-pretty break-words font-serif text-lg leading-[1.75] text-foreground sm:text-xl">
                {member.bio}
              </p>
            )}
            <ProfileLinks links={member} />
          </section>
        )}

        <CvEntryList groups={entryGroups} />

        {courseGroups.length > 0 && (
          <section id="courses" aria-label="Courses">
            <CourseList groups={courseGroups} />
          </section>
        )}
      </div>
    </div>
  );
}
