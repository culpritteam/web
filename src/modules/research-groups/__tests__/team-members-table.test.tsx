import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TeamMembersTable } from '../ui/team-members-table';
import type { MemberLink, TeamMember } from '../team-member.types';

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
  teamKind: 'research',
  isDirector: true,
  sortOrder: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const memberLink = { id: 'l1', label: 'GitHub', url: 'https://github.com/jane', sortOrder: 0 };

function renderTable(items: TeamMember[], linksByMember: Record<string, MemberLink[]> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TeamMembersTable items={items} linksByMember={linksByMember} />
    </QueryClientProvider>,
  );
}

/** The JSON body of the one request the table made. */
function sentBody() {
  const [, options] = fetchMock.mock.calls[0]!;
  return JSON.parse((options as RequestInit).body as string) as Record<string, unknown>;
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
    // The team is one select now: picking "Director" is what makes someone the director — the
    // service derives `isDirector` from it.
    await user.selectOptions(screen.getByRole('combobox', { name: /Team/ }), 'director');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/team-members',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    const [, options] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body).toMatchObject({
      name: 'Dr. Alex Kim',
      citationName: 'A. Kim',
      teamKind: 'director',
    });
    expect(body).not.toHaveProperty('researchGroupId');
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  // The update route reads an absent `links` key as "leave them alone" and `[]` as "clear them",
  // so an edit that never opened the link editor MUST NOT send the key at all.
  it('omits links from an update the admin did not touch', async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ ok: true, data: {} }) });
    const user = userEvent.setup();
    renderTable([member], { m1: [memberLink] });

    await user.click(screen.getByRole('button', { name: 'Edit: Jane Jaimunk' }));
    // The stored links are in the editor, untouched.
    expect(screen.getByLabelText('Link 1 label')).toHaveValue('GitHub');

    await user.type(screen.getByLabelText(/^Role/), ' of Privacy');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/team-members/m1',
        expect.objectContaining({ method: 'PUT' }),
      ),
    );
    expect(sentBody()).not.toHaveProperty('links');
  });

  it('sends the whole edited list, in row order, once the admin touches it', async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ ok: true, data: {} }) });
    const user = userEvent.setup();
    renderTable([member], { m1: [memberLink] });

    await user.click(screen.getByRole('button', { name: 'Edit: Jane Jaimunk' }));
    await user.click(screen.getByRole('button', { name: 'Add link' }));
    await user.type(screen.getByLabelText('Link 2 label'), 'ORCID');
    await user.type(screen.getByLabelText('Link 2 URL'), 'https://orcid.org/1');
    await user.click(screen.getByRole('button', { name: 'Move ORCID up' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sentBody().links).toEqual([
      { label: 'ORCID', url: 'https://orcid.org/1' },
      { label: 'GitHub', url: 'https://github.com/jane' },
    ]);
  });

  it('clears every link only when the admin removed them all', async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ ok: true, data: {} }) });
    const user = userEvent.setup();
    renderTable([member], { m1: [memberLink] });

    await user.click(screen.getByRole('button', { name: 'Edit: Jane Jaimunk' }));
    await user.click(screen.getByRole('button', { name: 'Remove GitHub' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sentBody().links).toEqual([]);
  });

  it('blocks a save on a bad link URL and clears the error once it is fixed', async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ ok: true, data: {} }) });
    const user = userEvent.setup();
    renderTable([member], { m1: [memberLink] });

    await user.click(screen.getByRole('button', { name: 'Edit: Jane Jaimunk' }));
    const url = screen.getByLabelText('Link 1 URL');
    await user.clear(url);
    await user.type(url, 'javascript:alert(1)');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(url).toHaveAttribute('aria-invalid', 'true'));
    expect(document.getElementById(url.getAttribute('aria-describedby')!)).toHaveTextContent(
      'Must be a valid URL.',
    );
    expect(fetchMock).not.toHaveBeenCalled();

    await user.clear(url);
    await user.type(url, 'https://github.com/jane');
    await waitFor(() => expect(url).toHaveAttribute('aria-invalid', 'false'));

    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sentBody().links).toEqual([{ label: 'GitHub', url: 'https://github.com/jane' }]);
  });
});
