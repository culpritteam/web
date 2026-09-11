import type { Metadata } from 'next';
import Link from 'next/link';
import { getProfileCached } from '@/modules/profile';
import { SiteFooter } from './(public)/_components/site-footer';
import { DEFAULT_LAB_NAME, SiteHeader } from './(public)/_components/site-header';
import { PageHeading } from '@/modules/shared/ui/page-heading';

// Root-level not-found — Next renders this for any unmatched route across the whole app (public
// and admin alike), so it lives outside the `(public)` route group and can't inherit that group's
// layout. It reproduces the same masthead + nav tabs by fetching the profile itself, matching the
// visual language of every other page instead of falling back to Next's bare default, and gives a
// lost visitor (public or admin) a real way back into the site.

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: false },
};

export default async function NotFound() {
  const result = await getProfileCached();
  const profile = result.ok ? result.data : null;

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <SiteHeader profile={profile} />
      <main
        id="main"
        className="mx-auto w-full max-w-6xl flex-1 px-6 pb-24 pt-12 sm:px-8 sm:pb-32 sm:pt-20"
      >
        {/* No icon and no boxed panel here. A compass glyph above a 404 is decoration standing in
            for an explanation; the sentence and the way out are the useful parts. */}
        <PageHeading
          title="Page not found"
          intro="This address doesn't match anything on the site."
        />

        <p className="mt-10">
          <Link
            href="/"
            className="group inline-flex h-11 items-center gap-2.5 rounded-sm bg-accent px-6 text-sm font-medium tracking-tight text-accent-foreground transition-[background-color,scale] duration-300 ease-[var(--ease-out-expo)] hover:bg-accent/90 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Back to the About page
            <span
              aria-hidden="true"
              className="transition-[translate] duration-500 ease-[var(--ease-out-expo)] group-hover:translate-x-0.5"
            >
              &rarr;
            </span>
          </Link>
        </p>
      </main>
      <SiteFooter labName={profile?.labName || DEFAULT_LAB_NAME} />
    </div>
  );
}
