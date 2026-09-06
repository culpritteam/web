import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ResearchTable } from '../ui/research-table';
import type { Research } from '../research.types';

const refreshMock = vi.fn();
const fetchMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderTable(items: Research[]) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ResearchTable items={items} />
    </QueryClientProvider>,
  );
}

const existing: Research = {
  id: 'r1',
  title: 'Malware analysis at scale',
  summary: 'Existing summary',
  area: 'malware analysis',
  link: null,
  contributors: [],
  sortOrder: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('ResearchTable', () => {
  beforeEach(() => {
    refreshMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('shows the empty state when there are no research works', () => {
    renderTable([]);
    expect(screen.getByText('No research works yet.')).toBeInTheDocument();
  });

  it('creates a new research work via the Add dialog (POST)', async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ ok: true, data: existing }) });
    const user = userEvent.setup();
    renderTable([]);

    await user.click(screen.getByRole('button', { name: 'Add research work' }));
    await user.type(screen.getByLabelText('Title', { exact: false }), 'New work');
    await user.type(screen.getByLabelText('Area', { exact: false }), 'crypto');
    await user.type(screen.getByLabelText('Summary', { exact: false }), 'A summary');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/research',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it('edits an existing research work via the Edit dialog (PUT)', async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ ok: true, data: existing }) });
    const user = userEvent.setup();
    renderTable([existing]);

    await user.click(screen.getByRole('button', { name: /Edit/ }));
    const titleInput = screen.getByLabelText('Title', { exact: false });
    await user.clear(titleInput);
    await user.type(titleInput, 'Updated title');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/research/r1',
        expect.objectContaining({ method: 'PUT' }),
      ),
    );
  });

  it('deletes a research work after confirming the destructive dialog', async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ ok: true, data: null }) });
    const user = userEvent.setup();
    renderTable([existing]);

    await user.click(screen.getByRole('button', { name: /Delete/ }));
    const dialog = screen.getByRole('dialog', { name: 'Delete this item?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/research/r1',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });
});
