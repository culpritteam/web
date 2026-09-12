import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { getProjectService, ProjectsAdmin } from '@/modules/projects';
import {
  getTeamMemberService,
  TEAM_KIND_LABELS,
  TEAM_KIND_RULES,
  allowsCourses,
} from '@/modules/research-groups';
import {
  CoursesAdmin,
  CV_SECTIONS,
  CV_SECTION_LABELS,
  CvEntriesAdmin,
  getCourseService,
  getCvEntryService,
} from '@/modules/teaching';
import { AdminScreen } from '../../_components/admin-screen';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const result = await getTeamMemberService().findById(id);
  const name = result.ok && result.data ? result.data.name : 'Team member';
  return { title: `Admin — ${name}` };
}

// One member's public profile page: their CV lists, the courses they teach and their projects.
// Identity, photo, team and links are edited in the member dialog on /admin/team.
//
// The lists are read from the teaching and projects services directly rather than through
// `findProfile`, which gates them by the member's team on the way out (ADR-017). That gating is
// right for the public page and wrong here: rows written before a team change still exist, and an
// admin screen that silently hid them would leave content nobody could find or delete. So the
// admin sees everything, and the team decides only what can be *added* — which is exactly what the
// services enforce on write.
export default async function AdminTeamMemberPage({ params }: Props) {
  const { id } = await params;
  const memberResult = await getTeamMemberService().findById(id);
  if (!memberResult.ok) throw new Error('Could not load this team member.');
  const member = memberResult.data;
  if (!member) notFound();

  const [entriesResult, coursesResult, projectsResult] = await Promise.all([
    getCvEntryService().listForMember(member.id),
    getCourseService().listForMember(member.id),
    getProjectService().listForMember(member.id),
  ]);
  const cvEntries = entriesResult.ok ? entriesResult.data : [];
  const courses = coursesResult.ok ? coursesResult.data : [];
  const projects = projectsResult.ok ? projectsResult.data : [];

  const rules = TEAM_KIND_RULES[member.teamKind];
  const editableSections = CV_SECTIONS.filter((section) => rules.cvSections.includes(section));
  // Sections this team cannot have but which still hold rows: shown last, delete-only.
  const retiredSections = CV_SECTIONS.filter(
    (section) =>
      !rules.cvSections.includes(section) && cvEntries.some((entry) => entry.section === section),
  );
  const coursesAllowed = allowsCourses(member.teamKind);
  const showCourses = coursesAllowed || courses.length > 0;

  // The jump list mirrors what the screen actually renders.
  const sections = [
    ...[...editableSections, ...retiredSections].map((section) => ({
      id: `cv-${section}`,
      label: CV_SECTION_LABELS[section],
    })),
    ...(showCourses ? [{ id: 'courses', label: 'Courses' }] : []),
    { id: 'projects', label: 'Projects' },
  ];

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
        intro={`${member.role} · ${TEAM_KIND_LABELS[member.teamKind]}. What this member's team can have is set by the team, on /admin/team.`}
        sections={sections}
      >
        <CvEntriesAdmin
          teamMemberId={member.id}
          sections={editableSections}
          retiredSections={retiredSections}
          entries={cvEntries}
        />
        <CoursesAdmin teamMemberId={member.id} courses={courses} allowed={coursesAllowed} />
        {/* Every team may have projects (TEAM_KIND_RULES), so this one is not gated. */}
        <ProjectsAdmin teamMemberId={member.id} projects={projects} />
      </AdminScreen>
    </div>
  );
}
