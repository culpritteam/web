import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Avatar } from '@/modules/shared/ui/avatar';
import { panelClassName } from '@/modules/shared/ui/card';
import { cn } from '@/modules/shared/lib/utils';
// Deep import, not the barrel — the barrel re-exports Prisma-backed service getters.
import type { TeamMember } from '../team-member.types';

// The public Team tab (ADR-016): one flat grid of people, each card a link to that member's profile
// page. The director leads — the service already orders her first — and carries a text label, so
// her position is not conveyed by order alone.

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
        {member.isDirector && (
          <p className="mb-1 font-mono text-xs uppercase tracking-[0.12em] text-accent">Director</p>
        )}
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
  return (
    <ul className="grid gap-5 sm:grid-cols-2">
      {members.map((member, index) => (
        <li key={member.id} style={{ '--i': index } as React.CSSProperties} className="rise">
          <TeamMemberCard member={member} />
        </li>
      ))}
    </ul>
  );
}
