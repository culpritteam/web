import type { NextConfig } from 'next';

// Best-effort host derivation for next/image's allow-list. R2_PUBLIC_URL may be unset for a
// contributor who hasn't configured R2 yet, or a CI step that doesn't need it — fall back to no
// allow-listed host rather than crashing config eval.
function r2RemotePatterns(): NonNullable<NextConfig['images']>['remotePatterns'] {
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!publicUrl) return [];
  try {
    const { protocol, hostname } = new URL(publicUrl);
    if (protocol !== 'http:' && protocol !== 'https:') {
      console.warn(`R2_PUBLIC_URL has unsupported protocol "${protocol}" — ignoring.`);
      return [];
    }
    return [{ protocol: protocol.slice(0, -1) as 'http' | 'https', hostname }];
  } catch {
    console.warn(`R2_PUBLIC_URL "${publicUrl}" is not a valid URL — ignoring.`);
    return [];
  }
}

// The public R2 host, if configured, needs to appear in img-src alongside the app's own origin —
// same derivation as r2RemotePatterns() above, kept separate since CSP wants a bare host string.
function r2ImgSrc(): string {
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!publicUrl) return '';
  try {
    return new URL(publicUrl).origin;
  } catch {
    return '';
  }
}

// Third-party embeds are the only reason this isn't a same-origin-only policy: the Calendly widget
// (script + iframe, see calendly-embed.tsx), the Turnstile challenge (script + iframe, see
// turnstile-challenge.tsx), and the YouTube players on the Events tab (iframe only — the embed is
// a plain <iframe src>, so youtube-nocookie.com needs frame-src but not script-src).
//
// `script-src` allows 'unsafe-inline'. An earlier version of this file did not, on the stated
// grounds that "no inline <script> is used anywhere in the app". That was wrong, and it took the
// production site down: the App Router ships its RSC flight data as a run of inline
// `self.__next_f.push(...)` tags in every prerendered document — 20 of them on `/` alone — and
// blocking those means the page paints nothing and the stream dies with "Connection closed".
//
// The two stricter alternatives were both rejected on purpose:
//
//   * A per-request nonce (middleware sets it, Next stamps its own scripts with it) is the
//     textbook answer, but Next opts a page out of static generation the moment a nonce is in
//     play. That would trade the Full Route Cache and ISR — the thing ADR-007 built and the
//     thing the free-tier hosting maths depends on — for a function invocation and a database
//     round trip on every single visit.
//   * Hashes can't work at all: the flight payload differs per route and per build, so there is
//     nothing stable to hash.
//
// What still holds without inline-script protection: `object-src 'none'`, `base-uri 'self'`,
// `form-action 'self'` and `frame-ancestors 'none'` each block an attack class of their own, and
// the host allowlist still means no *external* script loads from anywhere but Calendly and
// Turnstile. The injection surface 'unsafe-inline' widens is separately closed at the source —
// every free-text field is run through `stripHtml` at its Zod boundary, so no user-supplied
// markup is ever stored, let alone rendered.
//
// If a nonce is ever introduced here, remove 'unsafe-inline' in the same change: a browser that
// sees a nonce ignores 'unsafe-inline' entirely, so leaving both would silently break the page
// again.
//
// style-src keeps 'unsafe-inline' for its own reason: React inline `style={{...}}` attributes
// (dynamic widths/heights) are used across the UI, and CSP has no practical hash/nonce story for
// those.
function buildCsp(): string {
  const r2Origin = r2ImgSrc();
  // Dev mode needs 'unsafe-eval' on top of the shared 'unsafe-inline': Fast Refresh eval()-wraps
  // modules and injects the hot-update runtime as dynamically-created inline scripts.
  const isDev = process.env.NODE_ENV !== 'production';
  const directives: Record<string, string[]> = {
    'default-src': [`'self'`],
    'script-src': [
      `'self'`,
      `'unsafe-inline'`,
      'https://assets.calendly.com',
      'https://challenges.cloudflare.com',
      // Dev additionally eval()-wraps modules for Fast Refresh; production builds emit real
      // external chunk files and need no eval.
      ...(isDev ? [`'unsafe-eval'`] : []),
    ],
    'style-src': [`'self'`, `'unsafe-inline'`],
    // `blob:` covers the photo-crop preview: the admin picks a file and it is shown via a local
    // `URL.createObjectURL` blob before upload. Same-origin and created in the page — no network
    // fetch, so it widens img-src no further than the app's own memory.
    'img-src': [`'self'`, 'data:', 'blob:', ...(r2Origin ? [r2Origin] : [])],
    'font-src': [`'self'`, 'data:'],
    'connect-src': [`'self'`, 'https://calendly.com', 'https://*.calendly.com', 'https://challenges.cloudflare.com'],
    'frame-src': [
      'https://calendly.com',
      'https://*.calendly.com',
      'https://challenges.cloudflare.com',
      'https://www.youtube-nocookie.com',
    ],
    'object-src': [`'none'`],
    'base-uri': [`'self'`],
    'form-action': [`'self'`],
    'frame-ancestors': [`'none'`],
  };
  return Object.entries(directives)
    .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
    .join('; ');
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle (server.js + pruned prod-only node_modules) — the production
  // Docker image copies only .next/standalone instead of the full node_modules tree. Irrelevant to
  // the existing Vercel deploy (Vercel ignores `output` and always uses its own build output).
  output: 'standalone',
  experimental: {
    // Client-side Router Cache lifetimes. Next's default for dynamic segments is 0, so clicking
    // back to a tab you were just on re-fetches its whole RSC payload — a full server round trip
    // (and, in dev, a DB query to the remote Supabase region) for content that has not changed.
    // The public/admin tab bars are exactly this back-and-forth pattern, so hold prefetched and
    // visited payloads briefly: re-selecting a tab within the window renders from memory.
    staleTimes: { dynamic: 30 },
  },
  // Photos (profile/team) come from Cloudflare R2 — object storage moved off Supabase Storage on
  // 2026-08-08 (see docs/decisions/ADR-002-object-storage-r2.md). The public R2 host is derived
  // from R2_PUBLIC_URL at config-eval time so the `Avatar` component's next/image usage resolves
  // instead of 404ing.
  images: {
    remotePatterns: r2RemotePatterns(),
  },
  async headers() {
    return [
      // The site icon changed on 2026-09-06 (the .ico was a solid teal square unrelated to the
      // kite). `icon.svg` re-busts itself — Next appends a content hash to the <link href> — but
      // /favicon.ico is requested by URL alone, so a browser that cached the old square would keep
      // showing it essentially forever. Forcing revalidation means every existing visitor picks the
      // kite up on their next load, at the cost of one conditional request that answers 304.
      //
      // Worth relaxing to a long max-age once the old icon has aged out of circulation.
      {
        source: '/favicon.ico',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Content-Security-Policy', value: buildCsp() },
        ],
      },
    ];
  },
};

export default nextConfig;
