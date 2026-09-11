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
import { Select } from '@/modules/shared/ui/select';
import { Textarea } from '@/modules/shared/ui/textarea';
import { FormField } from '@/modules/shared/ui/form-field';
// Deep imports, not the barrel — see course-form-dialog.tsx's comment.
import { CV_SECTIONS, CV_SECTION_LABELS, type CvEntry, type CvSection } from '../teaching.types';
import { createCvEntrySchema, type CreateCvEntryInput } from '../teaching.schema';

type CvEntryFormInput = z.input<typeof createCvEntrySchema>;

function submitEntry(id: string | undefined, input: CreateCvEntryInput) {
  // The owner is fixed at creation; the update schema has no `teamMemberId`, and an undefined key
  // is dropped from the JSON body.
  return id
    ? apiSend<CvEntry>('PUT', `/api/admin/teaching/entries/${id}`, {
        ...input,
        teamMemberId: undefined,
      })
    : apiSend<CvEntry>('POST', '/api/admin/teaching/entries', input);
}

export function CvEntryFormDialog({
  teamMemberId,
  open,
  onOpenChange,
  entry,
  defaultSection,
}: {
  /** The member whose profile this entry belongs to. */
  teamMemberId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present for edit; absent for create. */
  entry?: CvEntry;
  /** Preselected section when adding from a specific list. */
  defaultSection?: CvSection;
}) {
  const router = useRouter();
  const isEdit = Boolean(entry);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<CvEntryFormInput, unknown, CreateCvEntryInput>({
    resolver: zodResolver(createCvEntrySchema),
    values: {
      teamMemberId,
      section: entry?.section ?? defaultSection ?? 'education',
      title: entry?.title ?? '',
      subtitle: entry?.subtitle ?? '',
      year: entry?.year ?? '',
      description: entry?.description ?? '',
      sortOrder: entry?.sortOrder ?? 0,
    },
  });

  const mutation = useMutation({
    mutationFn: (input: CreateCvEntryInput) => submitEntry(entry?.id, input),
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
      title={isEdit ? 'Edit entry' : 'Add entry'}
      closeLabel="Close"
    >
      <form
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
        noValidate
        className="flex flex-col gap-4"
      >
        <FormField
          label="List"
          htmlFor="cv-section"
          required
          description="Which list on the member's profile this belongs to."
          error={errors.section?.message}
        >
          {(fieldProps) => (
            <Select {...fieldProps} {...register('section')}>
              {CV_SECTIONS.map((section) => (
                <option key={section} value={section}>
                  {CV_SECTION_LABELS[section]}
                </option>
              ))}
            </Select>
          )}
        </FormField>

        <FormField label="Title" htmlFor="cv-title" required error={errors.title?.message}>
          {(fieldProps) => <Input {...fieldProps} {...register('title')} />}
        </FormField>

        <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <FormField
            label="Subtitle"
            htmlFor="cv-subtitle"
            description="Optional. The institution, award body, or venue."
            error={errors.subtitle?.message}
          >
            {(fieldProps) => <Input {...fieldProps} {...register('subtitle')} />}
          </FormField>
          <FormField
            label="Year"
            htmlFor="cv-year"
            // Free text on purpose — a range or "present" is as common as a single year.
            description="Optional. A year, a range, or “present”."
            error={errors.year?.message}
          >
            {(fieldProps) => (
              <Input {...fieldProps} {...register('year')} placeholder="2019–2023" />
            )}
          </FormField>
        </div>

        <FormField
          label="Description"
          htmlFor="cv-description"
          description="Optional. One or two sentences."
          error={errors.description?.message}
        >
          {(fieldProps) => <Textarea {...fieldProps} {...register('description')} rows={3} />}
        </FormField>

        <FormField
          label="Sort order"
          htmlFor="cv-sortOrder"
          description="Lower numbers appear first. Counted within this list only."
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
