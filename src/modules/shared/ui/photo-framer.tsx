'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ZoomIn } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/modules/shared/ui/button';
import { Label } from '@/modules/shared/ui/label';

// The drag-and-zoom framing step, shared by every admin photo control: the profile form, the
// team-member dialog (both via `PhotoUpload`) and the event gallery.
//
// Every photo this app stores is displayed inside a square — an avatar, or a tile in the public
// event gallery — and an unframed portrait gets centre-cropped by `object-cover` with no say in
// which part survives, so heads end up out of frame. The admin picks the square instead, and the
// square that gets uploaded is exactly the square that will be displayed.
//
// Framing also removes the need for a separate downscale step: the canvas output is always
// `outputSize` square re-encoded as JPEG, which lands far under the routes' 4 MB cap however large
// the original was. A phone photo can be picked straight off the camera roll.

export const FRAMER_ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp,image/gif';

/** Edge of the on-screen framing viewport, in px. */
const VIEWPORT = 224;
const MAX_ZOOM = 3;

type Source = { src: string; width: number; height: number };

export interface PhotoFramerProps {
  /** The picked file. Decoded here; an undecodable one is reported and cancelled. */
  file: File;
  /** Edge of the uploaded square, in px. */
  outputSize: number;
  /** Called with the cropped JPEG. May be async — the buttons stay disabled while it settles. */
  onConfirm: (blob: Blob) => void | Promise<void>;
  onCancel: () => void;
  /** Extra context above the frame, e.g. "Photo 2 of 5" when a batch is being framed. */
  caption?: string;
  className?: string;
}

export function PhotoFramer({
  file,
  outputSize,
  onConfirm,
  onCancel,
  caption,
  className,
}: PhotoFramerProps) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  // Object URLs are a resource, not a string — revoked when this file's framing ends so picking
  // several photos in a row doesn't leak one blob per attempt.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    let live = true;
    const probe = new window.Image();
    probe.onload = () => {
      if (!live) return;
      setSource({ src: url, width: probe.naturalWidth, height: probe.naturalHeight });
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    probe.onerror = () => {
      if (!live) return;
      // Undecodable in this browser (a HEIC straight off an iPhone, everywhere but Safari).
      toast.error('That file could not be read as an image.');
      onCancel();
    };
    probe.src = url;
    return () => {
      live = false;
      URL.revokeObjectURL(url);
    };
    // Keyed on the file only: a caller passing an inline onCancel must not re-run the decode and
    // revoke the object URL out from under the <img>.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  /** Display px per source px at zoom 1: the scale that just covers the square viewport. */
  const baseScale = source ? VIEWPORT / Math.min(source.width, source.height) : 1;

  /**
   * Keep the image covering the viewport. Without this the photo can be dragged away from the
   * frame, leaving transparent edges that then get baked into the upload.
   */
  const clamp = useCallback(
    (next: { x: number; y: number }, atZoom: number) => {
      if (!source) return next;
      const scale = baseScale * atZoom;
      const limitX = Math.max(0, (source.width * scale - VIEWPORT) / 2);
      const limitY = Math.max(0, (source.height * scale - VIEWPORT) / 2);
      return {
        x: Math.min(limitX, Math.max(-limitX, next.x)),
        y: Math.min(limitY, Math.max(-limitY, next.y)),
      };
    },
    [source, baseScale],
  );

  async function confirm() {
    const image = imageRef.current;
    if (!source || !image) return;

    setBusy(true);
    try {
      // The visible frame, converted back to source-pixel coordinates. `left`/`top` are where the
      // scaled image sits relative to the viewport's origin, so negating them gives the crop box.
      const scale = baseScale * zoom;
      const left = VIEWPORT / 2 - (source.width * scale) / 2 + offset.x;
      const top = VIEWPORT / 2 - (source.height * scale) / 2 + offset.y;

      const canvas = document.createElement('canvas');
      canvas.width = outputSize;
      canvas.height = outputSize;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas unavailable');
      ctx.drawImage(
        image,
        -left / scale,
        -top / scale,
        VIEWPORT / scale,
        VIEWPORT / scale,
        0,
        0,
        outputSize,
        outputSize,
      );

      const blob = await new Promise<Blob | null>((resolve) =>
        // JPEG at 0.9: the output is a square crop, and re-encoding PNG screenshots as PNG was
        // producing multi-megabyte uploads that hit the route's 4 MB cap.
        canvas.toBlob(resolve, 'image/jpeg', 0.9),
      );
      if (!blob) throw new Error('encode failed');

      await onConfirm(blob);
    } catch {
      toast.error('Could not upload the photo. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function startDrag(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX - offset.x, y: event.clientY - offset.y };
  }

  function onDrag(event: React.PointerEvent<HTMLDivElement>) {
    const start = dragRef.current;
    if (!start) return;
    setOffset(clamp({ x: event.clientX - start.x, y: event.clientY - start.y }, zoom));
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
  }

  /** Arrow keys nudge the frame, so this is not drag-only. */
  function nudge(event: React.KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 20 : 5;
    const moves: Record<string, { x: number; y: number }> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    setOffset((current) => clamp({ x: current.x + move.x, y: current.y + move.y }, zoom));
  }

  const scale = baseScale * zoom;

  return (
    <div className={className}>
      <div className="flex flex-col gap-3">
        <Label>Frame the photo</Label>
        {caption && <p className="-mt-2 text-xs text-muted-foreground">{caption}</p>}
        <div
          role="application"
          aria-label="Drag to reposition, or use the arrow keys. Adjust the zoom slider to scale."
          tabIndex={0}
          onPointerDown={startDrag}
          onPointerMove={onDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={nudge}
          style={{ width: VIEWPORT, height: VIEWPORT }}
          className="relative cursor-grab touch-none overflow-hidden rounded-lg border border-border-strong bg-muted active:cursor-grabbing focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {source && (
            /* eslint-disable-next-line @next/next/no-img-element -- a local object URL being
               measured and drawn to a canvas; next/image would neither optimise nor allow it. */
            <img
              ref={imageRef}
              src={source.src}
              alt=""
              draggable={false}
              style={{
                position: 'absolute',
                left: VIEWPORT / 2 - (source.width * scale) / 2 + offset.x,
                top: VIEWPORT / 2 - (source.height * scale) / 2 + offset.y,
                width: source.width * scale,
                height: source.height * scale,
                maxWidth: 'none',
              }}
            />
          )}
        </div>

        <div className="flex items-center gap-3" style={{ width: VIEWPORT }}>
          <ZoomIn className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            aria-label="Zoom"
            disabled={!source}
            onChange={(e) => {
              const next = Number(e.target.value);
              setZoom(next);
              setOffset((current) => clamp(current, next));
            }}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-pill bg-muted accent-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        </div>

        <div className="flex gap-2">
          <Button size="sm" loading={busy} disabled={!source} onClick={confirm}>
            <Check className="size-4" aria-hidden="true" />
            Use photo
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
