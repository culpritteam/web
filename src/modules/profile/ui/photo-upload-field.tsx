'use client';

import { useFormContext } from 'react-hook-form';
import { PhotoUpload } from '@/modules/shared/ui/photo-upload';

/**
 * Only the two keys this control reads. Deliberately narrower than any one form's value type:
 * the field is mounted by `ProfileFieldsForm`, whose shape depends on which slice of the profile
 * the surrounding admin screen owns.
 */
type LogoFormValues = { logoUrl?: string | null; labName?: string };

/**
 * The lab logo picker: the admin picks a file, it uploads immediately to object storage, and the
 * resulting URL is written into the form's `logoUrl` field, saved with the next regular save.
 * The upload mechanics live in `PhotoUpload`, shared with the team-member dialog.
 */
export function PhotoUploadField() {
  const { watch, setValue } = useFormContext<LogoFormValues>();

  return (
    <PhotoUpload
      value={watch('logoUrl')}
      onChange={(url) => setValue('logoUrl', url, { shouldDirty: true, shouldValidate: true })}
      endpoint="/api/admin/profile/photo"
      personName={watch('labName') || ''}
      label="Logo"
      className="sm:col-span-2"
    />
  );
}
