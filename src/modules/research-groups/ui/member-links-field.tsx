'use client';

import { useId } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/modules/shared/ui/button';
import { EmptyState } from '@/modules/shared/ui/empty-state';
import { Input } from '@/modules/shared/ui/input';

// A controlled, ordered list of a member's external links — "GitHub", "ORCID", a portfolio,
// whatever the admin types. The same repeatable-row control `BylineField` is, with two inputs per
// row instead of one typed value, because a link is a pair and both halves stay editable after the
// row exists (a URL is the field people paste wrong and come back to fix).
//
// Nothing here persists. It reports every change through `onChange`, so the member dialog's Save
// writes the whole list in the same request as the rest of the record and Cancel discards it.
// The array order IS the stored order (`sortOrder` is assigned from it server-side).
//
// Labelled with a fieldset/legend rather than a `FormField`: the group holds several controls, not
// one control a `<label for>` could point at.

export type MemberLinkRow = { label: string; url: string };

/** Per-row validation messages, positionally aligned with `value`. */
export type MemberLinkRowError = { label?: string; url?: string };

/** ADR-017 / the Zod schema: at most 20 rows. Enforced here so the server never has to say no. */
export const MAX_MEMBER_LINKS = 20;

export function MemberLinksField({
  value,
  onChange,
  errors = [],
  disabled = false,
}: {
  value: MemberLinkRow[];
  onChange: (value: MemberLinkRow[]) => void;
  errors?: (MemberLinkRowError | undefined)[];
  disabled?: boolean;
}) {
  const id = useId();
  const descriptionId = `${id}-description`;
  const atLimit = value.length >= MAX_MEMBER_LINKS;

  const add = () => onChange([...value, { label: '', url: '' }]);
  const removeAt = (index: number) => onChange(value.filter((_, i) => i !== index));

  const updateAt = (index: number, patch: Partial<MemberLinkRow>) =>
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  /** Swap with the neighbour — the whole reordering feature, as in `BylineField`. */
  const moveBy = (index: number, delta: number) => {
    const next = [...value];
    const target = index + delta;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <fieldset className="flex min-w-0 flex-col gap-3" aria-describedby={descriptionId}>
      <legend className="text-sm font-medium text-foreground">Links</legend>
      <p id={descriptionId} className="text-xs leading-relaxed text-muted-foreground">
        External profiles shown under the bio, in this order. The label is whatever you type:
        “GitHub”, “ORCID”, “Personal site”. Up to {MAX_MEMBER_LINKS}.
      </p>

      {value.length === 0 ? (
        <EmptyState title="No links yet. Nothing is shown under the bio." className="px-5 py-6" />
      ) : (
        <ol className="flex flex-col">
          {value.map((row, index) => {
            // A row is identified to a screen reader by its label as soon as there is one, so the
            // buttons say "Remove GitHub" rather than "Remove link 2" (WCAG 2.4.6).
            const rowName = row.label.trim() || `link ${index + 1}`;
            const rowError = errors[index];
            const labelErrorId = rowError?.label ? `${id}-${index}-label-error` : undefined;
            const urlErrorId = rowError?.url ? `${id}-${index}-url-error` : undefined;

            return (
              <li
                key={index}
                className="flex flex-wrap items-start gap-2 border-t border-border py-2 first:border-t-0"
              >
                <span
                  aria-hidden="true"
                  className="tabular w-6 shrink-0 pt-2.5 font-mono text-xs text-muted-foreground"
                >
                  {index + 1}
                </span>

                <div className="flex min-w-[9rem] flex-1 flex-col gap-1">
                  <Input
                    aria-label={`Link ${index + 1} label`}
                    aria-invalid={Boolean(rowError?.label)}
                    aria-describedby={labelErrorId}
                    value={row.label}
                    placeholder="GitHub"
                    autoComplete="off"
                    disabled={disabled}
                    onChange={(e) => updateAt(index, { label: e.target.value })}
                  />
                  {rowError?.label && (
                    <p id={labelErrorId} role="alert" className="text-xs text-destructive">
                      {rowError.label}
                    </p>
                  )}
                </div>

                <div className="flex min-w-[12rem] flex-[2] flex-col gap-1">
                  <Input
                    type="url"
                    aria-label={`Link ${index + 1} URL`}
                    aria-invalid={Boolean(rowError?.url)}
                    aria-describedby={urlErrorId}
                    value={row.url}
                    placeholder="https://…"
                    autoComplete="off"
                    disabled={disabled}
                    onChange={(e) => updateAt(index, { url: e.target.value })}
                  />
                  {rowError?.url && (
                    <p id={urlErrorId} role="alert" className="text-xs text-destructive">
                      {rowError.url}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Move ${rowName} up`}
                    disabled={disabled || index === 0}
                    onClick={() => moveBy(index, -1)}
                  >
                    <ChevronUp className="size-4" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Move ${rowName} down`}
                    disabled={disabled || index === value.length - 1}
                    onClick={() => moveBy(index, 1)}
                  >
                    <ChevronDown className="size-4" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${rowName}`}
                    className="text-destructive hover:bg-destructive/10"
                    disabled={disabled}
                    onClick={() => removeAt(index)}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" disabled={disabled || atLimit} onClick={add}>
          <Plus className="size-4" aria-hidden="true" />
          Add link
        </Button>
        {/* Said in text, not only by the disabled button, so the reason is available to everyone. */}
        {atLimit && (
          <p role="status" className="text-xs text-muted-foreground">
            {MAX_MEMBER_LINKS} links is the maximum. Remove one to add another.
          </p>
        )}
      </div>
    </fieldset>
  );
}
