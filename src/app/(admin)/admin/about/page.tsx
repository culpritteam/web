import type { Metadata } from 'next';
import { getProfileCached, ProfileFieldsForm } from '@/modules/profile';
import { ABOUT_SECTIONS, CvEntriesAdmin, getCvEntryService } from '@/modules/teaching';
import { AdminScreen } from '../_components/admin-screen';

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Admin — About' };
}

// Mirrors the public About tab. Everything that tab renders is edited here and nowhere else:
// the masthead identity, the lead prose, the two profile links, and the four CV lists.
//
// Before the IA change this was split across /admin/profile (identity + prose) and
// /admin/teaching (which owned all seven CV sections, four of them belonging to this tab), so
// filling in an About page meant two screens and knowing which one held what.
const SECTIONS = [
  { id: 'identity', label: 'Identity' },
  { id: 'prose', label: 'Written profile' },
  { id: 'links', label: 'External profiles' },
  { id: 'cv-education', label: 'Education' },
  { id: 'cv-fellowship', label: 'Fellowships' },
  { id: 'cv-scholarship', label: 'Scholarships' },
  { id: 'cv-invited_talk', label: 'Invited talks' },
] as const;

const PROFILE_SECTIONS = [
  {
    id: 'identity',
    title: 'Identity',
    description: 'The name, title and portrait at the head of every public page.',
    fields: ['fullName', 'citationName', 'title', 'photoUrl'],
  },
  {
    id: 'prose',
    title: 'Written profile',
    description: 'The prose on the public About tab, in the order it appears there.',
    fields: ['positionAffiliation', 'bio'],
  },
  {
    id: 'links',
    title: 'External profiles',
    description: 'Optional. Shown as links directly under the bio.',
    fields: ['linkedinUrl', 'googleScholarUrl'],
  },
] as const;

export default async function AdminAboutPage() {
  const [profileResult, entriesResult] = await Promise.all([
    getProfileCached(),
    getCvEntryService().listBySections(ABOUT_SECTIONS),
  ]);

  return (
    <AdminScreen title="About" intro="Everything on the public About tab." sections={SECTIONS}>
      <ProfileFieldsForm
        profile={profileResult.ok ? profileResult.data : null}
        sections={PROFILE_SECTIONS}
      />
      <CvEntriesAdmin
        sections={ABOUT_SECTIONS}
        entries={entriesResult.ok ? entriesResult.data : []}
      />
    </AdminScreen>
  );
}
