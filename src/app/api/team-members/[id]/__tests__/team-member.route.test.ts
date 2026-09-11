import { beforeEach, describe, expect, it, vi } from 'vitest';

const findProfile = vi.fn();

vi.mock('@/modules/research-groups', () => ({ getTeamMemberService: () => ({ findProfile }) }));

const { GET } = await import('../route');

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const MEMBER = {
  id: 'tm_1',
  name: 'Jenjira Jaimunk, PhD.',
  citationName: 'J. Jaimunk',
  role: 'Assistant Professor',
  affiliation: null,
  bio: null,
  photoUrl: null,
  linkedinUrl: null,
  googleScholarUrl: null,
  isDirector: true,
  sortOrder: -1,
  createdAt: new Date('2026-09-11T00:00:00Z'),
  updatedAt: new Date('2026-09-11T00:00:00Z'),
};

beforeEach(() => {
  findProfile.mockReset();
});

describe('GET /api/team-members/[id]', () => {
  it('returns 200 with the member, CV entries and courses, and a public-cache header', async () => {
    const { ok } = await import('@/modules/shared/lib/result');
    findProfile.mockResolvedValueOnce(ok({ member: MEMBER, cvEntries: [], courses: [] }));

    const res = await GET(new Request('https://example.com/api/team-members/tm_1'), params('tm_1'));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.member.id).toBe('tm_1');
    expect(json.data.cvEntries).toEqual([]);
    expect(json.data.courses).toEqual([]);
    expect(findProfile).toHaveBeenCalledWith('tm_1');
    expect(res.headers.get('Cache-Control')).toBe(
      'public, max-age=300, s-maxage=3600, stale-while-revalidate=300',
    );
  });

  it('returns 404 with no-store when the member does not exist', async () => {
    const { ok } = await import('@/modules/shared/lib/result');
    findProfile.mockResolvedValueOnce(ok(null));

    const res = await GET(new Request('https://example.com/api/team-members/x'), params('missing'));

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('not_found');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns 400 for an over-long id without calling the service', async () => {
    const res = await GET(
      new Request('https://example.com/api/team-members/x'),
      params('x'.repeat(201)),
    );

    expect(res.status).toBe(400);
    expect(findProfile).not.toHaveBeenCalled();
  });

  it('maps an unexpected service throw to a safe 500 envelope', async () => {
    findProfile.mockRejectedValueOnce(new Error('db unavailable'));

    const res = await GET(new Request('https://example.com/api/team-members/tm_1'), params('tm_1'));

    expect(res.status).toBe(500);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});
