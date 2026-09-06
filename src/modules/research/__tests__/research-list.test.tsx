import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResearchList } from '../ui/research-list';
import type { Research } from '../research.types';

// See the note in publications-list.test.tsx — an empty contributor list means solo work and must
// render nothing, not an empty line.

const contributor = (name: string, sortOrder: number) => ({
  id: `c${sortOrder}`,
  teamMemberId: null,
  name,
  sortOrder,
});

const research = (overrides: Partial<Research>): Research => ({
  id: 'r1',
  title: 'Adversarial Malware Sandboxing',
  summary: 'Detecting evasive samples.',
  area: 'malware analysis',
  link: null,
  contributors: [],
  sortOrder: 0,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

describe('ResearchList', () => {
  it('renders the contributors comma-joined, in the stored order', () => {
    render(
      <ResearchList
        items={[
          research({ contributors: [contributor('R. Lindqvist', 0), contributor('T. Meyer', 1)] }),
        ]}
      />,
    );

    expect(screen.getByText('With R. Lindqvist, T. Meyer')).toBeInTheDocument();
  });

  it('renders no contributor line at all when nobody is credited', () => {
    render(<ResearchList items={[research({ contributors: [] })]} />);

    expect(screen.getByText('Adversarial Malware Sandboxing')).toBeInTheDocument();
    expect(screen.queryByText(/^With /)).not.toBeInTheDocument();
  });
});
