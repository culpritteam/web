'use client';

import { FormProvider, useForm, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { apiSend } from '@/modules/shared/lib/api-client';
import { Button } from '@/modules/shared/ui/button';
import { Input } from '@/modules/shared/ui/input';
import { Textarea } from '@/modules/shared/ui/textarea';
import { FormField } from '@/modules/shared/ui/form-field';
import { FormSection } from '@/modules/shared/ui/form-section';
import { UnsavedChangesGuard } from '@/modules/shared/ui/unsaved-changes-guard';
// Deep, module-internal imports — the barrel also re-exports the Prisma-backed
// `getProfileService`, and even a type-only import of it drags Prisma/`pg` into the client bundle
// (confirmed empirically — SWC didn't elide it), so both the schema AND the type go straight to
// their concrete files.
import type { Profile } from '../profile.types';
import { patchProfileSchema, type PatchProfileInput } from '../profile.schema';
import { PhotoUploadField } from './photo-upload-field';

// The one profile editor, shared by every admin screen.
//
// The admin IA gives each public tab its own admin screen, and the profile singleton is spread
// across all of them: About owns the lab identity and overview, Research owns the research
// statement, Publications/Team/Events own their standfirst, Appointment owns the Calendly link.
// Each screen mounts this component with the field keys it owns and PATCHes only those — the
// route's "key absent means column untouched" contract is what stops five screens from
// clobbering each other's slice of one row.
//
// A whole-document PUT per screen would have needed every screen to round-trip fields it does not
// display, and any concurrent save would have silently reverted the other screen's work.

/** Every writable profile field, in the order the public site reads them. */
export const PROFILE_FIELD_KEYS = [
  'labName',
  'labTagline',
  'logoUrl',
  'positionAffiliation',
  'labOverview',
  'researchStatement',
  'calendlyUrl',
  'publicationsIntro',
  'teamIntro',
  'eventsIntro',
  'appointmentIntro',
] as const;

export type ProfileFieldKey = (typeof PROFILE_FIELD_KEYS)[number];

/**
 * How a field is drawn, and — the part that matters — what "empty" looks like on the wire.
 *
 * The three prose/URL kinds send `''`, which the schema's transform turns into `undefined` with
 * the KEY STILL PRESENT, so the repository writes NULL. `logoUrl` cannot: its schema is a bare
 * `.url()` and `''` fails it, so clearing a photo has to send an explicit `null` (the schema is
 * `.nullable()` for exactly this). Sending `undefined` would be wrong for all four — JSON.stringify
 * drops undefined keys, and a dropped key means "leave the column alone".
 */
type FieldKind = 'text' | 'textarea' | 'url' | 'photo';

type FieldMeta = {
  label: string;
  kind: FieldKind;
  description?: string;
  placeholder?: string;
  rows?: number;
  required?: boolean;
};

const FIELD_META: Record<ProfileFieldKey, FieldMeta> = {
  labName: {
    label: 'Lab name',
    kind: 'text',
    required: true,
    description: 'Shown in the site header on every public page.',
  },
  labTagline: {
    label: 'Tagline',
    kind: 'text',
    description: 'Optional. The line directly beneath the lab name.',
  },
  logoUrl: { label: 'Logo', kind: 'photo' },
  positionAffiliation: {
    label: 'Affiliation',
    kind: 'textarea',
    rows: 2,
    description: 'One line, e.g. the host department and university. Shown in the site header.',
  },
  labOverview: {
    label: 'Lab overview',
    kind: 'textarea',
    rows: 6,
    description: 'The opening prose of the public About tab.',
  },
  researchStatement: {
    label: 'Research statement',
    kind: 'textarea',
    rows: 6,
    description: 'The prose that opens the public Research tab, above the research interests.',
  },
  calendlyUrl: {
    label: 'Calendly scheduling URL',
    kind: 'url',
    placeholder: 'https://calendly.com/your-name/30min',
    description:
      'The booking page embedded on the public Make Appointment tab. Left blank, the site falls back to the NEXT_PUBLIC_CALENDLY_URL environment variable.',
  },
  publicationsIntro: {
    label: 'Publications introduction',
    kind: 'textarea',
    rows: 3,
    description: 'Optional standfirst above the publication list. Blank keeps the built-in text.',
  },
  teamIntro: {
    label: 'Team introduction',
    kind: 'textarea',
    rows: 3,
    description: 'Optional standfirst above the member list. Blank keeps the built-in text.',
  },
  eventsIntro: {
    label: 'Events introduction',
    kind: 'textarea',
    rows: 3,
    description: 'Optional standfirst above the event list. Blank keeps the built-in text.',
  },
  appointmentIntro: {
    label: 'Appointment introduction',
    kind: 'textarea',
    rows: 3,
    description: 'Optional standfirst above the Calendly widget. Blank keeps the built-in text.',
  },
};

/** A field takes the full width when it is a paragraph or the portrait picker. */
function isWide(key: ProfileFieldKey): boolean {
  const kind = FIELD_META[key].kind;
  return kind === 'textarea' || kind === 'photo';
}

export type ProfileFormSection = {
  /** Anchor id, so the screen's jump list can link to it. */
  id: string;
  title: string;
  description?: string;
  fields: readonly ProfileFieldKey[];
};

/** The fields whose schema is `.nullable()`, so `null` is a legal value to send. */
type NullableFieldKey = 'logoUrl' | 'calendlyUrl';

/**
 * Raw form state — structurally the schema's INPUT type, so `zodResolver`'s generics line up
 * without a cast. (`z.input<typeof patchProfileSchema>` itself can't be used directly: the shape
 * has to stay indexable by `ProfileFieldKey` for the generic renderer below.)
 */
type FormValues = {
  [K in ProfileFieldKey]?: K extends NullableFieldKey ? string | null : string;
};

function toDefaults(profile: Profile | null, fields: readonly ProfileFieldKey[]): FormValues {
  // One contained cast: the loop writes a uniform `string | null` under a key whose declared type
  // TS can only narrow per-key. Every write below is legal for the key it targets.
  const defaults: Record<string, string | null> = {};
  for (const key of fields) {
    // `logoUrl` keeps null (it is the value the picker sets to clear); everything else uses ''
    // so an untouched empty field and a deliberately emptied one look the same on the wire.
    defaults[key] = profile?.[key] ?? (FIELD_META[key].kind === 'photo' ? null : '');
  }
  return defaults as FormValues;
}

/**
 * Only the owned keys, always present. Presence is the whole contract: an owned field that the
 * admin emptied must arrive as `''`/`null` so the column is cleared, and a field this screen does
 * not own must not arrive at all.
 */
function toPayload(values: FormValues, fields: readonly ProfileFieldKey[]) {
  const payload: Record<string, string | null> = {};
  for (const key of fields) {
    const value = values[key];
    payload[key] = value ?? (FIELD_META[key].kind === 'photo' ? null : '');
  }
  return payload;
}

function patchProfile(payload: Record<string, string | null>): Promise<Profile> {
  return apiSend<Profile>('PATCH', '/api/admin/profile', payload);
}

export interface ProfileFieldsFormProps {
  profile: Profile | null;
  /** The slice of the singleton this screen owns. Everything else is left untouched. */
  sections: readonly ProfileFormSection[];
}

export function ProfileFieldsForm({ profile, sections }: ProfileFieldsFormProps) {
  const router = useRouter();
  const fields = sections.flatMap((section) => [...section.fields]);

  const form = useForm<FormValues, unknown, PatchProfileInput>({
    // The partial schema, not the whole-document one: it validates exactly the keys present, so a
    // screen that owns one field is judged on that one field. `min(1)` still guards the lab name.
    resolver: zodResolver(patchProfileSchema),
    defaultValues: toDefaults(profile, fields),
  });
  const {
    register,
    handleSubmit,
    getValues,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = form;

  const mutation = useMutation({
    mutationFn: patchProfile,
    onSuccess: () => {
      toast.success('Changes saved.');
      // Re-baselines `isDirty` from what is now on the server, which is what turns the unsaved
      // guard and the Save button back off.
      reset(getValues());
      router.refresh();
    },
    onError: () => toast.error('Something went wrong. Please try again.'),
  });

  return (
    <FormProvider {...form}>
      {/* The resolver's OUTPUT is deliberately discarded: its transforms turn '' into undefined,
          and an undefined key disappears from JSON.stringify — which the API reads as "leave this
          column alone", the exact opposite of clearing it. Validation still gates the submit; the
          body is rebuilt from the raw field values. */}
      <form
        onSubmit={handleSubmit(() => mutation.mutate(toPayload(getValues(), fields)))}
        noValidate
        className="flex flex-col gap-12"
      >
        {sections.map((section) => (
          <div key={section.id} id={section.id} className="scroll-mt-24">
            <FormSection title={section.title} description={section.description}>
              <div className="grid gap-5 sm:grid-cols-2">
                {section.fields.map((key) => (
                  <ProfileField key={key} fieldKey={key} register={register} errors={errors} />
                ))}
              </div>
            </FormSection>
          </div>
        ))}

        {/* Sticky rather than fixed: these screens carry tables under the form, and a viewport-
            pinned bar would sit on top of the last table row for the whole page. Sticky keeps the
            control reachable while the form is on screen and gets out of the way after it. */}
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-4 border-t border-border bg-background/95 px-1 py-3 backdrop-blur-sm">
          <p aria-live="polite" className="mr-auto text-xs text-muted-foreground">
            {isDirty ? 'Unsaved changes.' : 'All changes saved.'}
          </p>
          <Button type="submit" disabled={!isDirty} loading={isSubmitting || mutation.isPending}>
            Save changes
          </Button>
        </div>
      </form>

      <UnsavedChangesGuard when={isDirty && !mutation.isPending} />
    </FormProvider>
  );
}

type FieldProps = {
  fieldKey: ProfileFieldKey;
  register: UseFormRegister<FormValues>;
  errors: FieldErrors<FormValues>;
};

function ProfileField({ fieldKey, register, errors }: FieldProps) {
  const meta = FIELD_META[fieldKey];
  const error = errors[fieldKey]?.message;
  const wide = isWide(fieldKey);

  if (meta.kind === 'photo') {
    return (
      <div className="sm:col-span-2">
        <PhotoUploadField />
        {error && (
          <p role="alert" className="mt-2 text-xs font-medium text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <FormField
      label={meta.label}
      htmlFor={`profile-${fieldKey}`}
      description={meta.description}
      required={meta.required}
      error={error}
      className={wide ? 'sm:col-span-2' : undefined}
    >
      {(fieldProps) =>
        meta.kind === 'textarea' ? (
          <Textarea
            {...fieldProps}
            // Nothing here is a browser-autofillable identity field — without this a password
            // manager offers to fill these with the admin's own credentials.
            autoComplete="off"
            rows={meta.rows}
            placeholder={meta.placeholder}
            {...register(fieldKey)}
          />
        ) : (
          <Input
            {...fieldProps}
            autoComplete="off"
            type={meta.kind === 'url' ? 'url' : 'text'}
            placeholder={meta.placeholder}
            {...register(fieldKey)}
          />
        )
      }
    </FormField>
  );
}
