import type { Metadata } from 'next';
import { getProfileCached, ProfileFieldsForm } from '@/modules/profile';
import { AdminScreen } from '../_components/admin-screen';

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Admin — About' };
}

// Mirrors the public About tab and the site header: the lab's identity and overview. The director
// card on About comes from the member flagged Director on /admin/team, and CV lists live on each
// member's profile (ADR-016).
const SECTIONS = [
  { id: 'identity', label: 'Identity' },
  { id: 'overview', label: 'Overview' },
] as const;

const PROFILE_SECTIONS = [
  {
    id: 'identity',
    title: 'Identity',
    description: 'The name, tagline, affiliation and logo at the head of every public page.',
    fields: ['labName', 'labTagline', 'positionAffiliation', 'logoUrl'],
  },
  {
    id: 'overview',
    title: 'Overview',
    description: 'The prose on the public About tab.',
    fields: ['labOverview'],
  },
] as const;

export default async function AdminAboutPage() {
  const profileResult = await getProfileCached();

  return (
    <AdminScreen title="About" intro="Everything on the public About tab." sections={SECTIONS}>
      <ProfileFieldsForm
        profile={profileResult.ok ? profileResult.data : null}
        sections={PROFILE_SECTIONS}
      />
    </AdminScreen>
  );
}
