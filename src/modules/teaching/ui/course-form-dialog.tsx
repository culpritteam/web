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
// Deep, module-internal imports (not the barrel): `@/modules/teaching`'s index also re-exports
// the container, whose composition root imports the Prisma repositories (`pg`/`fs`, Node-only).
// A Client Component importing that barrel — even a type-only import — drags Prisma into the
// browser bundle and fails to resolve `fs` at build time.
import type { Course } from '../teaching.types';
import { createCourseSchema, type CreateCourseInput } from '../teaching.schema';

// `sortOrder` uses `z.coerce.number()`, whose *input* type is wider than its output, so RHF's
// 3-generic `useForm<Input, Context, Output>` keeps the raw field loosely typed while
// `handleSubmit`'s callback still receives the fully-validated `CreateCourseInput`.
type CourseFormInput = z.input<typeof createCourseSchema>;

function submitCourse(id: string | undefined, input: CreateCourseInput) {
  // The owner is fixed at creation; the update schema has no `teamMemberId`, and an undefined key
  // is dropped from the JSON body.
  return id
    ? apiSend<Course>('PUT', `/api/admin/teaching/courses/${id}`, {
        ...input,
        teamMemberId: undefined,
      })
    : apiSend<Course>('POST', '/api/admin/teaching/courses', input);
}

export function CourseFormDialog({
  teamMemberId,
  open,
  onOpenChange,
  course,
}: {
  /** The member who teaches this course. */
  teamMemberId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present for edit; absent for create. */
  course?: Course;
}) {
  const router = useRouter();
  const isEdit = Boolean(course);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<CourseFormInput, unknown, CreateCourseInput>({
    resolver: zodResolver(createCourseSchema),
    values: {
      teamMemberId,
      code: course?.code ?? '',
      title: course?.title ?? '',
      level: course?.level ?? '',
      term: course?.term ?? '',
      description: course?.description ?? '',
      link: course?.link ?? '',
      sortOrder: course?.sortOrder ?? 0,
    },
  });

  const mutation = useMutation({
    mutationFn: (input: CreateCourseInput) => submitCourse(course?.id, input),
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
      title={isEdit ? 'Edit course' : 'Add course'}
      closeLabel="Close"
    >
      <form
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
        noValidate
        className="flex flex-col gap-4"
      >
        <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
          <FormField
            label="Code"
            htmlFor="course-code"
            description="Optional."
            error={errors.code?.message}
          >
            {(fieldProps) => <Input {...fieldProps} {...register('code')} placeholder="CS 4235" />}
          </FormField>
          <FormField label="Title" htmlFor="course-title" required error={errors.title?.message}>
            {(fieldProps) => <Input {...fieldProps} {...register('title')} />}
          </FormField>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Level"
            htmlFor="course-level"
            required
            description="The running head this course is grouped under — for example “Undergraduate”."
            error={errors.level?.message}
          >
            {(fieldProps) => <Input {...fieldProps} {...register('level')} />}
          </FormField>
          <FormField
            label="Term"
            htmlFor="course-term"
            description="Optional. For example “Fall 2025”."
            error={errors.term?.message}
          >
            {(fieldProps) => <Input {...fieldProps} {...register('term')} />}
          </FormField>
        </div>

        <FormField
          label="Description"
          htmlFor="course-description"
          description="Optional. A short paragraph on what the course covers."
          error={errors.description?.message}
        >
          {(fieldProps) => <Textarea {...fieldProps} {...register('description')} rows={4} />}
        </FormField>

        <FormField
          label="Course link"
          htmlFor="course-link"
          description="Optional. A syllabus or course page."
          error={errors.link?.message}
        >
          {(fieldProps) => (
            <Input {...fieldProps} type="url" {...register('link')} placeholder="https://…" />
          )}
        </FormField>

        <FormField
          label="Sort order"
          htmlFor="course-sortOrder"
          description="Lower numbers appear first. The first course in a level fixes where that level sits on the page."
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
