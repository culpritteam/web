import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { TeamMembersView } from '../ui/team-members-view';
import type { TeamMember } from '../team-member.types';

const member = (overrides: Partial<TeamMember>): TeamMember => ({
  id: 'm1',
  name: 'Kai Tanaka',
  citationName: null,
  role: 'PhD student',
  affiliation: null,
  bio: null,
  photoUrl: null,
  teamKind: 'research',
  isDirector: false,
  sortOrder: 0,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

const everyTeam = [
  member({ id: 'd1', name: 'Jutarat Jaimunk', role: 'Professor', teamKind: 'director', isDirector: true }),
  member({ id: 'p1', name: 'Ana Ferreira', role: 'Professor', teamKind: 'professor' }),
  member({ id: 'r1', name: 'Kai Tanaka' }),
  member({ id: 'e1', name: 'Sam Rowe', role: 'Engineer', teamKind: 'development' }),
];

describe('TeamMembersView', () => {
  it('renders one labelled section per team, in the fixed display order', () => {
    // Deliberately out of order: the display order is the component's, not the caller's.
    render(<TeamMembersView members={[everyTeam[3]!, everyTeam[2]!, everyTeam[1]!, everyTeam[0]!]} />);

    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Director',
      'Professors',
      'Research Team',
      'Development Team',
    ]);
    // Each grid is named by its heading, so the teams survive being read region by region.
    expect(screen.getAllByRole('list', { name: 'Research Team' })).toHaveLength(1);
    expect(
      within(screen.getByRole('list', { name: 'Development Team' })).getByRole('link'),
    ).toHaveAttribute('href', '/team/e1');
  });

  it('drops teams with nobody in them', () => {
    render(<TeamMembersView members={[everyTeam[0]!, everyTeam[3]!]} />);

    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Director',
      'Development Team',
    ]);
    expect(screen.queryByRole('heading', { name: 'Professors' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Research Team' })).not.toBeInTheDocument();
  });

  it('links every card to its profile and no longer repeats "Director" on the card', () => {
    render(<TeamMembersView members={everyTeam} />);

    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/team/d1',
      '/team/p1',
      '/team/r1',
      '/team/e1',
    ]);
    // The section heading above the card says it; the card repeating it was redundant.
    expect(within(links[0]!).queryByText('Director')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Portrait of Kai Tanaka' })).toHaveTextContent('KT');
  });
});
