import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Avatar } from '@/modules/shared/ui/avatar';
import { panelClassName } from '@/modules/shared/ui/card';
import { cn } from '@/modules/shared/lib/utils';
import { TEAM_KIND_LABELS } from '@/modules/shared/lib/team-kind';
// Deep import, not the barrel — the barrel re-exports Prisma-backed service getters.
import type { TeamMember } from '../team-member.types';
import { groupByTeam } from '../team-assignment';

// The public Team tab: one grid of people per team (ADR-017), in the fixed order director →
// professors → research → development, each card a link to that member's profile page.
//
// The teams are real `<section>`s with real headings rather than one list with visual dividers:
// "which team is this person on" is the structure of the page, so it has to survive being read by
// heading or by region, not only by looking at the gaps. Each grid is `aria-labelledby` its own
// heading, so a screen reader announces "Research Team, list, 4 items" instead of four
// unattributed lists in a row.
//
// The director's card carries no "Director" label any more — the heading above it says so, and
// the one other place this card is used (the About tab) already introduces it with a "Lab
// director" heading of its own. Two labels for one fact is noise in both places.

export function memberInitials(name: string): string {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || '?'
  );
}

export function TeamMemberCard({
  member,
  className,
  style,
}: {
  member: TeamMember;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <Link
      href={`/team/${member.id}`}
      style={style}
      className={cn(
        'group flex h-full items-center gap-4 transition-[border-color,translate] duration-500 ease-[var(--ease-out-expo)] hover:-translate-y-0.5 hover:border-border-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        panelClassName,
        className,
      )}
    >
      <Avatar
        src={member.photoUrl}
        alt={`Portrait of ${member.name}`}
        fallback={memberInitials(member.name)}
        size="md"
      />
      {/* `min-w-0` + `break-words` so a long unhyphenated name or role wraps inside the card. */}
      <div className="min-w-0 flex-1">
        <p className="break-words font-serif text-lg leading-tight text-foreground group-hover:underline group-hover:underline-offset-4">
          {member.name}
        </p>
        <p className="mt-1 break-words text-sm text-muted-foreground">{member.role}</p>
      </div>
      <ArrowRight
        className="size-4 shrink-0 text-muted-foreground transition-[translate] duration-500 ease-[var(--ease-out-expo)] group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}

export function TeamMembersView({ members }: { members: TeamMember[] }) {
  // Empty teams are already dropped by `groupByTeam`, so nothing here renders a heading with
  // nobody under it.
  const groups = groupByTeam(members);
  // The `rise` stagger runs down the whole page rather than restarting per team, so the cards
  // settle in reading order instead of four columns animating in parallel.
  let cardIndex = 0;

  return (
    <div className="space-y-10">
      {groups.map((group) => {
        const headingId = `team-${group.kind}`;

        return (
          <section
            key={group.kind}
            aria-labelledby={headingId}
            className="border-t border-border pt-8 first:border-t-0 first:pt-0"
          >
            <h2 id={headingId} className="font-serif text-xl font-semibold text-accent">
              {TEAM_KIND_LABELS[group.kind]}
            </h2>

            <ul aria-labelledby={headingId} className="mt-5 grid gap-5 sm:grid-cols-2">
              {group.members.map((member) => (
                <li
                  key={member.id}
                  style={{ '--i': cardIndex++ } as React.CSSProperties}
                  className="rise"
                >
                  <TeamMemberCard member={member} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
