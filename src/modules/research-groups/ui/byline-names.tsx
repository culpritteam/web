import { Fragment } from 'react';
import Link from 'next/link';
import { matchMember, type BylineMember } from '../byline-match';

// A comma-joined byline. A name that matches a lab member links to their profile in the accent
// colour; an outside author stays grey. The underline on hover and focus means colour is never the
// only cue that a name is a link (WCAG 1.4.1).

export function BylineNames({
  names,
  members,
}: {
  names: readonly string[];
  members: readonly BylineMember[];
}) {
  return names.map((name, index) => {
    const member = matchMember(name, members);
    return (
      <Fragment key={`${index}-${name}`}>
        {index > 0 && ', '}
        {member ? (
          <Link
            href={`/team/${member.id}`}
            className="rounded-xs font-medium text-accent underline-offset-4 hover:underline focus-visible:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {name}
          </Link>
        ) : (
          <span className="text-muted-foreground">{name}</span>
        )}
      </Fragment>
    );
  });
}
