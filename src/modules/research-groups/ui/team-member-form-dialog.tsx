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
import { Select } from '@/modules/shared/ui/select';
import { FormField } from '@/modules/shared/ui/form-field';
import { PhotoUpload } from '@/modules/shared/ui/photo-upload';
// Deep, module-internal imports — see the equivalent comment in research-form-dialog.tsx (the
// barrel also re-exports Prisma-backed service getters; even a type-only barrel import drags
// Prisma/`pg` into the client bundle, confirmed empirically).
import type { ResearchGroup } from '../research-group.types';
import type { TeamMember } from '../team-member.types';
import { createTeamMemberSchema, type CreateTeamMemberInput } from '../team-member.schema';

type TeamMemberFormInput = z.input<typeof createTeamMemberSchema>;

/** The select needs an id and a label, nothing else — so a summary or a full group both fit. */
type GroupOption = Pick<ResearchGroup, 'id' | 'name'>;

function submitTeamMember(id: string | undefined, input: CreateTeamMemberInput) {
  return id
    ? apiSend<TeamMember>('PUT', `/api/admin/team-members/${id}`, input)
    : apiSend<TeamMember>('POST', '/api/admin/team-members', input);
}

export function TeamMemberFormDialog({
  open,
  onOpenChange,
  member,
  groups,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member?: TeamMember;
  groups: GroupOption[];
}) {
  const router = useRouter();
  const isEdit = Boolean(member);

  // `photoUrl`/`researchGroupId` normalize an empty select/input to `undefined`/`null` via
  // `setValueAs` at the field level — but that only runs on a field the user actually interacts
  // with; a field left at its untouched default never gets the chance, so `''` would otherwise
  // reach `.url()` and fail validation on an admin who simply leaves Photo URL blank. Normalizing
  // here, right before delegating to `zodResolver`, guarantees it regardless of touched state.
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
          researchGroupId: values.researchGroupId === '' ? null : values.researchGroupId,
        },
        context,
        options,
      ),
    values: {
      name: member?.name ?? '',
      role: member?.role ?? '',
      bio: member?.bio ?? '',
      nickname: member?.nickname ?? '',
      photoUrl: member?.photoUrl ?? '',
      researchGroupId: member?.researchGroupId ?? '',
      showOnTeamTab: member?.showOnTeamTab ?? true,
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
        {/* A plain checkbox rather than a shared component: this is the only one in the app, and a
            Checkbox abstraction with a single caller would be scaffolding. */}
        <label className="flex items-start gap-2.5 text-sm text-foreground">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-accent"
            {...register('showOnTeamTab')}
          />
          <span>
            Show on the public Team tab
            <span className="block text-xs text-muted-foreground">
              Leave unticked for a research co-author who exists only so publication bylines can
              link to one record per person.
            </span>
          </span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Name" htmlFor="member-name" required error={errors.name?.message}>
            {(fieldProps) => <Input {...fieldProps} {...register('name')} />}
          </FormField>
          <FormField
            label="Nickname"
            htmlFor="member-nickname"
            description="What they go by, e.g. Wyco. Shown in brackets after the full name."
            error={errors.nickname?.message}
          >
            {(fieldProps) => (
              <Input
                {...fieldProps}
                {...register('nickname', {
                  setValueAs: (value: string) => (value.trim() === '' ? null : value),
                })}
              />
            )}
          </FormField>
        </div>
        <FormField label="Role" htmlFor="member-role" required error={errors.role?.message}>
          {(fieldProps) => <Input {...fieldProps} {...register('role')} />}
        </FormField>
        <FormField
          label="Research group"
          htmlFor="member-group"
          error={errors.researchGroupId?.message}
        >
          {(fieldProps) => (
            <Select
              {...fieldProps}
              {...register('researchGroupId', {
                setValueAs: (value: string) => (value === '' ? null : value),
              })}
            >
              <option value="">No group</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>
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
        <FormField label="Sort order" htmlFor="member-sortOrder" error={errors.sortOrder?.message}>
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
