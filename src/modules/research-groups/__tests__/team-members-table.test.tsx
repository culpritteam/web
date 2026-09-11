import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TeamMembersTable } from '../ui/team-members-table';
import type { TeamMember } from '../team-member.types';

const refreshMock = vi.fn();
const fetchMock = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const member: TeamMember = {
  id: 'm1',
  name: 'Jane Jaimunk',
  citationName: 'J. Jaimunk',
  role: 'Professor',
  affiliation: null,
  bio: null,
  photoUrl: null,
  linkedinUrl: null,
  googleScholarUrl: null,
  isDirector: true,
  sortOrder: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function renderTable(items: TeamMember[]) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TeamMembersTable items={items} />
    </QueryClientProvider>,
  );
}

describe('TeamMembersTable', () => {
  beforeEach(() => {
    refreshMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('shows the empty state when there are no team members', () => {
    renderTable([]);
    expect(screen.getByText('No team members yet.')).toBeInTheDocument();
  });

  it('labels the director and links each row to its profile editor', () => {
    renderTable([member]);
    const row = screen.getByRole('row', { name: /Jane Jaimunk/ });
    expect(within(row).getByText('Director')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit profile: Jane Jaimunk' })).toHaveAttribute(
      'href',
      '/admin/team/m1',
    );
  });

  it('creates a director with a name on papers (POST)', async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ ok: true, data: {} }) });
    const user = userEvent.setup();
    renderTable([]);

    await user.click(screen.getByRole('button', { name: 'Add team member' }));
    // Anchored and excluding "Name on papers", which a bare /^Name/ also matches.
    await user.type(screen.getByLabelText(/^Name(?! on papers)/), 'Dr. Alex Kim');
    await user.type(screen.getByLabelText(/^Name on papers/), 'A. Kim');
    await user.type(screen.getByLabelText(/^Role/), 'Postdoc');
    await user.click(screen.getByRole('checkbox', { name: /Director/ }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/team-members',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    const [, options] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body).toMatchObject({ name: 'Dr. Alex Kim', citationName: 'A. Kim', isDirector: true });
    expect(body).not.toHaveProperty('researchGroupId');
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });
});
