import { getTeamMemberService } from '@/modules/research-groups';
import { apiError, apiUnexpected, respondPublicCache } from '@/modules/shared/lib/api-response';
import { NotFoundError } from '@/modules/shared/lib/errors';

// Public: the director's profile — member, CV entries and courses — the same payload as
// `/api/team-members/{id}` for her. Teaching stopped being a tab of its own in ADR-016 (the
// `/teaching` page redirects to her profile); this route follows it rather than disappearing, so
// existing consumers of the URL keep getting her teaching content.
//
// ISR-style route cache: purged by `revalidatePath('/api/teaching')` on CV/course writes (see
// modules/shared/lib/revalidate). The 1h figure is a safety-net ceiling only.
export const revalidate = 3600;

export async function GET() {
  try {
    const result = await getTeamMemberService().findDirectorProfile();
    if (result.ok && !result.data) return apiError(new NotFoundError('No director is set.'));
    return respondPublicCache(result, {
      browserTtl: 300,
      edgeTtl: 3600,
      staleWhileRevalidate: 300,
    });
  } catch (error) {
    return apiUnexpected(error);
  }
}
