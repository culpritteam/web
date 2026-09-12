'use client';

import { useState } from 'react';
import { Hammer, Plus } from 'lucide-react';
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
// Deep imports, not the barrel — see project-form-dialog.tsx's comment.
import type { Project } from '../project.types';
import { ProjectFormDialog } from './project-form-dialog';

// The projects section of a member's admin page, alongside their CV lists and courses. Every team
// may have projects (ADR-017), so there is no per-team gate here.

export function ProjectsAdmin({
  teamMemberId,
  projects,
}: {
  /** The member whose profile these projects belong to. */
  teamMemberId: string;
  projects: Project[];
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Project | undefined>(undefined);

  const remove = useDeleteRecord<Project>((id) => `/api/admin/projects/${id}`);

  return (
    <div id="projects" className="scroll-mt-24">
      <FormSection
        title="Projects"
        description="Shown on the member's public profile, in sort order."
        badge={<FormSectionCount count={projects.length} />}
        action={
          <Button
            aria-label="Add project"
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
        {projects.length === 0 ? (
          <EmptyState
            icon={Hammer}
            title="No projects yet."
            description="Add the first project to show it on the public profile."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Link</TableHead>
                <TableHead>Order</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => (
                <TableRow key={project.id}>
                  <TableCell className="min-w-0 font-medium text-foreground">
                    {/* User-entered text: bounded and wrapped, or one long unbroken title
                        stretches the table past its container. */}
                    <span className="line-clamp-2 block max-w-[46ch] break-words">
                      {project.title}
                    </span>
                    <span className="mt-0.5 line-clamp-2 block max-w-[46ch] break-words text-xs font-normal text-muted-foreground">
                      {project.summary}
                    </span>
                  </TableCell>
                  <TableCell className="min-w-0 text-muted-foreground">
                    {project.link ? (
                      <span className="block max-w-[24ch] truncate" title={project.link}>
                        {project.link}
                      </span>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="tabular text-muted-foreground">
                    {project.sortOrder}
                  </TableCell>
                  <TableCell className="text-right">
                    <RowActions
                      editLabel={`Edit project: ${project.title}`}
                      deleteLabel={`Delete project: ${project.title}`}
                      onEdit={() => {
                        setEditing(project);
                        setFormOpen(true);
                      }}
                      onDelete={() => remove.request(project)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </FormSection>

      <ProjectFormDialog
        teamMemberId={teamMemberId}
        open={formOpen}
        onOpenChange={setFormOpen}
        project={editing}
      />

      <ConfirmDialog
        {...remove.dialogProps}
        title="Delete this project?"
        description="It is removed from the public profile. This action cannot be undone."
      />
    </div>
  );
}
