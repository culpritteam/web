import { describe, expect, it } from 'vitest';
import { isMemberByline, matchMember } from '../byline-match';

const MEMBERS = [
  { id: 'dir', name: 'Jenjira Jaimunk, PhD.', citationName: 'J. Jaimunk' },
  { id: 'wyco', name: 'Win Moe Aung', citationName: null },
];

describe('matchMember', () => {
  it('matches a citation name', () => {
    expect(matchMember('J. Jaimunk', MEMBERS)?.id).toBe('dir');
  });

  it('matches a full name', () => {
    expect(matchMember('Win Moe Aung', MEMBERS)?.id).toBe('wyco');
  });

  it('ignores case and surrounding whitespace', () => {
    expect(matchMember('  j. JAIMUNK ', MEMBERS)?.id).toBe('dir');
  });

  it('returns null for an outside author', () => {
    expect(matchMember('M. Fernandez', MEMBERS)).toBeNull();
  });

  it('does not match on a partial name', () => {
    expect(matchMember('Jaimunk', MEMBERS)).toBeNull();
  });

  it('never matches a member without a citation name through a blank byline', () => {
    expect(matchMember('   ', MEMBERS)).toBeNull();
  });
});

// The per-member half of the same rule. A member's profile page uses it to pick out the research
// items and publications they are credited on, at render time — bylines store no member link
// (ADR-016), and none is added.
describe('isMemberByline', () => {
  const [director, other] = MEMBERS as [(typeof MEMBERS)[number], (typeof MEMBERS)[number]];

  it('credits a member by either of their names, ignoring case and whitespace', () => {
    expect(isMemberByline(director, 'Jenjira Jaimunk, PhD.')).toBe(true);
    expect(isMemberByline(director, '  j. JAIMUNK ')).toBe(true);
  });

  it('does not credit another member or an outside author', () => {
    expect(isMemberByline(other, 'J. Jaimunk')).toBe(false);
    expect(isMemberByline(director, 'M. Fernandez')).toBe(false);
  });

  it('does not credit on a partial name or a blank byline', () => {
    expect(isMemberByline(director, 'Jaimunk')).toBe(false);
    expect(isMemberByline(director, '   ')).toBe(false);
  });

  it('agrees with matchMember on every byline', () => {
    for (const name of ['J. Jaimunk', 'Win Moe Aung', 'M. Fernandez', '   ']) {
      const matched = matchMember(name, MEMBERS);
      for (const member of MEMBERS) {
        expect(isMemberByline(member, name)).toBe(matched?.id === member.id);
      }
    }
  });
});
