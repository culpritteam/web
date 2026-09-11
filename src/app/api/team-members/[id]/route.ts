import { getTeamMemberService } from '@/modules/research-groups';
import {
  apiError,
  apiUnexpected,
  apiValidationError,
  respondPublicCache,
} from '@/modules/shared/lib/api-response';
import { NotFoundError } from '@/modules/shared/lib/errors';
import { entityId } from '@/modules/shared/lib/schema-fields';

// Public: one member's profile — the member, their CV entries and their courses. Mirrors the
// `/team/[id]` page.
//
// ISR-style route cache with a 1h ceiling. Unlike the fixed-path public routes it is not purged on
// admin writes: a template purge targets a route's `page` entry, which a route handler does not have
// (see modules/shared/lib/revalidate), so the ceiling is what bounds staleness here.
export const revalidate = 3600;

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const parsedId = entityId.safeParse(id);
    if (!parsedId.success) return apiValidationError(parsedId.error);

    const result = await getTeamMemberService().findProfile(parsedId.data);
    if (result.ok && !result.data) return apiError(new NotFoundError('Team member not found.'));
    return respondPublicCache(result, {
      browserTtl: 300,
      edgeTtl: 3600,
      staleWhileRevalidate: 300,
    });
  } catch (error) {
    return apiUnexpected(error);
  }
}
