import { describe, expect, it } from 'vitest';
import { matchMember } from '../byline-match';

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
