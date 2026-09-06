'use client';

import { useId, useRef, useState } from 'react';
import Image from 'next/image';
import { Plus, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '@/modules/shared/lib/api-client';
import { Button } from '@/modules/shared/ui/button';
import { Input } from '@/modules/shared/ui/input';
import { Label } from '@/modules/shared/ui/label';
import { FRAMER_ACCEPTED_TYPES, PhotoFramer } from '@/modules/shared/ui/photo-framer';
import { parseYouTubeVideoId } from '@/modules/integrations/youtube/youtube-utils';

// The two media pickers on the event form. Both are controlled from the dialog's RHF state via
// plain value/onChange props rather than `useFormContext` — the dialog is a single self-contained
// form and threading a provider through it for two fields would be ceremony.
//
// The photo and video halves are deliberately asymmetric, because the underlying storage is:
// photos are files this app uploads to R2 and owns, videos are YouTube references it merely
// records. Presenting them as one uniform "media" widget would hide that difference from the
// admin, who does need to know that removing a video here does not delete anything anywhere.

const MAX_PHOTOS = 20;
const MAX_VIDEOS = 10;

// Edge of the uploaded square, in px. Larger than the profile's 512 because a gallery photo is
// rendered up to half the viewport wide, not inside a 128px avatar — but still small enough that
// the framer's JPEG lands far under the route's 4 MB cap whatever the admin picked.
const OUTPUT_SIZE = 1200;

async function uploadEventPhoto(blob: Blob): Promise<string> {
  const formData = new FormData();
  formData.append('file', blob, 'photo.jpg');
  const { url } = await apiRequest<{ url: string }>('/api/admin/events/photo', {
    method: 'POST',
    body: formData,
  });
  return url;
}

export function PhotoUploadList({
  urls,
  onChange,
  disabled,
}: {
  urls: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  // The photos picked in one go, framed one after another. Whichever have already been framed are
  // uploaded and in `urls` — abandoning the rest keeps them.
  const [batch, setBatch] = useState<{ files: File[]; index: number } | null>(null);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = ''; // allow re-selecting the same file later
    if (files.length === 0) return;

    const room = MAX_PHOTOS - urls.length;
    if (room <= 0) {
      toast.error(`Up to ${MAX_PHOTOS} photos per event.`);
      return;
    }
    const selected = files.slice(0, room);
    if (selected.length < files.length) {
      toast.error(`Only the first ${room} photo${room === 1 ? '' : 's'} can be added.`);
    }
    setBatch({ files: selected, index: 0 });
  }

  async function uploadFramed(blob: Blob) {
    // Sequential by construction: the admin frames one photo at a time, so there is never more
    // than one upload in flight. Each URL is appended as it lands, so abandoning the batch
    // part-way through keeps whatever already uploaded.
    try {
      const url = await uploadEventPhoto(blob);
      onChange([...urls, url]);
      setBatch((current) => {
        if (!current) return null;
        const next = current.index + 1;
        return next >= current.files.length ? null : { ...current, index: next };
      });
    } catch (error) {
      // Surface the server's own reason rather than a generic line, and stay on this photo so the
      // admin can retry it without re-picking the whole batch.
      toast.error(error instanceof Error ? error.message : 'Could not upload the photo.');
    }
  }

  const framing = batch?.files[batch.index];
  if (framing) {
    return (
      <PhotoFramer
        key={batch.index}
        file={framing}
        outputSize={OUTPUT_SIZE}
        caption={
          batch.files.length > 1
            ? `Photo ${batch.index + 1} of ${batch.files.length}. Cancel skips the rest.`
            : undefined
        }
        onConfirm={uploadFramed}
        onCancel={() => setBatch(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={inputId}>Photos</Label>
      <p className="-mt-0.5 text-xs leading-relaxed text-muted-foreground">
        Optional. JPEG, PNG, WebP or GIF, up to {MAX_PHOTOS} per event. Each one is framed as a
        square before it uploads. They appear as a gallery under the event on the public tab.
      </p>

      {urls.length > 0 && (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {urls.map((url, index) => (
            <li key={url} className="relative">
              {/* Square, like the framing step and the public gallery tile — what the admin
                  framed is what this thumbnail and the public tab both show. */}
              <div className="relative aspect-square overflow-hidden rounded-md bg-muted ring-1 ring-border">
                <Image
                  src={url}
                  alt={`Photo ${index + 1}`}
                  fill
                  sizes="120px"
                  className="object-cover"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={`Remove photo ${index + 1}`}
                disabled={disabled}
                className="absolute -right-2 -top-2 size-7 rounded-full bg-background"
                onClick={() => onChange(urls.filter((candidate) => candidate !== url))}
              >
                <X className="size-3.5" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || urls.length >= MAX_PHOTOS}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="size-4" aria-hidden="true" />
          {urls.length > 0 ? 'Add more photos' : 'Upload photos'}
        </Button>
      </div>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        multiple
        accept={FRAMER_ACCEPTED_TYPES}
        className="sr-only"
        onChange={handleFileChange}
      />
    </div>
  );
}

export function VideoLinkList({
  ids,
  onChange,
  disabled,
}: {
  /** Normalised 11-character YouTube video IDs. */
  ids: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const inputId = useId();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  function addDraft() {
    const parsed = parseYouTubeVideoId(draft);
    if (!parsed) {
      setError('Paste a YouTube link or an 11-character video ID.');
      return;
    }
    if (ids.includes(parsed)) {
      setError('That video is already on this event.');
      return;
    }
    if (ids.length >= MAX_VIDEOS) {
      setError(`Up to ${MAX_VIDEOS} videos per event.`);
      return;
    }
    onChange([...ids, parsed]);
    setDraft('');
    setError(undefined);
  }

  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={inputId}>Videos</Label>
      <p className="-mt-0.5 text-xs leading-relaxed text-muted-foreground">
        Optional. Paste a YouTube link — the video is embedded on the public tab, never uploaded or
        stored here. Removing one from this list does not delete it from YouTube.
      </p>

      {ids.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {ids.map((id, index) => (
            <li
              key={id}
              className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
            >
              <a
                href={`https://www.youtube.com/watch?v=${id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate rounded-xs font-mono text-xs text-accent underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {id}
                <span className="sr-only"> (opens on YouTube in a new tab)</span>
              </a>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove video ${index + 1}`}
                disabled={disabled}
                className="size-7 shrink-0"
                onClick={() => onChange(ids.filter((candidate) => candidate !== id))}
              >
                <X className="size-3.5" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <Input
          id={inputId}
          value={draft}
          disabled={disabled || ids.length >= MAX_VIDEOS}
          aria-invalid={Boolean(error)}
          aria-describedby={errorId}
          placeholder="https://www.youtube.com/watch?v=…"
          onChange={(event) => {
            setDraft(event.target.value);
            setError(undefined);
          }}
          onKeyDown={(event) => {
            // Enter inside this input must add the video, not submit the whole event form —
            // a half-typed URL would otherwise save the event the moment you pressed Return.
            if (event.key === 'Enter') {
              event.preventDefault();
              addDraft();
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={disabled || draft.trim() === '' || ids.length >= MAX_VIDEOS}
          onClick={addDraft}
        >
          <Plus className="size-4" aria-hidden="true" />
          Add
        </Button>
      </div>

      {error && (
        <p
          id={errorId}
          role="alert"
          aria-live="polite"
          className="text-xs font-medium text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}
