import type { MetadataRoute } from 'next';
import { getTeamMemberService } from '@/modules/research-groups';
import { SITE_URL } from '@/modules/shared/lib/site-url';

// The public tabs plus every member's profile page are indexable content — admin, login, and API
// routes are deliberately excluded (see robots.ts). Priorities are standard defaults, not measured
// data: the homepage (About) is the canonical entry point and gets the highest weight.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();
  const members = await getTeamMemberService().list();

  return [
    { url: `${SITE_URL}/`, lastModified, changeFrequency: 'monthly', priority: 1 },
    { url: `${SITE_URL}/research`, lastModified, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/publications`, lastModified, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/team`, lastModified, changeFrequency: 'monthly', priority: 0.7 },
    ...(members.ok ? members.data : []).map((member) => ({
      url: `${SITE_URL}/team/${member.id}`,
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
    { url: `${SITE_URL}/events`, lastModified, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${SITE_URL}/appointment`, lastModified, changeFrequency: 'yearly', priority: 0.5 },
  ];
}
