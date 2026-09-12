'use client';

import { useEffect, useState } from 'react';
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
import { TEAM_KINDS, TEAM_KIND_LABELS } from '@/modules/shared/lib/team-kind';
// Deep, module-internal imports — see the equivalent comment in research-form-dialog.tsx (the
// barrel also re-exports Prisma-backed service getters; even a type-only barrel import drags
// Prisma/`pg` into the client bundle, confirmed empirically).
import type { MemberLink, TeamMember } from '../team-member.types';
import {
  createTeamMemberSchema,
  type CreateTeamMemberInput,
  type MemberLinkInput,
} from '../team-member.schema';
import { MemberLinksField, type MemberLinkRow } from './member-links-field';

type TeamMemberFormInput = z.input<typeof createTeamMemberSchema>;

/**
 * What goes on the wire. `links` is optional here and NOT in `CreateTeamMemberInput`, because
 * omitting the key is the only way to say "leave the stored links alone" on an update — sending
 * `[]` replaces the list with nothing (see `updateTeamMemberSchema`). An untouched edit therefore
 * has to drop the key entirely, which `JSON.stringify` does for `undefined`.
 */
type TeamMemberPayload = Omit<CreateTeamMemberInput, 'links'> & { links?: MemberLinkInput[] };

function submitTeamMember(id: string | undefined, input: TeamMemberPayload) {
  return id
    ? apiSend<TeamMember>('PUT', `/api/admin/team-members/${id}`, input)
    : apiSend<TeamMember>('POST', '/api/admin/team-members', input);
}

export function TeamMemberFormDialog({
  open,
  onOpenChange,
  member,
  links = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member?: TeamMember;
  /** The member's stored links, in order. Empty for a new member. */
  links?: readonly MemberLink[];
}) {
  const router = useRouter();
  const isEdit = Boolean(member);
  // Whether the admin actually edited the link list this time round. Nothing else can tell the
  // difference between "left them alone" and "cleared them", and getting it wrong silently wipes
  // every link on a member the admin only meant to rename.
  const [linksTouched, setLinksTouched] = useState(false);
  useEffect(() => setLinksTouched(false), [member?.id, open]);

  // An untouched photo holds `''`, which would reach `httpUrl` and fail validation for an admin who
  // simply leaves it blank. Normalizing here, right before `zodResolver`, covers every case.
  const zodValidate = zodResolver(createTeamMemberSchema);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitted, isSubmitting },
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
      // Defaults to the research team for a new member — the team that keeps the most of what a
      // member can have short of teaching. `isDirector` is not a form field any more: the service
      // derives it from the team, so offering both would be two controls for one decision.
      teamKind: member?.teamKind ?? 'research',
      // Only the editable halves: `id` and `sortOrder` are the server's, and the array order is
      // what becomes `sortOrder` on save.
      links: links.map(({ label, url }) => ({ label, url })),
      sortOrder: member?.sortOrder ?? 0,
    },
  });

  const linkRows: MemberLinkRow[] = watch('links') ?? [];
  // RHF mirrors the schema's shape, so an array field's errors are an array of per-field errors.
  const linkErrors = Array.isArray(errors.links) ? errors.links : [];

  const mutation = useMutation({
    mutationFn: (input: TeamMemberPayload) => submitTeamMember(member?.id, input),
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
        onSubmit={handleSubmit(({ links: editedLinks, ...values }) =>
          // An edit that never went near the link editor sends no `links` key at all, which the
          // update route reads as "leave them alone". Creating always sends the list.
          mutation.mutate({
            ...values,
            links: isEdit && !linksTouched ? undefined : editedLinks,
          }),
        )}
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
        {/* A plain select rather than a shared component: a Select abstraction with one caller would
            be scaffolding. Choosing "Director" moves the title from whoever holds it now. */}
        <FormField
          label="Team"
          htmlFor="member-teamKind"
          required
          description="Decides which sections this member's profile page can have. Existing entries for a section the new team cannot have are kept, but stop showing."
          error={errors.teamKind?.message}
        >
          {(fieldProps) => (
            <select
              {...fieldProps}
              className="h-10 w-full rounded-sm border border-border bg-background px-3 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              {...register('teamKind')}
            >
              {TEAM_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {TEAM_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
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
        {/* Free-form `member_link` rows (ADR-017), edited as a repeatable list and saved with the
            rest of the member in one request. */}
        <MemberLinksField
          value={linkRows}
          errors={linkErrors.map((rowError) => ({
            label: rowError?.label?.message,
            url: rowError?.url?.message,
          }))}
          onChange={(next) => {
            setLinksTouched(true);
            // Quiet until the admin has tried to save once, then live: a row flagged "required"
            // the instant it is added is noise, but an error that survives the fix is a lie
            // (WCAG 3.3.1 wants the message to match the current value).
            setValue('links', next, { shouldDirty: true, shouldValidate: isSubmitted });
          }}
        />
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
