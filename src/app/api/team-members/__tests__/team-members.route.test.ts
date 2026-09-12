import { beforeEach, describe, expect, it, vi } from 'vitest';

const list = vi.fn();

vi.mock('@/modules/research-groups', () => ({ getTeamMemberService: () => ({ list }) }));

const { GET } = await import('../route');

beforeEach(() => {
  list.mockClear();
});

describe('GET /api/team-members', () => {
  it('returns 200 with all team members and a public-cache header', async () => {
    const { ok } = await import('@/modules/shared/lib/result');
    list.mockResolvedValueOnce(
      ok([
        {
          id: 'tm_1',
          name: 'Jane Doe',
          citationName: null,
          role: 'PhD Candidate',
          affiliation: null,
          bio: null,
          photoUrl: null,
          teamKind: 'research',
          isDirector: false,
          sortOrder: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
    );

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(list).toHaveBeenCalledWith();
    expect(res.headers.get('Cache-Control')).toBe(
      'public, max-age=300, s-maxage=3600, stale-while-revalidate=300',
    );
  });

  it('maps an unexpected service throw to a safe 500 envelope with no-store', async () => {
    list.mockRejectedValueOnce(new Error('db unavailable'));

    const res = await GET();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});
