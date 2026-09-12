import { afterEach, beforeAll, describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { TeamMember, TeamMemberProfile } from '@/modules/research-groups';

// The page reads through four module barrels, each of which also re-exports a Prisma-backed
// container. Those are replaced here with the module's real pure pieces plus a stub service, so the
// test exercises the page's own logic — team gating, byline resolution, the jump list — and never
// touches a database.

const findProfileMock = vi.fn();
const listResearchMock = vi.fn();
const listPublicationsMock = vi.fn();

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

vi.mock('@/modules/profile', async () => ({
  ProfileLinks: (await import('@/modules/profile/ui/profile-links')).ProfileLinks,
}));

vi.mock('@/modules/projects', async () => ({
  ProjectList: (await import('@/modules/projects/ui/project-list')).ProjectList,
}));

vi.mock('@/modules/research', () => ({
  getResearchService: () => ({ list: listResearchMock }),
}));

vi.mock('@/modules/publications', () => ({
  getPublicationService: () => ({ list: listPublicationsMock }),
}));

vi.mock('@/modules/research-groups', async () => {
  const view = await import('@/modules/research-groups/ui/team-members-view');
  const credited = await import('@/modules/research-groups/ui/credited-works');
  const byline = await import('@/modules/research-groups/byline-match');
  const teamKind = await import('@/modules/shared/lib/team-kind');
  return {
    memberInitials: view.memberInitials,
    CreditedWorkList: credited.CreditedWorkList,
    isMemberByline: byline.isMemberByline,
    allowsResearchAndPublications: teamKind.allowsResearchAndPublications,
    getTeamMemberService: () => ({ findProfile: findProfileMock }),
  };
});

vi.mock('@/modules/teaching', async () => {
  const types = await import('@/modules/teaching/teaching.types');
  const service = await import('@/modules/teaching/teaching.service');
  return {
    CV_SECTIONS: types.CV_SECTIONS,
    CV_SECTION_LABELS: types.CV_SECTION_LABELS,
    CvEntryList: (await import('@/modules/teaching/ui/cv-entry-list')).CvEntryList,
    CourseList: (await import('@/modules/teaching/ui/course-list')).CourseList,
    groupBySection: service.groupBySection,
    groupByLevel: service.groupByLevel,
  };
});

const member = (overrides: Partial<TeamMember> = {}): TeamMember => ({
  id: 'm1',
  name: 'Sam Rowe',
  citationName: null,
  role: 'Engineer',
  affiliation: null,
  bio: 'Builds the things.',
  photoUrl: null,
  teamKind: 'development',
  isDirector: false,
  sortOrder: 0,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

const profile = (overrides: Partial<TeamMemberProfile> = {}): TeamMemberProfile => ({
  member: member(),
  links: [{ id: 'l1', label: 'GitHub', url: 'https://github.com/sam', sortOrder: 0 }],
  cvEntries: [],
  courses: [],
  projects: [
    {
      id: 'p1',
      teamMemberId: 'm1',
      title: 'Consent ledger',
      summary: 'An append-only record of consent decisions.',
      link: 'https://example.com/ledger',
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
  ...overrides,
});

const publication = {
  id: 'pub1',
  title: 'Privacy by architecture',
  authors: [{ id: 'a1', name: 'Sam Rowe', sortOrder: 0 }],
  venue: 'PETS',
  year: 2025,
  link: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const research = {
  id: 'res1',
  title: 'Consent lifecycles',
  summary: 'How consent decays.',
  area: 'Access control',
  link: null,
  contributors: [{ id: 'c1', name: 'Sam Rowe', sortOrder: 0 }],
  sortOrder: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Imported once, not per test. The page pulls in four module barrels behind `vi.mock` factories;
// paying that in the first test's own time budget is what made this file time out at 5s when the
// full suite runs its files in parallel and everything is competing for the same CPU.
let TeamMemberPage: (props: { params: Promise<{ id: string }> }) => Promise<React.ReactElement>;

beforeAll(async () => {
  TeamMemberPage = (await import('../page')).default;
});

async function renderPage() {
  render(await TeamMemberPage({ params: Promise.resolve({ id: 'm1' }) }));
}

describe('TeamMemberPage', () => {
  // Explicit, not relying on Testing Library's auto-cleanup. Without it the previous test's tree
  // stayed mounted and `getByRole('region', { name: 'Publications' })` found two — which is exactly
  // how this file failed in the full suite while passing when run on its own.
  afterEach(cleanup);

  beforeEach(() => {
    findProfileMock.mockReset();
    listResearchMock.mockReset().mockResolvedValue({ ok: true, data: [research] });
    listPublicationsMock.mockReset().mockResolvedValue({ ok: true, data: [publication] });
  });

  it('renders a development member’s projects and links, and no credited work at all', async () => {
    findProfileMock.mockResolvedValue({ ok: true, data: profile() });
    await renderPage();

    const projects = screen.getByRole('region', { name: 'Projects' });
    expect(within(projects).getByRole('heading', { name: 'Consent ledger' })).toBeInTheDocument();
    expect(within(projects).getByRole('link', { name: /View project/ })).toHaveAttribute(
      'href',
      'https://example.com/ledger',
    );
    expect(screen.getByRole('link', { name: /GitHub/ })).toHaveAttribute(
      'href',
      'https://github.com/sam',
    );

    // The byline says "Sam Rowe" on both lists, but ADR-017 gives a development member no research
    // or publications section — a name collision must not manufacture one.
    expect(screen.queryByRole('region', { name: 'Research' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Publications' })).not.toBeInTheDocument();
    expect(screen.queryByText('Privacy by architecture')).not.toBeInTheDocument();
    // …and neither list is even read for them.
    expect(listPublicationsMock).not.toHaveBeenCalled();
    expect(listResearchMock).not.toHaveBeenCalled();
  });

  it('credits a professor with the work their byline name appears on, linked to its tab', async () => {
    findProfileMock.mockResolvedValue({
      ok: true,
      data: profile({ member: member({ teamKind: 'professor', role: 'Professor' }) }),
    });
    await renderPage();

    expect(
      within(screen.getByRole('region', { name: 'Publications' })).getByRole('link', {
        name: 'Privacy by architecture',
      }),
    ).toHaveAttribute('href', '/publications#publications-2025');
    expect(
      within(screen.getByRole('region', { name: 'Research' })).getByRole('link', {
        name: 'Consent lifecycles',
      }),
    ).toHaveAttribute('href', '/research#works');

    // The jump list lists only what is on the page, in page order.
    const nav = screen.getByRole('navigation', { name: 'On this page' });
    expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Biography',
      'Projects',
      'Research',
      'Publications',
    ]);
  });

  it('omits an empty section from the page and from the jump list', async () => {
    findProfileMock.mockResolvedValue({
      ok: true,
      data: profile({
        member: member({ teamKind: 'professor' }),
        projects: [],
        links: [],
      }),
    });
    listResearchMock.mockResolvedValue({ ok: true, data: [] });
    await renderPage();

    expect(screen.queryByRole('region', { name: 'Projects' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Research' })).not.toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'On this page' });
    expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Biography',
      'Publications',
    ]);
  });

  it('404s on an unknown member', async () => {
    findProfileMock.mockResolvedValue({ ok: true, data: null });
    const { default: TeamMemberPage } = await import('../page');
    await expect(TeamMemberPage({ params: Promise.resolve({ id: 'nope' }) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
  });
});
