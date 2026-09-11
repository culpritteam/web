'use client';

import { useState } from 'react';
import { Plus, FlaskConical } from 'lucide-react';
import { useDeleteRecord } from '@/modules/shared/lib/use-delete-record';
import { Button } from '@/modules/shared/ui/button';
import { EmptyState } from '@/modules/shared/ui/empty-state';
import { ConfirmDialog } from '@/modules/shared/ui/confirm-dialog';
import { RowActions } from '@/modules/shared/ui/row-actions';
import { FormSection, FormSectionCount } from '@/modules/shared/ui/form-section';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/ui/table';
// Deep import, not the barrel — see research-form-dialog.tsx's comment.
import type { Research } from '../research.types';
import { ResearchFormDialog } from './research-form-dialog';

export function ResearchTable({
  items,
  suggestions = [],
}: {
  items: Research[];
  /** Lab member names offered in the byline field. Defaults to none so the table renders alone. */
  suggestions?: readonly string[];
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Research | undefined>(undefined);

  const remove = useDeleteRecord<Research>((id) => `/api/admin/research/${id}`);

  return (
    <div id="works" className="scroll-mt-24">
      <FormSection
        title="Research works"
        description="The list on the public Research tab, ordered by the sort order below."
        badge={<FormSectionCount count={items.length} />}
        action={
          <Button
            aria-label="Add research work"
            onClick={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
          >
            <Plus className="size-4" aria-hidden="true" />
            Add
          </Button>
        }
      >
        {items.length === 0 ? (
          <EmptyState
            icon={FlaskConical}
            title="No research works yet."
            description="Add the first research work to show it on the public site."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Area</TableHead>
                <TableHead>Order</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="min-w-0 font-medium text-foreground">
                    {/* User-entered text: bounded and wrapped, or one long unbroken title stretches
                      the table past its container. */}
                    <span className="line-clamp-2 block max-w-[46ch] break-words">
                      {item.title}
                    </span>
                  </TableCell>
                  <TableCell className="min-w-0 text-muted-foreground">
                    <span className="block max-w-[22ch] truncate" title={item.area}>
                      {item.area}
                    </span>
                  </TableCell>
                  <TableCell className="tabular text-muted-foreground">{item.sortOrder}</TableCell>
                  <TableCell className="text-right">
                    <RowActions
                      editLabel={`Edit: ${item.title}`}
                      deleteLabel={`Delete: ${item.title}`}
                      onEdit={() => {
                        setEditing(item);
                        setFormOpen(true);
                      }}
                      onDelete={() => remove.request(item)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </FormSection>

      <ResearchFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        research={editing}
        suggestions={suggestions}
      />

      <ConfirmDialog
        {...remove.dialogProps}
        title="Delete this item?"
        description="This action cannot be undone."
      />
    </div>
  );
}
