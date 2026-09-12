import Link from 'next/link';

// The research items and publications a member is credited on, listed on their profile page.
//
// Bylines are plain names (ADR-016), so membership in this list is decided at render time by
// `isMemberByline` — there is no relation to read and nothing to store. The rows are therefore
// pointers, not copies: each links back to the canonical entry on the public Research or
// Publications tab, where the full byline, summary and external link already live. Repeating all
// of that here would give one work two places to be edited-looking and two places to be wrong.

export type CreditedWork = {
  id: string;
  title: string;
  /** The one line of context that identifies the work in its own tab — an area, or a venue. */
  meta: string;
  /** Where the canonical entry lives, e.g. `/publications#publications-2024`. */
  href: string;
};

export function CreditedWorkList({ items }: { items: readonly CreditedWork[] }) {
  if (items.length === 0) return null;

  return (
    <ul className="min-w-0">
      {items.map((item, index) => (
        <li
          key={item.id}
          style={{ '--i': index } as React.CSSProperties}
          className="rise border-t border-border/70 py-4 first:border-t-0 first:pt-0 last:pb-0"
        >
          <Link
            href={item.href}
            className="rounded-xs text-pretty break-words font-medium leading-snug text-foreground underline-offset-4 transition-colors duration-300 ease-[var(--ease-out-expo)] hover:text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {item.title}
          </Link>
          <p className="mt-1 max-w-[62ch] text-pretty break-words font-serif text-sm italic text-muted-foreground">
            {item.meta}
          </p>
        </li>
      ))}
    </ul>
  );
}
