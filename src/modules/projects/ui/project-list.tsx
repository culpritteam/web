import { ArrowUpRight } from 'lucide-react';
// Deep import, not the barrel — the barrel re-exports the Prisma-backed service getter.
import type { Project } from '../project.types';

// What a member built, on their profile page at `/team/[id]`. Same entry shape as `CourseList`'s
// rows — serif title, one paragraph, an optional external link — because a reader scans a project
// and a course for the same three things, and giving them two different layouts on one page would
// suggest a difference that isn't there.
//
// No grouping rail: a project has no area or level to group by, so the list runs straight down the
// reading column. The page above supplies the "Projects" heading.

export function ProjectList({ projects }: { projects: readonly Project[] }) {
  if (projects.length === 0) return null;

  return (
    <ul className="min-w-0">
      {projects.map((project, index) => (
        <li
          key={project.id}
          style={{ '--i': index } as React.CSSProperties}
          className="rise group border-t border-border/70 py-6 first:border-t-0 first:pt-0 last:pb-0"
        >
          <h3 className="text-balance font-serif text-xl leading-snug text-foreground sm:text-2xl">
            {project.title}
          </h3>
          <p className="mt-3 max-w-[62ch] text-pretty break-words leading-[1.7] text-muted-foreground">
            {project.summary}
          </p>

          {project.link && (
            <a
              href={project.link}
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
  );
}
