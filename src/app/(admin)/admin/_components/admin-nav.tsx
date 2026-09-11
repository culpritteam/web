'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/modules/shared/lib/utils';

// The admin section's tab bar. Each entry mirrors one public tab, so the admin edits a page by
// going to the screen of the same name — the old entity-shaped nav (Profile / Groups / Team
// Members) spread a single public tab across two or three screens.
//
// Same visual language as the public `NavTabs` (underlined active
// tab on the masthead band) but a real `nav`/links list here too: each destination is a distinct
// routed page with its own data load, not a same-document panel.
const TABS = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/about', label: 'About' },
  { href: '/admin/research', label: 'Research' },
  { href: '/admin/publications', label: 'Publications' },
  { href: '/admin/team', label: 'Team' },
  { href: '/admin/events', label: 'Events' },
  { href: '/admin/appointment', label: 'Appointment' },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  const activeRef = useRef<HTMLAnchorElement>(null);

  // On a narrow screen the tab just navigated to can sit outside the visible run — landing on
  // the last tab and finding it clipped at the edge. Pull it into view on mount and
  // whenever the route changes.
  //
  // Guarded on the strip actually overflowing. `scrollIntoView` walks every scrollable ancestor,
  // so calling it when there is nothing to scroll is not free — it was one of two things nudging
  // the header on each navigation. `block: 'nearest'` keeps the rest of it horizontal.
  useEffect(() => {
    const link = activeRef.current;
    const strip = link?.closest('nav');
    if (!link || !strip || strip.scrollWidth <= strip.clientWidth) return;
    link.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [pathname]);

  return (
    // One line always. Seven destinations don't fit the band on a narrow screen, so the strip
    // scrolls horizontally rather than wrapping — and `.scroll-fade` softens whichever edge still
    // has tabs beyond it, since the scrollbar itself is hidden and would otherwise leave no cue
    // that there is more to reach.
    <nav aria-label="Admin" className="scroll-fade -mb-px overflow-x-auto scrollbar-hidden">
      <ul className="flex min-w-max items-center gap-1 sm:gap-2">
        {TABS.map(({ href, label }) => {
          const active = href === '/admin' ? pathname === href : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                ref={active ? activeRef : undefined}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  // Same hierarchy as the public tab bar: the inactive tabs recede, the active
                  // one is full-contrast with an accent underline. Previously every tab was
                  // full-contrast semibold and only the active one changed colour, so the bar
                  // read as seven equally-weighted items.
                  'inline-flex items-center whitespace-nowrap rounded-t-md border-b-2 px-3.5 pb-3.5 pt-3 text-sm tracking-tight text-masthead-foreground/60 transition-[color,border-color,background-color] duration-500 ease-[var(--ease-out-expo)] hover:bg-masthead-foreground/[0.06] hover:border-masthead-foreground/25 hover:text-masthead-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-on-band',
                  active
                    ? 'border-accent-on-band font-medium text-masthead-foreground'
                    : 'border-transparent',
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
