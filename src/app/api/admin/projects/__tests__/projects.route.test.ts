import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const create = vi.fn();
const listForMember = vi.fn();
const requireAdmin = vi.fn();

vi.mock('@/modules/projects', async () => {
  const schema = await import('@/modules/projects/project.schema');
  return { ...schema, getProjectService: () => ({ create, listForMember }) };
});
vi.mock('@/modules/auth', () => ({ requireAdmin: () => requireAdmin() }));

const { GET, POST } = await import('../route');

const ADMIN = { ok: true, data: { userId: 'u1', email: 'admin@example.com' } };
const VALID = { teamMemberId: 'mem_1', title: 'Lab website', summary: 'The site.' };

function postRequest(body: unknown) {
  return new NextRequest('https://example.com/api/admin/projects', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const getRequest = (query = '') =>
  new NextRequest(`https://example.com/api/admin/projects${query}`);

describe('POST /api/admin/projects', () => {
  it('returns 401 when the caller is not an admin', async () => {
    const { UnauthorizedError } = await import('@/modules/shared/lib/errors');
    requireAdmin.mockResolvedValueOnce({ ok: false, error: new UnauthorizedError() });

    const res = await POST(postRequest(VALID));

    expect(res.status).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid body', async () => {
    requireAdmin.mockResolvedValueOnce(ADMIN);

    const res = await POST(postRequest({ title: '' }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('validation_error');
    expect(create).not.toHaveBeenCalled();
  });

  it('returns 201 and the created record on success', async () => {
    requireAdmin.mockResolvedValueOnce(ADMIN);
    const { ok } = await import('@/modules/shared/lib/result');
    create.mockResolvedValueOnce(
      ok({ id: 'proj_1', ...VALID, link: null, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() }),
    );

    const res = await POST(postRequest(VALID));

    expect(res.status).toBe(201);
    expect(create).toHaveBeenCalledWith(VALID, 'admin:u1');
    const json = await res.json();
    expect(json.data.id).toBe('proj_1');
  });
});

describe('GET /api/admin/projects', () => {
  it('returns 401 when the caller is not an admin', async () => {
    const { UnauthorizedError } = await import('@/modules/shared/lib/errors');
    requireAdmin.mockResolvedValueOnce({ ok: false, error: new UnauthorizedError() });

    const res = await GET(getRequest('?teamMemberId=mem_1'));

    expect(res.status).toBe(401);
    expect(listForMember).not.toHaveBeenCalled();
  });

  it('returns 400 without a member id', async () => {
    requireAdmin.mockResolvedValueOnce(ADMIN);

    const res = await GET(getRequest());

    expect(res.status).toBe(400);
    expect(listForMember).not.toHaveBeenCalled();
  });

  it("returns the member's projects", async () => {
    requireAdmin.mockResolvedValueOnce(ADMIN);
    const { ok } = await import('@/modules/shared/lib/result');
    listForMember.mockResolvedValueOnce(ok([{ id: 'proj_1' }]));

    const res = await GET(getRequest('?teamMemberId=mem_1'));

    expect(res.status).toBe(200);
    expect(listForMember).toHaveBeenCalledWith('mem_1');
    const json = await res.json();
    expect(json.data).toEqual([{ id: 'proj_1' }]);
  });
});
