import { ValidationError } from '@/modules/shared/lib/errors';
import { TEAM_KINDS, isDirectorTeam, type TeamKind } from '@/modules/shared/lib/team-kind';

// Pure team-membership helpers: keeping `teamKind` and `isDirector` in step, and splitting a member
// list into its four teams for display. No I/O, so both are unit-tested directly.

/** The two columns that decide a member's team. Both optional — an update is partial. */
export type TeamAssignment = { teamKind?: TeamKind; isDirector?: boolean };

/**
 * The ONE place `teamKind` and `isDirector` are reconciled: the flag is true exactly when the team
 * is `director`. Setting either one sets the other, and the service applies the result inside the
 * same write that clears `isDirector` on every other member — so the partial unique index
 * `team_member_one_director` is never what says no.
 *
 * `teamKind` wins when both arrive: the team is the editorial decision, the flag is its shadow.
 *
 * @param current the member's stored team, for an update. Omitted on create.
 * @throws ValidationError when asked to clear the flag on the director without naming a new team —
 * "not the director" is not a team, and guessing one would silently move the member somewhere the
 * admin never chose.
 */
export function resolveTeamAssignment(
  input: TeamAssignment,
  current?: { teamKind: TeamKind },
): TeamAssignment {
  if (input.teamKind !== undefined) {
    return { teamKind: input.teamKind, isDirector: isDirectorTeam(input.teamKind) };
  }
  if (input.isDirector === true) {
    return { teamKind: 'director', isDirector: true };
  }
  if (input.isDirector === false && current?.teamKind === 'director') {
    throw new ValidationError('Choose a team for the former director.', {
      teamKind: ['Set a team other than "director" to remove the director flag.'],
    });
  }
  // Neither column is being changed, or the flag is being set false on someone who is not the
  // director anyway. Leave both untouched rather than rewriting a column to the value it holds.
  return {};
}

/** One team's slice of the Team tab. */
export type TeamGroup<M> = { kind: TeamKind; members: M[] };

/**
 * Splits members into the four teams, in the fixed display order director, professor, research,
 * development, preserving the order the caller passed them in within each team (the service already
 * returns director-first-then-sortOrder).
 *
 * Empty teams are dropped — a heading with nobody under it is noise on a public page, the same call
 * `groupBySection` makes for CV sections.
 */
export function groupByTeam<M extends { teamKind: TeamKind }>(members: readonly M[]): TeamGroup<M>[] {
  return TEAM_KINDS.map((kind) => ({
    kind,
    members: members.filter((member) => member.teamKind === kind),
  })).filter((group) => group.members.length > 0);
}
