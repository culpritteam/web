/** The member fields a byline match needs. Pages pass only these, not whole member rows. */
export type BylineMember = { id: string; name: string; citationName: string | null };

const normalize = (value: string) => value.trim().toLowerCase();

/**
 * The lab member a byline name refers to, or null for an outside author.
 *
 * Bylines are plain typed names (ADR-016), so this is the only link between a paper and a member: a
 * name matches when it equals the member's `name` or `citationName`, ignoring case and surrounding
 * whitespace. Nothing fuzzier — a near miss renders grey rather than crediting the wrong person.
 */
export function matchMember<M extends BylineMember>(name: string, members: readonly M[]): M | null {
  if (!normalize(name)) return null;
  return members.find((member) => isMemberByline(member, name)) ?? null;
}

/**
 * Whether a byline name credits THIS member — the per-member half of `matchMember`, same exact
 * case-insensitive trimmed rule.
 *
 * This is how a member's profile page resolves the research items and publications they worked on:
 * bylines carry no link to a member (ADR-016 forbids storing one), so the page filters the lists it
 * already has by this predicate at render time. No DB relation, no extra query.
 */
export function isMemberByline(
  member: Pick<BylineMember, 'name' | 'citationName'>,
  name: string,
): boolean {
  const key = normalize(name);
  if (!key) return false;
  return (
    normalize(member.name) === key ||
    (member.citationName !== null && normalize(member.citationName) === key)
  );
}

/**
 * The admin byline field's datalist suggestions: each member's name and name-on-papers, once.
 * Lives here rather than beside `BylineField` because Server Components call it, and a function
 * exported from a `'use client'` module is only a client reference on the server.
 */
export function bylineSuggestions(
  members: readonly Pick<BylineMember, 'name' | 'citationName'>[],
): string[] {
  return [...new Set(members.flatMap((m) => (m.citationName ? [m.name, m.citationName] : [m.name])))];
}
