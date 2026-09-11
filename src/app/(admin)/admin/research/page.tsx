import type { Metadata } from 'next';
import { getProfileCached, ProfileFieldsForm } from '@/modules/profile';
import { getResearchService, ResearchTable } from '@/modules/research';
import { bylineSuggestions } from '@/modules/shared/ui/byline-field';
import { getTeamMemberService } from '@/modules/research-groups';
import { AdminScreen } from '../_components/admin-screen';

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Admin — Research' };
}

// Mirrors the public Research tab: the statement, then the works. Research interests belong to
// each member's profile (ADR-016).
const SECTIONS = [
  { id: 'statement', label: 'Statement' },
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
  const [profileResult, worksResult, membersResult] = await Promise.all([
    getProfileCached(),
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
      <ResearchTable
        items={worksResult.ok ? worksResult.data : []}
        suggestions={membersResult.ok ? bylineSuggestions(membersResult.data) : []}
      />
    </AdminScreen>
  );
}
