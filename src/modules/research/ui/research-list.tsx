import { ArrowUpRight } from 'lucide-react';
import { BylineNames, type BylineMember } from '@/modules/research-groups';
import type { Research } from '@/modules/research';

// Grouped by area. Every well-structured faculty and lab site organises research thematically
// rather than as one undifferentiated list — the area is what a visitor is actually scanning for
// ("does this group work on access control?"), and repeating it as a per-row label made it a
// property of each item instead of the structure of the page.
//
// Areas keep the admin's own ordering: the service returns rows by `sortOrder`, so the first time
// an area appears fixes its position. Ordering areas alphabetically would silently override the
// sequence the admin arranged.

function groupByArea(items: Research[]): { area: string; items: Research[] }[] {
  const groups = new Map<string, Research[]>();
  for (const item of items) {
    const existing = groups.get(item.area);
    if (existing) existing.push(item);
    else groups.set(item.area, [item]);
  }
  return [...groups].map(([area, grouped]) => ({ area, items: grouped }));
}

export function ResearchList({
  items,
  members = [],
}: {
  items: Research[];
  /** Lab members, see the note in publications-list.tsx. */
  members?: readonly BylineMember[];
}) {
  const groups = groupByArea(items);

  return (
    <div>
      {groups.map((group, groupIndex) => (
        <section
          key={group.area}
          aria-labelledby={`research-${groupIndex}`}
          style={{ '--i': groupIndex } as React.CSSProperties}
          className="rise grid gap-x-6 border-b border-border py-8 first:pt-0 sm:grid-cols-[11rem_1fr] sm:py-10 sm:first:pt-0"
        >
          <h3
            id={`research-${groupIndex}`}
            className="mb-4 font-mono text-xs uppercase leading-5 tracking-[0.12em] text-accent sm:mb-0 sm:pt-1.5"
          >
            {group.area}
          </h3>

          <ul className="min-w-0">
            {group.items.map((item) => (
              <li
                key={item.id}
                className="group border-t border-border/70 py-6 first:border-t-0 first:pt-0 last:pb-0"
              >
                <h4 className="text-balance font-serif text-xl leading-snug text-foreground sm:text-2xl">
                  {item.title}
                </h4>
                <p className="mt-3 max-w-[62ch] text-pretty leading-[1.7] text-muted-foreground">
                  {item.summary}
                </p>
                {/* Omitted entirely when nobody is credited — that means it is his own work. */}
                {item.contributors.length > 0 && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    With{' '}
                    <BylineNames
                      names={item.contributors.map((contributor) => contributor.name)}
                      members={members}
                    />
                  </p>
                )}

                {item.link && (
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center gap-1.5 rounded-xs text-sm font-medium text-accent underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    View project
                    <ArrowUpRight
                      className="size-4 transition-[translate] duration-500 ease-[var(--ease-out-expo)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      aria-hidden="true"
                    />
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
