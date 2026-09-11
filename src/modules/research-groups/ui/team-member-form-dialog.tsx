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
import { PhotoUpload } from '@/modules/shared/ui/photo-upload';
// Deep, module-internal imports — see the equivalent comment in research-form-dialog.tsx (the
// barrel also re-exports Prisma-backed service getters; even a type-only barrel import drags
// Prisma/`pg` into the client bundle, confirmed empirically).
import type { TeamMember } from '../team-member.types';
import { createTeamMemberSchema, type CreateTeamMemberInput } from '../team-member.schema';

type TeamMemberFormInput = z.input<typeof createTeamMemberSchema>;

function submitTeamMember(id: string | undefined, input: CreateTeamMemberInput) {
  return id
    ? apiSend<TeamMember>('PUT', `/api/admin/team-members/${id}`, input)
    : apiSend<TeamMember>('POST', '/api/admin/team-members', input);
}

export function TeamMemberFormDialog({
  open,
  onOpenChange,
  member,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member?: TeamMember;
}) {
  const router = useRouter();
  const isEdit = Boolean(member);

  // An untouched photo holds `''`, which would reach `httpUrl` and fail validation for an admin who
  // simply leaves it blank. Normalizing here, right before `zodResolver`, covers every case.
  const zodValidate = zodResolver(createTeamMemberSchema);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<TeamMemberFormInput, unknown, CreateTeamMemberInput>({
    resolver: (values, context, options) =>
      zodValidate(
        {
          ...values,
          photoUrl: values.photoUrl === '' ? undefined : values.photoUrl,
        },
        context,
        options,
      ),
    values: {
      name: member?.name ?? '',
      role: member?.role ?? '',
      citationName: member?.citationName ?? '',
      affiliation: member?.affiliation ?? '',
      bio: member?.bio ?? '',
      photoUrl: member?.photoUrl ?? '',
      linkedinUrl: member?.linkedinUrl ?? '',
      googleScholarUrl: member?.googleScholarUrl ?? '',
      isDirector: member?.isDirector ?? false,
      sortOrder: member?.sortOrder ?? 0,
    },
  });

  const mutation = useMutation({
    mutationFn: (input: CreateTeamMemberInput) => submitTeamMember(member?.id, input),
    onSuccess: () => {
      toast.success(isEdit ? 'Changes saved.' : 'Created.');
      onOpenChange(false);
      reset();
      router.refresh();
    },
    onError: () =>
      toast.error(
        isEdit ? 'Something went wrong. Please try again.' : 'Could not create. Please try again.',
      ),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Edit team member' : 'Add team member'}
      closeLabel="Close"
    >
      <form
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
        noValidate
        className="flex flex-col gap-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Name" htmlFor="member-name" required error={errors.name?.message}>
            {(fieldProps) => <Input {...fieldProps} autoComplete="off" {...register('name')} />}
          </FormField>
          <FormField
            label="Name on papers"
            htmlFor="member-citationName"
            description="How they are credited on a byline, e.g. “J. Jaimunk”. Bylines matching this or the name link to their profile."
            error={errors.citationName?.message}
          >
            {(fieldProps) => (
              <Input {...fieldProps} autoComplete="off" {...register('citationName')} />
            )}
          </FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Role" htmlFor="member-role" required error={errors.role?.message}>
            {(fieldProps) => <Input {...fieldProps} autoComplete="off" {...register('role')} />}
          </FormField>
          <FormField
            label="Affiliation"
            htmlFor="member-affiliation"
            description="Optional. Institution or department."
            error={errors.affiliation?.message}
          >
            {(fieldProps) => (
              <Input {...fieldProps} autoComplete="off" {...register('affiliation')} />
            )}
          </FormField>
        </div>
        {/* A plain checkbox rather than a shared component: a Checkbox abstraction with one caller
            would be scaffolding. */}
        <label className="flex items-start gap-2.5 text-sm text-foreground">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-accent"
            {...register('isDirector')}
          />
          <span>
            Director
            <span className="block text-xs text-muted-foreground">
              Listed first on the Team tab and featured on About. Ticking this moves the title from
              whoever holds it now.
            </span>
          </span>
        </label>
        {/* The admin picks a file; it uploads to object storage on selection and only the
            resulting URL is held in the form, so this dialog's own save stays a plain JSON PUT. */}
        <PhotoUpload
          value={watch('photoUrl')}
          onChange={(url) => setValue('photoUrl', url, { shouldDirty: true, shouldValidate: true })}
          endpoint="/api/admin/team-members/photo"
          personName={watch('name') || ''}
        />
        <FormField label="Bio" htmlFor="member-bio" error={errors.bio?.message}>
          {(fieldProps) => <Textarea {...fieldProps} {...register('bio')} rows={3} />}
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="LinkedIn profile URL"
            htmlFor="member-linkedinUrl"
            description="Optional."
            error={errors.linkedinUrl?.message}
          >
            {(fieldProps) => (
              <Input
                {...fieldProps}
                type="url"
                placeholder="https://www.linkedin.com/in/…"
                {...register('linkedinUrl')}
              />
            )}
          </FormField>
          <FormField
            label="Google Scholar profile URL"
            htmlFor="member-googleScholarUrl"
            description="Optional."
            error={errors.googleScholarUrl?.message}
          >
            {(fieldProps) => (
              <Input
                {...fieldProps}
                type="url"
                placeholder="https://scholar.google.com/citations?user=…"
                {...register('googleScholarUrl')}
              />
            )}
          </FormField>
        </div>
        <FormField
          label="Sort order"
          htmlFor="member-sortOrder"
          description="Lower numbers appear first. The director is always listed first."
          error={errors.sortOrder?.message}
        >
          {(fieldProps) => (
            <Input
              {...fieldProps}
              type="number"
              min={0}
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
