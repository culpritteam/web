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
  const key = normalize(name);
  if (!key) return null;
  return (
    members.find(
      (member) =>
        normalize(member.name) === key ||
        (member.citationName !== null && normalize(member.citationName) === key),
    ) ?? null
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
