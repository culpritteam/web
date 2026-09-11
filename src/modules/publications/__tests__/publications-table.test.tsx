import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PublicationsTable } from '../ui/publications-table';
import type { Publication } from '../publication.types';

const refreshMock = vi.fn();
const fetchMock = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderTable(items: Publication[]) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PublicationsTable items={items} />
    </QueryClientProvider>,
  );
}

describe('PublicationsTable', () => {
  beforeEach(() => {
    refreshMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('shows the empty state when there are no publications', () => {
    renderTable([]);
    expect(screen.getByText('No publications yet.')).toBeInTheDocument();
  });

  it('creates a publication via the Add dialog (POST)', async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ ok: true, data: {} }) });
    const user = userEvent.setup();
    renderTable([]);

    await user.click(screen.getByRole('button', { name: 'Add publication' }));
    await user.type(screen.getByLabelText('Title', { exact: false }), 'A paper');
    // Authors is an ordered list of typed names, added one at a time.
    await user.type(screen.getByLabelText('Add a name'), 'A. Author');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.type(screen.getByLabelText('Venue', { exact: false }), 'USENIX');
    await user.type(screen.getByLabelText('Link', { exact: false }), 'https://example.com/paper');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/publications',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });
});
