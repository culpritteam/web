// profile module — the lab's singleton profile (ADR-016): name, tagline, logo, overview, tab intros.
// getProfile() (public) / updateProfile() (admin, whole document) / patchProfile() (admin,
// per-screen partial write). Both writes are audited.

export {
  updateProfileSchema,
  type UpdateProfileInput,
  patchProfileSchema,
  type PatchProfileInput,
} from './profile.schema';

export type { Profile, AuditContext } from './profile.types';

export {
  createProfileService,
  type ProfileService,
  type ProfileServiceDeps,
} from './profile.service';

export type { ProfileRepository } from './profile.repository';

export { getProfileService, getProfileCached } from './container';

export { ProfileLinks, type ProfileLinkItem } from './ui/profile-links';
export {
  ProfileFieldsForm,
  PROFILE_FIELD_KEYS,
  type ProfileFieldKey,
  type ProfileFormSection,
} from './ui/profile-fields-form';
