import type { NextRequest } from 'next/server';
import { getProjectService, createProjectSchema, listProjectsQuerySchema } from '@/modules/projects';
import { requireAdmin } from '@/modules/auth';
import {
  apiError,
  apiUnexpected,
  apiValidationError,
  respond,
} from '@/modules/shared/lib/api-response';
import { revalidateOn } from '@/modules/shared/lib/revalidate';
import { readJsonBody } from '@/modules/shared/lib/request';

// Admin: one member's projects. Dynamic by construction (it reads a search param and a session),
// which is fine — nothing under /api/admin is cached. The public site never calls this: projects
// render inside /team/[id], which reads them through the team-member service.
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin.ok) return apiError(admin.error);

    const parsed = listProjectsQuerySchema.safeParse({
      teamMemberId: request.nextUrl.searchParams.get('teamMemberId'),
    });
    if (!parsed.success) return apiValidationError(parsed.error);

    return respond(await getProjectService().listForMember(parsed.data.teamMemberId));
  } catch (error) {
    return apiUnexpected(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin.ok) return apiError(admin.error);

    const parsed = createProjectSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) return apiValidationError(parsed.error);

    const result = await getProjectService().create(parsed.data, `admin:${admin.data.userId}`);
    return respond(revalidateOn(result, 'projects'), 201);
  } catch (error) {
    return apiUnexpected(error);
  }
}
