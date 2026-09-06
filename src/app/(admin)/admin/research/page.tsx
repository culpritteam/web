import type { Metadata } from 'next';
import { getProfileCached, ProfileFieldsForm } from '@/modules/profile';
import { getResearchService, ResearchTable } from '@/modules/research';
import { getTeamMemberService } from '@/modules/research-groups';
import { CvEntriesAdmin, getCvEntryService, RESEARCH_SECTIONS } from '@/modules/teaching';
import { AdminScreen } from '../_components/admin-screen';

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Admin — Research' };
}

// Mirrors the public Research tab: the statement, the interests, then the works — the same three
// blocks in the same order the visitor reads them. Previously these lived on three different
// admin screens (profile, teaching, research).
const SECTIONS = [
  { id: 'statement', label: 'Statement' },
  { id: 'cv-research_interest', label: 'Interests' },
  { id: 'works', label: 'Works' },
] as const;

const PROFILE_SECTIONS = [
  {
    id: 'statement',
    title: 'Research statement',
    description: 'The prose that opens the public Research tab.',
    fields: ['researchStatement'],
  },
] as const;

export default async function AdminResearchPage() {
  const [profileResult, entriesResult, worksResult, membersResult] = await Promise.all([
    getProfileCached(),
    getCvEntryService().listBySections(RESEARCH_SECTIONS),
    getResearchService().list(),
    getTeamMemberService().list(),
  ]);

  return (
    <AdminScreen
      title="Research"
      intro="Everything on the public Research tab."
      sections={SECTIONS}
    >
      <ProfileFieldsForm
        profile={profileResult.ok ? profileResult.data : null}
        sections={PROFILE_SECTIONS}
      />
      <CvEntriesAdmin
        sections={RESEARCH_SECTIONS}
        entries={entriesResult.ok ? entriesResult.data : []}
      />
      <ResearchTable
        items={worksResult.ok ? worksResult.data : []}
        members={
          membersResult.ok
            ? membersResult.data.map(({ id, name, role }) => ({ id, name, role }))
            : []
        }
        owner={
          profileResult.ok && profileResult.data?.citationName
            ? { citationName: profileResult.data.citationName }
            : null
        }
      />
    </AdminScreen>
  );
}
