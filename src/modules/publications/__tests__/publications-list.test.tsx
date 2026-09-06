import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PublicationsList } from '../ui/publications-list';
import type { Publication } from '../publication.types';

// The public byline. Both cases here are load-bearing: attribution is stored as rows, so an empty
// list is not missing data — it is how the site says "this is the professor's own work", and it
// must render nothing at all rather than an empty line or a placeholder.

const author = (name: string, sortOrder: number) => ({
  id: `a${sortOrder}`,
  teamMemberId: null,
  name,
  sortOrder,
});

const publication = (overrides: Partial<Publication>): Publication => ({
  id: 'p1',
  title: 'Evasive Malware Detection',
  authors: [],
  venue: 'USENIX Security',
  year: 2024,
  link: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

describe('PublicationsList', () => {
  it('renders the authors comma-joined, in the stored order', () => {
    render(
      <PublicationsList
        items={[
          publication({
            authors: [author('A. Osei', 0), author('R. Lindqvist', 1), author('T. Meyer', 2)],
          }),
        ]}
      />,
    );

    expect(screen.getByText('A. Osei, R. Lindqvist, T. Meyer')).toBeInTheDocument();
  });

  it('renders no byline at all when nobody is credited', () => {
    const { container } = render(<PublicationsList items={[publication({ authors: [] })]} />);

    expect(screen.getByText('Evasive Malware Detection')).toBeInTheDocument();
    // The venue is the only <p> that survives — no empty byline element is left behind.
    const paragraphs = [...container.querySelectorAll('p')].map((p) => p.textContent);
    expect(paragraphs).toEqual(['USENIX Security']);
  });
});
