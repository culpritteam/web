import type { Metadata } from 'next';
import { getProfileCached, ProfileFieldsForm } from '@/modules/profile';
import { getTeamMemberService, TeamMembersTable } from '@/modules/research-groups';
import { AdminScreen } from '../_components/admin-screen';

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Admin — Team' };
}

// Mirrors the public Team tab: the intro, then the members. Each member's CV and courses are
// edited on their own page, linked from the row's "Edit profile".
const SECTIONS = [
  { id: 'intro', label: 'Introduction' },
  { id: 'members', label: 'Team members' },
] as const;

const PROFILE_SECTIONS = [
  {
    id: 'intro',
    title: 'Introduction',
    description: 'Optional prose above the member list on the public tab.',
    fields: ['teamIntro'],
  },
] as const;

export default async function AdminTeamPage() {
  const [profileResult, membersResult] = await Promise.all([
    getProfileCached(),
    getTeamMemberService().list(),
  ]);

  return (
    <AdminScreen
      title="Team"
      intro="Everything on the public Team tab."
      sections={SECTIONS}
    >
      <ProfileFieldsForm
        profile={profileResult.ok ? profileResult.data : null}
        sections={PROFILE_SECTIONS}
      />
      <TeamMembersTable items={membersResult.ok ? membersResult.data : []} />
    </AdminScreen>
  );
}
