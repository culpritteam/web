import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { getTeamMemberService } from '@/modules/research-groups';
import { CoursesAdmin, CV_SECTIONS, CV_SECTION_LABELS, CvEntriesAdmin } from '@/modules/teaching';
import { AdminScreen } from '../../_components/admin-screen';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const result = await getTeamMemberService().findById(id);
  const name = result.ok && result.data ? result.data.name : 'Team member';
  return { title: `Admin — ${name}` };
}

// One member's public profile page: every CV list and the courses they teach. Identity, photo
// and links are edited in the member dialog on /admin/team.
const SECTIONS = [
  ...CV_SECTIONS.map((section) => ({ id: `cv-${section}`, label: CV_SECTION_LABELS[section] })),
  { id: 'courses', label: 'Courses' },
];

export default async function AdminTeamMemberPage({ params }: Props) {
  const { id } = await params;
  const result = await getTeamMemberService().findProfile(id);
  if (!result.ok) throw new Error('Could not load this team member.');
  if (!result.data) notFound();

  const { member, cvEntries, courses } = result.data;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/team"
        className="inline-flex w-fit items-center gap-1 rounded-xs text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        Back to team
      </Link>
      <AdminScreen
        title={member.name}
        intro={`${member.role}. The CV lists and courses on this member's public profile.`}
        sections={SECTIONS}
      >
        <CvEntriesAdmin teamMemberId={member.id} sections={CV_SECTIONS} entries={cvEntries} />
        <CoursesAdmin teamMemberId={member.id} courses={courses} />
      </AdminScreen>
    </div>
  );
}
