import type { Metadata } from 'next';
import { getProfileCached } from '@/modules/profile';
import { getTeamMemberService, TeamMembersView } from '@/modules/research-groups';
import { EmptyState } from '@/modules/shared/ui/empty-state';
import { PageHeading } from '@/modules/shared/ui/page-heading';
import { toMetaDescription } from '../_lib/page-meta';

const FALLBACK_DESCRIPTION = 'The people of the lab: director, researchers, and students.';

export async function generateMetadata(): Promise<Metadata> {
  const result = await getProfileCached();
  return {
    title: 'Team',
    description: toMetaDescription(result.ok ? result.data?.teamIntro : null, FALLBACK_DESCRIPTION),
  };
}

export default async function TeamPage() {
  const [membersResult, profileResult] = await Promise.all([
    getTeamMemberService().list(),
    getProfileCached(),
  ]);

  const members = membersResult.ok ? membersResult.data : [];
  const intro = profileResult.ok ? profileResult.data?.teamIntro : null;

  return (
    <div>
      <PageHeading title="Team" />

      <div className="mt-12 space-y-10">
        {intro && (
          <p className="rise max-w-[62ch] text-pretty break-words font-serif text-lg leading-[1.75] text-foreground sm:text-xl">
            {intro}
          </p>
        )}

        {members.length === 0 ? (
          <EmptyState title="No team members listed yet" />
        ) : (
          <TeamMembersView members={members} />
        )}
      </div>
    </div>
  );
}
