import { getProfileCached } from '@/modules/profile';
import { SiteFooter } from './_components/site-footer';
import { DEFAULT_LAB_NAME, SiteHeader } from './_components/site-header';

// Shared shell for every public tab (About, Research, Publications, Team, Events,
// Make Appointment): the masthead band + tab bar render once here, so each page below
// only supplies its own tab content. Server Component — reads the profile directly through the
// service layer (no internal HTTP round-trip) per the "public read pages fetch through services"
// architecture rule.
//
// Deliberately NO `loading.tsx` beside this layout. A loading boundary here reads well in dev,
// where a cold route compile leaves the old tab on screen for a second or two — but it converts
// these routes from prerendered HTML (`x-nextjs-cache: HIT`, ~5ms) into a streamed per-request
// render that hits the database on every visit (~150ms, measured). In production there is no wait
// worth papering over, so the cache wins. The admin section keeps its boundary: those pages are
// session-gated and re-render per request regardless.

// Safety net only. Every admin write already invalidates the pages it affects on demand (see
// modules/shared/lib/revalidate), which is what keeps the public site current within a request or
// two. This hourly ceiling just bounds how long a change made *outside* the app — a direct DB
// edit, a re-seed, a restored backup — could otherwise sit invisible behind the Full Route Cache.
export const revalidate = 3600;

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const result = await getProfileCached();
  const profile = result.ok ? result.data : null;

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <SiteHeader profile={profile} />
      {/* `id` is the target of the skip-link in the root layout (WCAG 2.4.1). The measure is
          capped at 68ch on the prose column rather than the full 5xl shell — long-form CV copy
          set edge-to-edge across 900px is unreadable no matter how good the type is. */}
      <main
        id="main"
        className="mx-auto w-full max-w-6xl flex-1 px-6 pb-24 pt-12 sm:px-8 sm:pb-32 sm:pt-20"
      >
        {children}
      </main>
      <SiteFooter labName={profile?.labName || DEFAULT_LAB_NAME} />
    </div>
  );
}
