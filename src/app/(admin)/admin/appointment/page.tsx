import type { Metadata } from 'next';
import { getProfileCached, ProfileFieldsForm } from '@/modules/profile';
import { AdminScreen } from '../_components/admin-screen';

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Admin — Appointment' };
}

// Mirrors the public Make Appointment tab. The scheduling link was previously readable only from
// NEXT_PUBLIC_CALENDLY_URL, so changing it meant a redeploy; it is a profile column now, with the
// environment variable kept as the fallback when the column is blank.
//
// Still embed-only. Nothing server-side ever calls Calendly — no PAT, no REST client, no webhook
// (ADR-011). A booking made in the widget is never recorded locally; if it should show
// on the public Events tab, it is written up there as an event.
const PROFILE_SECTIONS = [
  {
    id: 'booking',
    title: 'Booking',
    description: 'The scheduling widget embedded on the public Make Appointment tab.',
    fields: ['appointmentIntro', 'calendlyUrl'],
  },
] as const;

export default async function AdminAppointmentPage() {
  const result = await getProfileCached();

  return (
    <AdminScreen title="Appointment" intro="Everything on the public Make Appointment tab.">
      <ProfileFieldsForm profile={result.ok ? result.data : null} sections={PROFILE_SECTIONS} />
    </AdminScreen>
  );
}
