import type { NextRequest } from 'next/server';
import { getCvEntryService, createCvEntrySchema } from '@/modules/teaching';
import { requireAdmin } from '@/modules/auth';
import {
  apiError,
  apiUnexpected,
  apiValidationError,
  respond,
} from '@/modules/shared/lib/api-response';
import { revalidateOn } from '@/modules/shared/lib/revalidate';
import { readJsonBody } from '@/modules/shared/lib/request';

// Admin: add a CV entry to one team member's profile (`teamMemberId` in the body).
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin.ok) return apiError(admin.error);

    const parsed = createCvEntrySchema.safeParse(await readJsonBody(request));
    if (!parsed.success) return apiValidationError(parsed.error);

    const result = await getCvEntryService().create(parsed.data, `admin:${admin.data.userId}`);
    return respond(revalidateOn(result, 'teaching'), 201);
  } catch (error) {
    return apiUnexpected(error);
  }
}
