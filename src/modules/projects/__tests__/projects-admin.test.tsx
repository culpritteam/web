import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProjectsAdmin } from '../ui/projects-admin';
import type { Project } from '../project.types';

const refreshMock = vi.fn();
const fetchMock = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const project: Project = {
  id: 'p1',
  teamMemberId: 'm1',
  title: 'Consent ledger',
  summary: 'An append-only record of consent decisions.',
  link: 'https://example.com/ledger',
  sortOrder: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function renderAdmin(projects: Project[]) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProjectsAdmin teamMemberId="m1" projects={projects} />
    </QueryClientProvider>,
  );
}

function sentBody() {
  const [, options] = fetchMock.mock.calls[0]!;
  return JSON.parse((options as RequestInit).body as string) as Record<string, unknown>;
}

describe('ProjectsAdmin', () => {
  beforeEach(() => {
    refreshMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('shows the empty state when the member has no projects', () => {
    renderAdmin([]);
    expect(screen.getByText('No projects yet.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('creates a project for the member (POST)', async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ ok: true, data: {} }) });
    const user = userEvent.setup();
    renderAdmin([]);

    await user.click(screen.getByRole('button', { name: 'Add project' }));
    await user.type(screen.getByLabelText(/^Title/), 'Consent ledger');
    await user.type(screen.getByLabelText(/^Summary/), 'An append-only record.');
    await user.type(screen.getByLabelText(/^Project link/), 'https://example.com/ledger');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/projects',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    expect(sentBody()).toMatchObject({
      teamMemberId: 'm1',
      title: 'Consent ledger',
      summary: 'An append-only record.',
      link: 'https://example.com/ledger',
    });
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it('edits a project without re-sending its owner (PUT)', async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ ok: true, data: {} }) });
    const user = userEvent.setup();
    renderAdmin([project]);

    await user.click(screen.getByRole('button', { name: 'Edit project: Consent ledger' }));
    const title = screen.getByLabelText(/^Title/);
    await user.clear(title);
    await user.type(title, 'Consent ledger v2');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/projects/p1',
        expect.objectContaining({ method: 'PUT' }),
      ),
    );
    const body = sentBody();
    expect(body.title).toBe('Consent ledger v2');
    // The owner is fixed at creation, and the update schema has no `teamMemberId`.
    expect(body).not.toHaveProperty('teamMemberId');
  });

  it('refuses to save an invalid link, naming the field in error', async () => {
    const user = userEvent.setup();
    renderAdmin([]);

    await user.click(screen.getByRole('button', { name: 'Add project' }));
    await user.type(screen.getByLabelText(/^Title/), 'Consent ledger');
    await user.type(screen.getByLabelText(/^Summary/), 'An append-only record.');
    await user.type(screen.getByLabelText(/^Project link/), 'javascript:alert(1)');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    const link = await screen.findByLabelText(/^Project link/);
    await waitFor(() => expect(link).toHaveAttribute('aria-invalid', 'true'));
    expect(screen.getByRole('alert')).toHaveTextContent('Must be a valid URL.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('confirms before deleting, then calls DELETE', async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ ok: true, data: {} }) });
    const user = userEvent.setup();
    renderAdmin([project]);

    await user.click(screen.getByRole('button', { name: 'Delete project: Consent ledger' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Delete this project?')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/projects/p1',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
  });
});
