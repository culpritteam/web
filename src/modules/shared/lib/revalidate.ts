import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { purgeCloudflareCache } from './cloudflare-cache';
import type { Result } from './result';

// Public-page (and public-API) cache invalidation.
//
// Every public page is prerendered — it reads its content through a service at render time and is
// then served from the Full Route Cache, which is why public navigation costs ~5ms instead of a
// round trip to the database region. The flip side is that nothing in the cache expires on its
// own: without an explicit signal, an admin edit would never reach the public site until the next
// deploy. This module is that signal, so the site stays both fast and current.
//
// Paths are written in their real, rendered form (e.g. `/research`), except for the one dynamic
// page, `/team/[id]`, which is a route template: every member's profile page renders from it, and
// `revalidatePath('/team/[id]', 'page')` purges all of them at once. Routing is flat — there is no `[locale]` segment (removed in ADR-006, 2026-08-08); route groups
// like `(public)` don't add a URL segment, so `src/app/(public)/research/page.tsx` renders at
// exactly `/research`. `revalidatePath` silently no-ops on a non-matching path (it never throws),
// which is how the previous `/[locale]/...` paths went unnoticed as dead invalidation calls — see
// ADR-007.
//
// Each area also lists the public GET API route(s) that mirror the same content, so one admin
// mutation purges both the page and the API response from the same on-demand cache.

/** Public surfaces (and their mirrored public API routes) that admin-editable content feeds. */
const AREA_PATHS = {
  research: ['/research', '/api/research'],
  publications: ['/publications', '/api/publications'],
  /**
   * Team members: the Team tab, every member profile page, and — because a byline name that
   * matches a member's name or citation name is highlighted and linked — Research and Publications.
   *
   * A member's external links are written as part of the member, so they ride along on this area;
   * so does a team change, which alters both the card's grouping on `/team` and which sections the
   * profile page renders.
   *
   * `/api/team-members/{id}` is not listed: a template purge targets a route's `page` entry, which a
   * route handler does not have, so the per-member API mirror relies on its own 3600s `revalidate`
   * ceiling alone. Accepted gap: the profile PAGE, which is what visitors see, is purged.
   */
  team: ['/', '/team', '/team/[id]', '/teaching', '/research', '/publications', '/api/team-members'],
  /** The Events tab — both halves (upcoming and past) come from the same list. */
  events: ['/events', '/api/events'],
  /**
   * CV entries and courses. They render on their member's profile page; `/api/teaching` mirrors the
   * director's. The member id is not known here, so every profile page is purged.
   */
  teaching: ['/team/[id]', '/api/teaching'],
  /**
   * Projects. They render inside their member's profile page and nowhere else — there is no public
   * projects tab and no public `/api/projects` route to mirror, and the Team tab's card does not
   * show them. The member id is not known here, so every profile page is purged.
   */
  projects: ['/team/[id]'],
  /**
   * The About tab alone. Separate from `'profile'`, which drops the whole layout subtree because
   * the lab's name and logo render in the site header on every page.
   */
  about: ['/'],
  /**
   * The Make Appointment tab (Calendly embed only). No matching public API route, and nothing
   * server-side writes to it — kept because the page exists and the area name is part of this
   * module's public contract, not because any current mutation invalidates it.
   */
  appointment: ['/appointment'],
} as const;

export type PublicArea = keyof typeof AREA_PATHS;

/**
 * Every public PAGE url (no `/api/*`), derived from the areas above so a new tab can't be
 * forgotten here. Used by the `'profile'` purge, which affects all of them.
 */
const PUBLIC_PAGE_PATHS: string[] = [
  ...new Set(
    Object.values(AREA_PATHS).flatMap((paths) => paths.filter((p) => !p.startsWith('/api/'))),
  ),
];

/** A route template such as `/team/[id]`, rather than a real URL. */
const isTemplate = (path: string) => path.includes('[');

/**
 * Cloudflare purges by real URL, so a template is dropped from the edge purge list: there is no
 * `/team/[id]` URL to purge, and the member ids are not known here. Those pages fall back to their
 * edge TTL, the same accepted gap as any dynamic public route.
 */
const edgePurgeable = (paths: readonly string[]) => paths.filter((path) => !isTemplate(path));

/**
 * Invalidate the public pages (and mirrored public API routes) affected by a change.
 *
 * Use `'profile'` for profile edits: the lab's name, tagline and logo render in the site
 * header, which lives in the public *layout* and therefore appears on every tab — so a profile
 * save has to drop the whole subtree, not just the About page. `/api/profile` is purged alongside it.
 */
export function revalidatePublic(...areas: (PublicArea | 'profile')[]): void {
  const purgePaths: string[] = [];
  for (const area of areas) {
    if (area === 'profile') {
      // Next's own invalidation: `('/', 'layout')` drops the root layout and every page nested
      // under it, so all seven public tabs are covered at the origin by this one call.
      revalidatePath('/', 'layout');
      revalidatePath('/api/profile');
      // Cloudflare purges by explicit file URL, so the subtree semantics above do NOT carry over —
      // listing only `/` would leave the other tabs served from the edge until their own TTL. The
      // profile row feeds every tab (the header name/photo on all of them, and since 2026-09-02
      // the per-tab intro copy on five of them), so every public page URL is named here.
      purgePaths.push('/api/profile', ...edgePurgeable(PUBLIC_PAGE_PATHS));
    } else {
      // A template needs `type` — without it `revalidatePath` matches nothing and silently no-ops.
      for (const path of AREA_PATHS[area]) {
        if (isTemplate(path)) revalidatePath(path, 'page');
        else revalidatePath(path);
      }
      purgePaths.push(...edgePurgeable(AREA_PATHS[area]));
    }
  }

  // Cloudflare purge runs after the response is sent (`after()`), and is a no-op without
  // CLOUDFLARE_API_TOKEN/CLOUDFLARE_ZONE_ID configured — see cloudflare-cache.ts. Batched into one
  // call per `revalidatePublic` invocation (not one per area/path) so an admin edit that touches
  // several areas at once doesn't fire a purge storm — see docs/decisions for the reasoning.
  // Guarded: `after` throws when called outside a real request scope (e.g. a unit test invoking
  // this function directly rather than through a route handler).
  try {
    after(() => purgeCloudflareCache(purgePaths));
  } catch {
    // Outside a request scope — nothing to schedule against. Not worth mocking `after` to avoid
    // this; `purgeCloudflareCache` itself is covered by its own tests.
  }
}

/**
 * Revalidate only when the operation actually succeeded, then hand the Result straight back so a
 * route handler can stay a one-liner: `return respond(revalidateOn(result, 'research'), 201)`.
 * A rejected transition (409) or a not-found id changed nothing, so it must not evict a good
 * cached page.
 */
export function revalidateOn<T, E>(result: Result<T, E>, ...areas: (PublicArea | 'profile')[]) {
  if (result.ok) revalidatePublic(...areas);
  return result;
}
