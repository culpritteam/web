import type { Metadata } from 'next';
import { getProfileCached } from '@/modules/profile';
import { getPublicationService, PublicationsList } from '@/modules/publications';
import { EmptyState } from '@/modules/shared/ui/empty-state';
import { PageHeading } from '@/modules/shared/ui/page-heading';
import { toMetaDescription } from '../_lib/page-meta';

// The description a search result carries when the admin has written no intro of their own.
// Kept as the fallback rather than deleted, so a tab nobody has filled in yet is never
// description-less.
const FALLBACK_DESCRIPTION = 'Peer-reviewed publications and external links.';

export async function generateMetadata(): Promise<Metadata> {
  const result = await getProfileCached();
  return {
    title: 'Publications',
    description: toMetaDescription(
      result.ok ? result.data?.publicationsIntro : null,
      FALLBACK_DESCRIPTION,
    ),
  };
}

export default async function PublicationsPage() {
  // `getProfileCached` is request-scoped and already read by the layout's site header, so pulling
  // the intro out of it here costs no extra query.
  const [result, profileResult] = await Promise.all([
    getPublicationService().list(),
    getProfileCached(),
  ]);
  const intro = profileResult.ok ? profileResult.data?.publicationsIntro : null;
  const citationName = profileResult.ok ? profileResult.data?.citationName : null;

  return (
    <div>
      <PageHeading title="Publications" />

      <div className="mt-12 space-y-10">
        {/* Same standfirst treatment as the About bio and the Research statement — one editable
            paragraph of the professor's own framing, or nothing at all. No placeholder, no empty
            node: an unfilled intro leaves the list sitting directly under the heading exactly as
            it did before the column existed. */}
        {intro && (
          <p className="rise max-w-[62ch] text-pretty break-words font-serif text-lg leading-[1.75] text-foreground sm:text-xl">
            {intro}
          </p>
        )}

        {!result.ok || result.data.length === 0 ? (
          <EmptyState title="No publications listed yet" />
        ) : (
          <PublicationsList items={result.data} citationName={citationName} />
        )}
      </div>
    </div>
  );
}
