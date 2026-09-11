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
  linkedinUrl: null,
  googleScholarUrl: null,
  isDirector: false,
  sortOrder: 0,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

describe('TeamMembersView', () => {
  it('links every card to its profile and labels only the director', () => {
    render(
      <TeamMembersView
        members={[
          member({ id: 'd1', name: 'Jutarat Jaimunk', role: 'Professor', isDirector: true }),
          member({}),
        ]}
      />,
    );

    const [director, student] = screen.getAllByRole('link');
    expect(director).toHaveAttribute('href', '/team/d1');
    expect(within(director!).getByText('Director')).toBeInTheDocument();
    expect(student).toHaveAttribute('href', '/team/m1');
    expect(within(student!).queryByText('Director')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Portrait of Kai Tanaka' })).toHaveTextContent('KT');
  });
});
