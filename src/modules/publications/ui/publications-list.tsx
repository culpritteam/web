import { ArrowUpRight } from 'lucide-react';
import type { Publication } from '@/modules/publications';

// Grouped by year, newest first — the convention every academic profile uses (Google Scholar, and
// the faculty pages this was modelled on), because "when was this published" is the first question
// a reader brings to a publication list and the only axis they reliably scan by.
//
// This replaces a flat 01/02/03 index. That numbering was an arbitrary position in an ordered list
// — it changed meaning the moment a paper was added, and told the reader nothing. The year rail
// carries real information in the same space.
//
// The service already returns rows ordered by year descending, so grouping preserves that order
// without re-sorting.

function groupByYear(items: Publication[]): { year: number; items: Publication[] }[] {
  const groups: { year: number; items: Publication[] }[] = [];
  for (const item of items) {
    const current = groups.at(-1);
    if (current && current.year === item.year) current.items.push(item);
    else groups.push({ year: item.year, items: [item] });
  }
  return groups.sort((a, b) => b.year - a.year);
}

export function PublicationsList({
  items,
  citationName,
}: {
  items: Publication[];
  /**
   * `Profile.citationName`, rendered in place of the stored snapshot on the professor's own rows.
   * Live rather than snapshotted on purpose: it is her own name, she controls it, and editing it
   * once should re-credit every paper rather than leave 42 rows disagreeing.
   */
  citationName?: string | null;
}) {
  const groups = groupByYear(items);

  return (
    <div>
      {groups.map((group, groupIndex) => (
        <section
          key={group.year}
          aria-labelledby={`publications-${group.year}`}
          style={{ '--i': groupIndex } as React.CSSProperties}
          className="rise grid gap-x-6 border-b border-border py-8 first:pt-0 sm:grid-cols-[4rem_1fr]"
        >
          {/* The year holds the left rail as a running head. On a narrow screen it sits above its
              group instead, where the grid collapses to one column. */}
          <h3
            id={`publications-${group.year}`}
            className="tabular mb-3 font-mono text-sm text-accent sm:mb-0 sm:pt-1"
          >
            {group.year}
          </h3>

          <ol className="min-w-0">
            {group.items.map((item) => (
              <li
                key={item.id}
                className="group border-t border-border/70 py-5 first:border-t-0 first:pt-0 last:pb-0"
              >
                <h4 className="text-balance font-serif text-lg leading-snug text-foreground sm:text-xl">
                  {item.title}
                </h4>
                {/* Nothing at all when there are no authors — an unattributed entry is the
                    professor's own work, and an empty byline line would read as missing data. */}
                {item.authors.length > 0 && (
                  <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
                    {item.authors
                      .map((author) =>
                        author.isProfileOwner && citationName ? citationName : author.name,
                      )
                      .join(', ')}
                  </p>
                )}
                <p className="mt-1 font-serif text-sm italic text-muted-foreground">{item.venue}</p>

                {item.link && (
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 rounded-xs text-sm font-medium text-accent underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    View publication
                    <ArrowUpRight
                      className="size-4 transition-[translate] duration-500 ease-[var(--ease-out-expo)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      aria-hidden="true"
                    />
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                )}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
