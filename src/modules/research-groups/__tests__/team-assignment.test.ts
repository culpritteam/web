import { describe, expect, it } from 'vitest';
import { groupByTeam, resolveTeamAssignment } from '../team-assignment';
import type { TeamKind } from '@/modules/shared/lib/team-kind';

// Pure rules, no I/O: `isDirector` is the shadow of `teamKind`, and the Team tab's four groups are
// a fixed display order.

describe('resolveTeamAssignment', () => {
  it.each([
    ['director', true],
    ['professor', false],
    ['research', false],
    ['development', false],
  ] as const)('sets isDirector from teamKind %s', (teamKind, isDirector) => {
    expect(resolveTeamAssignment({ teamKind })).toEqual({ teamKind, isDirector });
  });

  it('sets the team from the legacy isDirector flag', () => {
    expect(resolveTeamAssignment({ isDirector: true })).toEqual({
      teamKind: 'director',
      isDirector: true,
    });
  });

  it('lets teamKind win when both arrive and disagree', () => {
    expect(resolveTeamAssignment({ teamKind: 'research', isDirector: true })).toEqual({
      teamKind: 'research',
      isDirector: false,
    });
  });

  it('touches neither column when the input mentions neither', () => {
    expect(resolveTeamAssignment({}, { teamKind: 'director' })).toEqual({});
  });

  it('ignores isDirector:false for someone who is not the director', () => {
    expect(resolveTeamAssignment({ isDirector: false }, { teamKind: 'research' })).toEqual({});
  });

  it('rejects unsetting the flag on the director without naming a new team', () => {
    // "Not the director" is not a team; guessing one would move the member somewhere the admin
    // never chose.
    expect(() => resolveTeamAssignment({ isDirector: false }, { teamKind: 'director' })).toThrow(
      /team/i,
    );
  });
});

describe('groupByTeam', () => {
  const member = (id: string, teamKind: TeamKind) => ({ id, teamKind });

  it('returns the four teams in the fixed display order, whatever order rows arrived in', () => {
    const groups = groupByTeam([
      member('dev', 'development'),
      member('res', 'research'),
      member('dir', 'director'),
      member('prof', 'professor'),
    ]);

    expect(groups.map((group) => group.kind)).toEqual([
      'director',
      'professor',
      'research',
      'development',
    ]);
  });

  it('keeps the order members were passed in within a team', () => {
    const groups = groupByTeam([
      member('a', 'research'),
      member('b', 'research'),
      member('c', 'research'),
    ]);

    expect(groups[0]!.members.map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('drops empty teams so no heading renders with nobody under it', () => {
    const groups = groupByTeam([member('dir', 'director')]);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.kind).toBe('director');
    expect(groupByTeam([])).toEqual([]);
  });
});
