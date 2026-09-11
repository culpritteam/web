'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/modules/shared/lib/utils';

// The public tab bar. These are real routed pages (each server-rendered with its own metadata for
// crawlability), not same-document panels — so this is a `nav` of links with `aria-current`, not
// an ARIA `tablist`/`tab` widget. The WAI-ARIA Authoring Practices reserve the tabs pattern for
// switching panels within one page; applying it to cross-page navigation would misrepresent the
// widget to assistive tech (arrow-key panel semantics that don't apply to full navigations).
// Visually it still reproduces the prototype's underlined-active-tab look.
const TABS = [
  { href: '/', label: 'About' },
  { href: '/research', label: 'Research' },
  { href: '/publications', label: 'Publications' },
  { href: '/team', label: 'Team' },
  { href: '/events', label: 'Events' },
  { href: '/appointment', label: 'Make Appointment' },
] as const;

export function NavTabs() {
  const pathname = usePathname();
  const activeRef = useRef<HTMLAnchorElement>(null);

  // Keep the current tab visible in the scrolling strip on narrow screens, and only when the strip
  // actually overflows — see the equivalent comment in the admin nav.
  useEffect(() => {
    const link = activeRef.current;
    const strip = link?.closest('nav');
    if (!link || !strip || strip.scrollWidth <= strip.clientWidth) return;
    link.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [pathname]);

  return (
    <nav aria-label="Primary" className="scroll-fade -mb-px overflow-x-auto scrollbar-hidden">
      <ul className="flex min-w-max items-center gap-1 sm:gap-2">
        {TABS.map(({ href, label }) => {
          // A member profile lives under /team, so the Team tab stays current there.
          const active = href === '/team' ? pathname.startsWith('/team') : pathname === href;
          return (
            <li key={href}>
              <Link
                href={href}
                ref={active ? activeRef : undefined}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex items-center whitespace-nowrap rounded-t-md border-b-2 px-3.5 pb-3.5 pt-3 text-sm tracking-tight text-masthead-foreground/60 transition-[color,border-color,background-color] duration-500 ease-[var(--ease-out-expo)] hover:bg-masthead-foreground/[0.06] hover:border-masthead-foreground/25 hover:text-masthead-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-on-band',
                  active ? 'border-accent-on-band text-masthead-foreground' : 'border-transparent',
                )}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
