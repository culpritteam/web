import type { Metadata } from 'next';
import { getProfileCached, ProfileFieldsForm } from '@/modules/profile';
import { getPublicationService, PublicationsTable } from '@/modules/publications';
import { getTeamMemberService } from '@/modules/research-groups';
import { AdminScreen } from '../_components/admin-screen';

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Admin — Publications' };
}

const PROFILE_SECTIONS = [
  {
    id: 'intro',
    title: 'Introduction',
    description: 'Optional prose above the publication list on the public tab.',
    fields: ['publicationsIntro'],
  },
] as const;

export default async function AdminPublicationsPage() {
  const [profileResult, result, membersResult] = await Promise.all([
    getProfileCached(),
    getPublicationService().list(),
    getTeamMemberService().list(),
  ]);

  return (
    <AdminScreen title="Publications" intro="Everything on the public Publications tab.">
      <ProfileFieldsForm
        profile={profileResult.ok ? profileResult.data : null}
        sections={PROFILE_SECTIONS}
      />
      <PublicationsTable
        items={result.ok ? result.data : []}
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
