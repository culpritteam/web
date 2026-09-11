import Link from 'next/link';
import { Avatar } from '@/modules/shared/ui/avatar';
import type { Profile } from '@/modules/profile';
import { memberInitials } from '@/modules/research-groups';
import { NavTabs } from './nav-tabs';

// The masthead: a deep ink band carrying the lab's logo, name, and the tab bar. The only inverted
// surface in the design — an editorial device (the head of a printed page).
//
// Rendered once by the (public) layout. The lab name is the site shell's single <h1>; each tab's
// own heading below is an <h2>.
//
// Note the two accents: `--accent` is unreadable on ink (2.15:1), so anything tinted on this
// surface uses `--accent-on-band` (5.17:1). See globals.css.

export const DEFAULT_LAB_NAME = 'The Culprit';

export async function SiteHeader({ profile }: { profile: Profile | null }) {
  const labName = profile?.labName || DEFAULT_LAB_NAME;

  return (
    <header className="relative bg-masthead text-masthead-foreground">
      <div className="mx-auto max-w-6xl px-6 pt-14 sm:px-8 sm:pt-20">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:gap-8">
          <Link
            href="/"
            className="group inline-flex flex-col gap-6 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-on-band sm:flex-row sm:items-end sm:gap-8"
          >
            {/* Mounted-print frame: the logo sits on a small card of the band's own shade. */}
            <div className="rounded-[calc(var(--radius-container)+0.5rem)] bg-masthead-mount p-2 shadow-raised transition-[translate] duration-700 ease-[var(--ease-out-expo)] group-hover:-translate-y-0.5">
              <Avatar
                src={profile?.logoUrl}
                alt={`${labName} logo`}
                fallback={memberInitials(labName)}
                size="lg"
                className="!rounded-[calc(var(--radius-container)+0.125rem)]"
              />
            </div>
            <div className="pb-1">
              <h1 className="text-pretty font-serif text-[2.125rem] font-normal leading-[1.05] tracking-[-0.02em] sm:text-6xl">
                {labName}
              </h1>
              {profile?.labTagline && (
                <p className="mt-3 font-serif text-lg italic text-accent-on-band sm:text-xl">
                  {profile.labTagline}
                </p>
              )}
              {profile?.positionAffiliation && (
                <p className="mt-2 max-w-xl text-pretty text-sm leading-relaxed text-masthead-foreground/70">
                  {profile.positionAffiliation}
                </p>
              )}
            </div>
          </Link>
        </div>

        <div className="mt-10 border-t border-masthead-foreground/12 sm:mt-14">
          <NavTabs />
        </div>
      </div>
    </header>
  );
}
