import type { NextRequest } from 'next/server';
import { getProjectService, updateProjectSchema } from '@/modules/projects';
import { requireAdmin } from '@/modules/auth';
import {
  apiError,
  apiUnexpected,
  apiValidationError,
  respond,
} from '@/modules/shared/lib/api-response';
import { entityId } from '@/modules/shared/lib/schema-fields';
import { revalidateOn } from '@/modules/shared/lib/revalidate';
import { readJsonBody } from '@/modules/shared/lib/request';

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    if (!admin.ok) return apiError(admin.error);

    const { id } = await ctx.params;
    const parsedId = entityId.safeParse(id);
    if (!parsedId.success) return apiValidationError(parsedId.error);

    const parsed = updateProjectSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) return apiValidationError(parsed.error);

    const result = await getProjectService().update(
      parsedId.data,
      parsed.data,
      `admin:${admin.data.userId}`,
    );
    return respond(revalidateOn(result, 'projects'));
  } catch (error) {
    return apiUnexpected(error);
  }
}

// Admin: delete a project. Audited (full before-state) inside the delete transaction.
export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    if (!admin.ok) return apiError(admin.error);

    const { id } = await ctx.params;
    const parsedId = entityId.safeParse(id);
    if (!parsedId.success) return apiValidationError(parsedId.error);

    const result = await getProjectService().remove(parsedId.data, `admin:${admin.data.userId}`);
    return respond(revalidateOn(result, 'projects'));
  } catch (error) {
    return apiUnexpected(error);
  }
}
