'use client';

import { Controller, useForm } from 'react-hook-form';
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
import { BylineField, type BylinePerson } from '@/modules/shared/ui/byline-field';
import { FormField } from '@/modules/shared/ui/form-field';
// Deep, module-internal imports (not the barrel): `@/modules/research`'s index also re-exports
// `getResearchService`, whose composition root imports the Prisma repository (`pg`/`fs`, Node-only).
// A Client Component importing that barrel — even a type-only import, confirmed empirically —
// would drag Prisma into the browser bundle and fail to resolve `fs` at build time. The pure,
// side-effect-free `.types`/`.schema` files are safe to import directly.
import type { Research } from '../research.types';
import { createResearchSchema, type CreateResearchInput } from '../research.schema';

// `sortOrder` uses `z.coerce.number()`, whose *input* type (raw, pre-coercion) is `unknown` —
// wider than its *output* type (`number`). RHF's 3-generic `useForm<Input, Context, Output>`
// keeps the form's raw field values loosely typed for that field while `handleSubmit`'s callback
// still receives the fully-validated, correctly-typed `CreateResearchInput`.
type ResearchFormInput = z.input<typeof createResearchSchema>;

function submitResearch(id: string | undefined, input: CreateResearchInput) {
  return id
    ? apiSend<Research>('PUT', `/api/admin/research/${id}`, input)
    : apiSend<Research>('POST', '/api/admin/research', input);
}

export function ResearchFormDialog({
  open,
  onOpenChange,
  research,
  members,
  owner,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present for edit; absent for create. */
  research?: Research;
  /** Everyone who can be credited. Passed down from the server page — this dialog reads nothing. */
  members: BylinePerson[];
  /** How the professor is credited on her own work, from `Profile.citationName`. */
  owner?: { citationName: string } | null;
}) {
  const router = useRouter();
  const isEdit = Boolean(research);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ResearchFormInput, unknown, CreateResearchInput>({
    // The form always submits a fully-populated payload (controlled fields, not a partial patch),
    // so `createResearchSchema` (all fields required) validates both create and edit alike — it
    // matches what's actually sent even though the PUT route's own schema is `.partial()`.
    resolver: zodResolver(createResearchSchema),
    values: {
      title: research?.title ?? '',
      // Only the two fields that get sent back — sortOrder is re-derived from this array's order.
      contributors:
        research?.contributors.map(({ teamMemberId, name, isProfileOwner }) => ({
          teamMemberId,
          name,
          isProfileOwner,
        })) ?? [],
      summary: research?.summary ?? '',
      area: research?.area ?? '',
      link: research?.link ?? '',
      sortOrder: research?.sortOrder ?? 0,
    },
  });

  const mutation = useMutation({
    mutationFn: (input: CreateResearchInput) => submitResearch(research?.id, input),
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
      title={isEdit ? 'Edit research work' : 'Add research work'}
      closeLabel="Close"
    >
      <form
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
        noValidate
        className="flex flex-col gap-4"
      >
        <FormField
          label="Title"
          htmlFor="research-title"
          required
          description="The project name as it should appear on the public Research tab."
          error={errors.title?.message}
        >
          {(fieldProps) => <Input {...fieldProps} {...register('title')} />}
        </FormField>
        <FormField
          label="Area"
          htmlFor="research-area"
          required
          description="The field this sits in, shown as the running head beside the entry — for example “Access Control”."
          error={errors.area?.message}
        >
          {(fieldProps) => <Input {...fieldProps} {...register('area')} />}
        </FormField>
        <FormField
          label="Summary"
          htmlFor="research-summary"
          required
          description="A short paragraph describing the work. Plain text, no formatting."
          error={errors.summary?.message}
        >
          {(fieldProps) => <Textarea {...fieldProps} {...register('summary')} rows={4} />}
        </FormField>
        <FormField
          label="Project link"
          htmlFor="research-link"
          description="Optional. A tool listing, project page, or artefact repository."
          error={errors.link?.message}
        >
          {(fieldProps) => (
            <Input {...fieldProps} type="url" {...register('link')} placeholder="https://…" />
          )}
        </FormField>
        <Controller
          control={control}
          name="contributors"
          render={({ field }) => (
            <BylineField
              label="Contributors"
              description="Who worked on this. Leave empty for your own work — no names are shown."
              error={errors.contributors?.message ?? errors.contributors?.root?.message}
              value={field.value ?? []}
              onChange={field.onChange}
              members={members}
              owner={owner}
              externalLabel="Add an outside collaborator"
              emptyHint="No contributors listed — this will show as your own work."
            />
          )}
        />
        <FormField
          label="Sort order"
          htmlFor="research-sortOrder"
          description="Lower numbers appear first on the public tab."
          error={errors.sortOrder?.message}
        >
          {/* Sized to its content rather than stretched to the dialog width: a two-digit number in
              a full-width box reads as a text field and invites a sentence. */}
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
