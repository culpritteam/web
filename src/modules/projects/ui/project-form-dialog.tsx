'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { z } from 'zod';
import { useRouter } from 'next/navigation';
import { apiSend } from '@/modules/shared/lib/api-client';
import { Dialog, DialogFooter } from '@/modules/shared/ui/dialog';
import { Button } from '@/modules/shared/ui/button';
import { Input } from '@/modules/shared/ui/input';
import { Textarea } from '@/modules/shared/ui/textarea';
import { FormField } from '@/modules/shared/ui/form-field';
// Deep, module-internal imports (not the barrel): `@/modules/projects`'s index also re-exports the
// container, whose composition root imports the Prisma repository (`pg`/`fs`, Node-only). A Client
// Component importing that barrel — even type-only — drags Prisma into the browser bundle and
// fails to resolve `fs` at build time.
import type { Project } from '../project.types';
import { createProjectSchema, type CreateProjectInput } from '../project.schema';

// `sortOrder` uses `z.coerce.number()`, whose *input* type is wider than its output, so RHF's
// 3-generic `useForm<Input, Context, Output>` keeps the raw field loosely typed while
// `handleSubmit`'s callback still receives the fully-validated `CreateProjectInput`.
type ProjectFormInput = z.input<typeof createProjectSchema>;

function submitProject(id: string | undefined, input: CreateProjectInput) {
  // The owner is fixed at creation; the update schema has no `teamMemberId`, and an undefined key
  // is dropped from the JSON body.
  return id
    ? apiSend<Project>('PUT', `/api/admin/projects/${id}`, { ...input, teamMemberId: undefined })
    : apiSend<Project>('POST', '/api/admin/projects', input);
}

export function ProjectFormDialog({
  teamMemberId,
  open,
  onOpenChange,
  project,
}: {
  /** The member whose profile this project belongs to. */
  teamMemberId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present for edit; absent for create. */
  project?: Project;
}) {
  const router = useRouter();
  const isEdit = Boolean(project);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ProjectFormInput, unknown, CreateProjectInput>({
    resolver: zodResolver(createProjectSchema),
    values: {
      teamMemberId,
      title: project?.title ?? '',
      summary: project?.summary ?? '',
      link: project?.link ?? '',
      sortOrder: project?.sortOrder ?? 0,
    },
  });

  const mutation = useMutation({
    mutationFn: (input: CreateProjectInput) => submitProject(project?.id, input),
    onSuccess: () => {
      toast.success(isEdit ? 'Changes saved.' : 'Created.');
      onOpenChange(false);
      reset();
      router.refresh();
    },
    onError: () => {
      toast.error(
        isEdit ? 'Something went wrong. Please try again.' : 'Could not create. Please try again.',
      );
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Edit project' : 'Add project'}
      closeLabel="Close"
    >
      <form
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
        noValidate
        className="flex flex-col gap-4"
      >
        <FormField label="Title" htmlFor="project-title" required error={errors.title?.message}>
          {(fieldProps) => <Input {...fieldProps} autoComplete="off" {...register('title')} />}
        </FormField>

        <FormField
          label="Summary"
          htmlFor="project-summary"
          required
          description="A short paragraph on what it is and what the member did."
          error={errors.summary?.message}
        >
          {(fieldProps) => <Textarea {...fieldProps} {...register('summary')} rows={4} />}
        </FormField>

        <FormField
          label="Project link"
          htmlFor="project-link"
          description="Optional. A repository, demo or write-up."
          error={errors.link?.message}
        >
          {(fieldProps) => (
            <Input {...fieldProps} type="url" {...register('link')} placeholder="https://…" />
          )}
        </FormField>

        <FormField
          label="Sort order"
          htmlFor="project-sortOrder"
          description="Lower numbers appear first on the public profile."
          error={errors.sortOrder?.message}
        >
          {(fieldProps) => (
            <Input
              {...fieldProps}
              type="number"
              min={0}
              inputMode="numeric"
              className="w-28"
              {...register('sortOrder', { valueAsNumber: true })}
            />
          )}
        </FormField>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting || mutation.isPending}>
            Save changes
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
