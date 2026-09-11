'use client';

import { useId, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { Button } from './button';
import { EmptyState } from './empty-state';
import { Input } from './input';

// A controlled, ordered list of credited names — publication authors and research contributors
// both use it.
//
// Nothing here persists. It is a plain form control that reports every change through `onChange`,
// so the parent form's Save writes the list in the same request as the rest of the record and
// Cancel discards it along with everything else.
//
// Every row is a typed name (ADR-016). The public site links a name to a member profile when it
// matches that member's name or name-on-papers, so the admin is offered those as suggestions
// through a native datalist rather than a separate picker.
//
// It labels itself with a fieldset/legend rather than sitting inside a `FormField`: the group
// holds an input, a button and a list of rows, not one control a `<label for>` could point at.

export type BylineEntry = { name: string };

export function BylineField({
  value,
  onChange,
  suggestions = [],
  label,
  description,
  error,
  inputLabel = 'Add a name',
  placeholder = 'Name as it appears on the paper',
  emptyHint,
  disabled = false,
}: {
  value: BylineEntry[];
  onChange: (value: BylineEntry[]) => void;
  /** Lab member names and names-on-papers, offered while typing. */
  suggestions?: readonly string[];
  label: string;
  description?: string;
  error?: string;
  inputLabel?: string;
  placeholder?: string;
  /** Shown in place of the list while it is empty — say what empty MEANS, not that it is empty. */
  emptyHint: string;
  disabled?: boolean;
}) {
  const id = useId();
  const listId = `${id}-suggestions`;
  const descriptionId = description ? `${id}-description` : undefined;
  const [draft, setDraft] = useState('');

  const add = () => {
    const name = draft.trim();
    if (!name) return;
    onChange([...value, { name }]);
    setDraft('');
  };

  const removeAt = (index: number) => onChange(value.filter((_, i) => i !== index));

  /** Swap with the neighbour. The array order IS the stored order, so this is the whole feature. */
  const moveBy = (index: number, delta: number) => {
    const next = [...value];
    const target = index + delta;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <fieldset className="flex min-w-0 flex-col gap-3" aria-describedby={descriptionId}>
      <legend className="text-sm font-medium text-foreground">{label}</legend>
      {description && (
        <p id={descriptionId} className="text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}

      <div className="flex gap-2">
        <Input
          aria-label={inputLabel}
          value={draft}
          list={listId}
          placeholder={placeholder}
          autoComplete="off"
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter would otherwise submit the whole record while the list is still being built.
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <datalist id={listId}>
          {suggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <Button type="button" variant="outline" disabled={disabled || !draft.trim()} onClick={add}>
          <Plus className="size-4" aria-hidden="true" />
          Add
        </Button>
      </div>

      {value.length === 0 ? (
        <EmptyState title={emptyHint} className="px-5 py-6" />
      ) : (
        <ol className="flex flex-col">
          {value.map((entry, index) => (
            <li
              key={`${entry.name}-${index}`}
              className="flex items-center gap-2 border-t border-border py-2 first:border-t-0"
            >
              <span
                aria-hidden="true"
                className="tabular w-6 shrink-0 font-mono text-xs text-muted-foreground"
              >
                {index + 1}
              </span>
              <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                {entry.name}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Move ${entry.name} up`}
                disabled={disabled || index === 0}
                onClick={() => moveBy(index, -1)}
              >
                <ChevronUp className="size-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Move ${entry.name} down`}
                disabled={disabled || index === value.length - 1}
                onClick={() => moveBy(index, 1)}
              >
                <ChevronDown className="size-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${entry.name}`}
                className="text-destructive hover:bg-destructive/10"
                disabled={disabled}
                onClick={() => removeAt(index)}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ol>
      )}

      {error && (
        <p role="alert" aria-live="polite" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}
