import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PublicationsList } from '../ui/publications-list';
import type { Publication } from '../publication.types';

// The public byline. A name matching a lab member (by name or citation name) links to their profile
// in the accent colour; an outside author stays grey text. An empty list is the lab's own work and
// renders nothing at all.

const author = (name: string, sortOrder: number) => ({ id: `a${sortOrder}`, name, sortOrder });

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

const members = [{ id: 'm1', name: 'Jutarat Jaimunk', citationName: 'J. Jaimunk' }];

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

    expect(screen.getByText('A. Osei').closest('p')).toHaveTextContent(
      'A. Osei, R. Lindqvist, T. Meyer',
    );
  });

  it('links a matched member to their profile and leaves outside authors grey', () => {
    render(
      <PublicationsList
        members={members}
        items={[publication({ authors: [author(' j. jaimunk ', 0), author('M. Fernandez', 1)] })]}
      />,
    );

    const link = screen.getByRole('link', { name: /j\. jaimunk/i });
    expect(link).toHaveAttribute('href', '/team/m1');
    expect(link).toHaveClass('text-accent', 'hover:underline', 'focus-visible:underline');

    const outside = screen.getByText('M. Fernandez');
    expect(outside.closest('a')).toBeNull();
    expect(outside).toHaveClass('text-muted-foreground');
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('renders no byline at all when nobody is credited', () => {
    const { container } = render(<PublicationsList items={[publication({ authors: [] })]} />);

    expect(screen.getByText('Evasive Malware Detection')).toBeInTheDocument();
    const paragraphs = [...container.querySelectorAll('p')].map((p) => p.textContent);
    expect(paragraphs).toEqual(['USENIX Security']);
  });
});
