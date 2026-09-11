'use client';

import { useState } from 'react';
import { ExternalLink, Plus, FileText } from 'lucide-react';
import { useDeleteRecord } from '@/modules/shared/lib/use-delete-record';
import { Button } from '@/modules/shared/ui/button';
import { FormSection, FormSectionCount } from '@/modules/shared/ui/form-section';
import { EmptyState } from '@/modules/shared/ui/empty-state';
import { ConfirmDialog } from '@/modules/shared/ui/confirm-dialog';
import { RowActions } from '@/modules/shared/ui/row-actions';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/ui/table';
// Deep import, not the barrel — see publication-form-dialog.tsx's comment.
import type { Publication } from '../publication.types';
import { PublicationFormDialog } from './publication-form-dialog';

export function PublicationsTable({
  items,
  suggestions = [],
}: {
  items: Publication[];
  /** Lab member names offered in the byline field. Defaults to none so the table renders alone. */
  suggestions?: readonly string[];
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Publication | undefined>(undefined);

  const remove = useDeleteRecord<Publication>((id) => `/api/admin/publications/${id}`);

  return (
    <div id="publications" className="scroll-mt-24">
      <FormSection
        title="Publications"
        description="Every peer-reviewed entry on the public Publications tab, newest year first."
        badge={<FormSectionCount count={items.length} />}
        action={
          <Button
            aria-label="Add publication"
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
            icon={FileText}
            title="No publications yet."
            description="Add the first publication to show it on the public site."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Venue</TableHead>
                <TableHead>Year</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium text-foreground">
                    {item.link ? (
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 hover:text-accent hover:underline"
                      >
                        {item.title}
                        <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
                      </a>
                    ) : (
                      item.title
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{item.venue}</TableCell>
                  <TableCell className="text-muted-foreground">{item.year}</TableCell>
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

      <PublicationFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        publication={editing}
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
