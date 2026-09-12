'use client';

import { Trash2 } from 'lucide-react';
import { Button } from './button';

/**
 * `RowActions` minus Edit, for rows that may still be removed but no longer edited — a CV entry or
 * a course a member kept when their team changed (ADR-017). Offering an edit form for a row the
 * server will reject is worse than offering nothing, and deleting has to stay possible or the only
 * way to clear the row would be to move the member back.
 *
 * Same label convention as `RowActions`: the record is named in the button, not just the verb.
 */
export function DeleteOnlyAction({ label, onDelete }: { label: string; onDelete: () => void }) {
  return (
    <div className="flex justify-end">
      <Button
        variant="ghost"
        size="icon"
        aria-label={label}
        className="text-destructive hover:bg-destructive/10"
        onClick={onDelete}
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
