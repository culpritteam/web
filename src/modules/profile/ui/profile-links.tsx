import { ArrowUpRight } from 'lucide-react';

// A team member's external profile links (`member_link` rows, free-form label + URL). Rendered as
// a compact row under the bio, and nothing at all when no link is set.

/**
 * One link to render. Structural on purpose, so this takes the `MemberLink` rows the profile
 * service returns without the profile module importing the research-groups module for a type.
 */
export type ProfileLinkItem = { id: string; label: string; url: string };

export function ProfileLinks({ links }: { links: readonly ProfileLinkItem[] }) {
  if (links.length === 0) return null;

  return (
    <ul className="flex flex-wrap items-center gap-x-7 gap-y-2">
      {links.map(({ id, url: href, label }) => (
        <li key={id}>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-1.5 rounded-xs text-sm font-medium text-foreground underline-offset-4 transition-colors duration-300 ease-[var(--ease-out-expo)] hover:text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {label}
            <ArrowUpRight
              className="size-3.5 transition-[translate] duration-500 ease-[var(--ease-out-expo)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              aria-hidden="true"
            />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
