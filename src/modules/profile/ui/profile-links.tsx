import { ArrowUpRight } from 'lucide-react';

// External academic/professional profiles for a person — since ADR-016, a team member. Rendered as
// a compact row under the bio, and nothing at all when no link is set.

export type ProfileLinkFields = {
  linkedinUrl?: string | null;
  googleScholarUrl?: string | null;
};

const LINKS = [
  { field: 'linkedinUrl', label: 'LinkedIn' },
  { field: 'googleScholarUrl', label: 'Google Scholar' },
] as const satisfies readonly { field: keyof ProfileLinkFields; label: string }[];

export function ProfileLinks({ links }: { links: ProfileLinkFields }) {
  const present = LINKS.flatMap(({ field, label }) => {
    const href = links[field];
    return href ? [{ field, href, label }] : [];
  });

  if (present.length === 0) return null;

  return (
    <ul className="flex flex-wrap items-center gap-x-7 gap-y-2">
      {present.map(({ field, href, label }) => (
        <li key={field}>
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
