import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const create = vi.fn();
const requireAdmin = vi.fn();

vi.mock('@/modules/research', async () => {
  const schema = await import('@/modules/research/research.schema');
  return { ...schema, getResearchService: () => ({ create }) };
});
vi.mock('@/modules/auth', () => ({ requireAdmin: () => requireAdmin() }));

const { POST } = await import('../route');

function makeRequest(body: unknown) {
  return new NextRequest('https://example.com/api/admin/research', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/research', () => {
  it('returns 401 when the caller is not an admin', async () => {
    const { UnauthorizedError } = await import('@/modules/shared/lib/errors');
    requireAdmin.mockResolvedValueOnce({ ok: false, error: new UnauthorizedError() });

    const res = await POST(makeRequest({ title: 'X', summary: 'Y', area: 'Z' }));
    expect(res.status).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid body', async () => {
    requireAdmin.mockResolvedValueOnce({
      ok: true,
      data: { userId: 'u1', email: 'admin@example.com' },
    });

    const res = await POST(makeRequest({ title: '' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('validation_error');
    expect(create).not.toHaveBeenCalled();
  });

  it('returns 201 and the created record on success', async () => {
    requireAdmin.mockResolvedValueOnce({
      ok: true,
      data: { userId: 'u1', email: 'admin@example.com' },
    });
    const { ok } = await import('@/modules/shared/lib/result');
    create.mockResolvedValueOnce(
      ok({
        id: 'res_1',
        title: 'Malware Analysis',
        summary: 'Summary',
        area: 'security',
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    const res = await POST(
      makeRequest({ title: 'Malware Analysis', summary: 'Summary', area: 'security' }),
    );
    expect(res.status).toBe(201);
    expect(create).toHaveBeenCalledWith(
      // `contributors` defaults to an empty list — the schema fills it in, which is how a solo
      // research item is expressed.
      { title: 'Malware Analysis', summary: 'Summary', area: 'security', contributors: [] },
      'admin:u1',
    );
  });
});
