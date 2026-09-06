'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2, UserPlus } from 'lucide-react';
import { Button } from './button';
import { EmptyState } from './empty-state';
import { Input } from './input';
import { Select } from './select';

// A controlled, ordered list of credited people — publication authors and research contributors
// both use it.
//
// Unlike the event-participants dialog this was lifted from, nothing here persists. It is a plain
// form control: it holds no mutation, no toast and no router, and reports every change through
// `onChange` so the parent form's Save writes the list in the same request as the rest of the
// record. That is deliberate — a byline is part of the thing it is a byline for, so Cancel has to
// discard it along with everything else.
//
// Two kinds of row, one list. A row with a `teamMemberId` is one of the site's own people, picked
// rather than typed; a row without one is an outside collaborator who exists only as a name. The
// name is captured either way, because it is what gets stored and rendered from then on.
//
// It labels itself with a fieldset/legend rather than sitting inside a `FormField`. There is no
// single input a `<label for>` could point at — the group holds two pickers and a row of buttons —
// and a label aimed at nothing is worse than no label: it announces a control that isn't there.

export type BylinePerson = { id: string; name: string; role: string };
export type BylineEntry = { teamMemberId?: string | null; name: string };

export function BylineField({
  value,
  onChange,
  members,
  label,
  description,
  error,
  memberLabel = 'Add a team member',
  externalLabel = 'Add someone else',
  externalPlaceholder = 'Full name',
  emptyHint,
  disabled = false,
}: {
  value: BylineEntry[];
  onChange: (value: BylineEntry[]) => void;
  members: BylinePerson[];
  label: string;
  description?: string;
  error?: string;
  memberLabel?: string;
  externalLabel?: string;
  externalPlaceholder?: string;
  /** Shown in place of the list while it is empty — say what empty MEANS, not that it is empty. */
  emptyHint: string;
  disabled?: boolean;
}) {
  const [memberId, setMemberId] = useState('');
  const [externalName, setExternalName] = useState('');

  // Already-credited people are dropped from the picker rather than offered and then rejected.
  const credited = new Set(value.map((entry) => entry.teamMemberId).filter(Boolean));
  const selectable = members.filter((member) => !credited.has(member.id));

  const addMember = () => {
    const member = members.find((candidate) => candidate.id === memberId);
    if (!member) return;
    onChange([...value, { teamMemberId: member.id, name: member.name }]);
    setMemberId('');
  };

  const addExternal = () => {
    const name = externalName.trim();
    if (!name) return;
    onChange([...value, { teamMemberId: null, name }]);
    setExternalName('');
  };

  const removeAt = (index: number) => onChange(value.filter((_, i) => i !== index));

  /** Swap with the neighbour. The array order IS the stored order, so this is the whole feature. */
  const moveBy = (index: number, delta: number) => {
    const next = [...value];
    const target = index + delta;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const descriptionId = description ? `${label}-description` : undefined;

  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="text-sm font-medium text-foreground">{label}</legend>
      {description && (
        <p id={descriptionId} className="text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">{memberLabel}</span>
          <div className="flex gap-2">
            <Select
              aria-label={memberLabel}
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              disabled={disabled || selectable.length === 0}
            >
              <option value="">
                {members.length === 0
                  ? 'No team members yet'
                  : selectable.length === 0
                    ? 'Everyone is already credited'
                    : 'Choose someone…'}
              </option>
              {selectable.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} — {member.role}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              variant="outline"
              disabled={disabled || !memberId}
              onClick={addMember}
            >
              <UserPlus className="size-4" aria-hidden="true" />
              Add
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">{externalLabel}</span>
          <div className="flex gap-2">
            <Input
              aria-label={externalLabel}
              value={externalName}
              placeholder={externalPlaceholder}
              disabled={disabled}
              onChange={(e) => setExternalName(e.target.value)}
              onKeyDown={(e) => {
                // Enter inside a field of the surrounding form would otherwise submit the whole
                // record while the admin is still building the list.
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addExternal();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={disabled || !externalName.trim()}
              onClick={addExternal}
            >
              <Plus className="size-4" aria-hidden="true" />
              Add
            </Button>
          </div>
        </div>
      </div>

      {value.length === 0 ? (
        <EmptyState title={emptyHint} className="px-5 py-6" />
      ) : (
        <ul className="flex flex-col">
          {value.map((entry, index) => (
            <li
              key={`${entry.teamMemberId ?? 'external'}-${index}`}
              className="flex items-center gap-2 border-t border-border py-2 first:border-t-0"
            >
              <span className="tabular w-6 shrink-0 font-mono text-xs text-muted-foreground">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{entry.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {entry.teamMemberId ? 'Team member' : 'External'}
                </p>
              </div>
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
        </ul>
      )}

      {error && (
        <p role="alert" aria-live="polite" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}
