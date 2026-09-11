import { redirect } from 'next/navigation';
import { getTeamMemberService } from '@/modules/research-groups';

// The Teaching tab was folded into member profiles (ADR-016). Old links land on the director's
// profile, where her courses now live — or on the Team tab when no director is set.
export default async function TeachingPage() {
  const result = await getTeamMemberService().list();
  const director = result.ok ? result.data.find((member) => member.isDirector) : undefined;
  redirect(director ? `/team/${director.id}` : '/team');
}
