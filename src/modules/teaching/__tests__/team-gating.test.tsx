import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CoursesAdmin } from '../ui/courses-admin';
import { CvEntriesAdmin } from '../ui/cv-entries-admin';
import type { Course, CvEntry } from '../teaching.types';

// ADR-017: a team that cannot teach must not be offered "Add course" — the server answers 400, and
// the admin should never be able to click into a form whose only outcome is a rejection. Rows
// written before the member changed team are NOT hidden: they stay visible and deletable.

const refreshMock = vi.fn();
const fetchMock = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const course: Course = {
  id: 'c1',
  teamMemberId: 'm1',
  code: 'CS 4235',
  title: 'Introduction to Information Security',
  level: 'Undergraduate',
  term: 'Fall 2025',
  description: null,
  link: null,
  sortOrder: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const entry: CvEntry = {
  id: 'e1',
  teamMemberId: 'm1',
  section: 'education',
  title: 'PhD, Computer Science',
  subtitle: null,
  description: null,
  year: '2019',
  sortOrder: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('CoursesAdmin team gating', () => {
  beforeEach(() => {
    refreshMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('renders nothing for a team that cannot teach and has no courses', () => {
    const { container } = renderWithQuery(
      <CoursesAdmin teamMemberId="m1" courses={[]} allowed={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('keeps orphaned courses visible and deletable, without offering Add or Edit', async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ ok: true, data: {} }) });
    const user = userEvent.setup();
    renderWithQuery(<CoursesAdmin teamMemberId="m1" courses={[course]} allowed={false} />);

    expect(screen.getByText('Introduction to Information Security')).toBeInTheDocument();
    expect(screen.getByText(/This team does not teach/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add course' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Edit course/ }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', {
        name: 'Delete course: Introduction to Information Security',
      }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/teaching/courses/c1',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
  });

  it('offers Add and Edit for a team that teaches', () => {
    renderWithQuery(<CoursesAdmin teamMemberId="m1" courses={[course]} />);
    expect(screen.getByRole('button', { name: 'Add course' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Edit course: Introduction to Information Security' }),
    ).toBeInTheDocument();
  });
});

describe('CvEntriesAdmin team gating', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('edits only the sections the team allows and shows the rest read-only-ish', () => {
    renderWithQuery(
      <CvEntriesAdmin
        teamMemberId="m1"
        sections={['research_interest']}
        retiredSections={['education']}
        entries={[entry]}
      />,
    );

    // The allowed list is fully editable…
    expect(screen.getByRole('button', { name: 'Add research interest' })).toBeInTheDocument();
    // …the retired one keeps its rows and its Delete, and loses Add and Edit.
    expect(screen.getByText('PhD, Computer Science')).toBeInTheDocument();
    expect(screen.getByText(/This team does not use this list/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add education entry' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Edit entry/ })).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Delete entry: PhD, Computer Science' }),
    ).toBeInTheDocument();
  });

  it('does not render a retired section that holds nothing', () => {
    renderWithQuery(
      <CvEntriesAdmin
        teamMemberId="m1"
        sections={['research_interest']}
        retiredSections={['education']}
        entries={[]}
      />,
    );
    expect(screen.queryByRole('heading', { name: /Education/ })).not.toBeInTheDocument();
  });
});
