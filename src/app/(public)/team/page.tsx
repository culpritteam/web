import type { Metadata } from 'next';
import { getProfileCached } from '@/modules/profile';
import {
  getResearchGroupService,
  getTeamMemberService,
  TeamMembersView,
} from '@/modules/research-groups';
import { EmptyState } from '@/modules/shared/ui/empty-state';
import { PageHeading } from '@/modules/shared/ui/page-heading';
import { toMetaDescription } from '../_lib/page-meta';

const FALLBACK_DESCRIPTION = 'Research groups, researchers, and visiting professors.';

export async function generateMetadata(): Promise<Metadata> {
  const result = await getProfileCached();
  return {
    title: 'Team',
    description: toMetaDescription(result.ok ? result.data?.teamIntro : null, FALLBACK_DESCRIPTION),
  };
}

export default async function TeamPage() {
  // Two complementary reads, not overlapping ones: groups arrive with their own members attached,
  // so the second call asks only for the members that belong to no group. Listing every member
  // here and filtering in memory would fetch the grouped ones a second time over the wire. The
  // third read is the request-scoped profile the layout already made, for the editable intro.
  const [groupsResult, ungroupedResult, profileResult] = await Promise.all([
    getResearchGroupService().list(),
    // `visibleOnly` keeps byline-only research collaborators off this tab. They are ungrouped
    // team_member rows that exist so a publication byline can point at one record per person.
    getTeamMemberService().list({ ungroupedOnly: true, visibleOnly: true }),
    getProfileCached(),
  ]);

  const groups = groupsResult.ok ? groupsResult.data : [];
  const ungrouped = ungroupedResult.ok ? ungroupedResult.data : [];
  const intro = profileResult.ok ? profileResult.data?.teamIntro : null;
  const hasAnyone = groups.some((group) => group.teamMembers.length > 0) || ungrouped.length > 0;

  return (
    <div>
      <PageHeading title="Team" />

      <div className="mt-12 space-y-10">
        {intro && (
          <p className="rise max-w-[62ch] text-pretty break-words font-serif text-lg leading-[1.75] text-foreground sm:text-xl">
            {intro}
          </p>
        )}

        {(!groupsResult.ok && !ungroupedResult.ok) || !hasAnyone ? (
          <EmptyState title="No team members listed yet" />
        ) : (
          // The jump list for this tab is built inside TeamMembersView rather than here: its
          // sections are the research groups themselves, so the component that renders the anchor
          // targets is the one that derives their ids. Deriving them twice — once for the nav,
          // once for the sections — is exactly the kind of duplication that drifts.
          <TeamMembersView groups={groups} ungrouped={ungrouped} />
        )}
      </div>
    </div>
  );
}
