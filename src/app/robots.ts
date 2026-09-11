import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/modules/shared/lib/site-url';

// The public tabs (and, under `/team`, every member's profile page) are crawlable; the admin shell,
// login, and the JSON API surface are not content for search engines to index (and the API isn't
// meant to be requested outside the app).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/research', '/publications', '/team', '/events', '/appointment'],
      disallow: ['/admin', '/login', '/api'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
