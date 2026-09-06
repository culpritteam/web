import { describe, expect, it, vi } from 'vitest';
import { createProfileService } from '../profile.service';
import type { ProfileRepository } from '../profile.repository';
import type { AuditContext, Profile } from '../profile.types';

const BLANK: Profile = {
  id: 'profile_1',
  citationName: null,
  fullName: '',
  title: '',
  photoUrl: null,
  bio: null,
  positionAffiliation: null,
  researchStatement: null,
  linkedinUrl: null,
  googleScholarUrl: null,
  calendlyUrl: null,
  publicationsIntro: null,
  teachingIntro: null,
  teamIntro: null,
  eventsIntro: null,
  appointmentIntro: null,
  updatedAt: new Date('2026-08-02T00:00:00Z'),
};

class FakeRepository implements ProfileRepository {
  current: Profile = { ...BLANK };
  audits: AuditContext[] = [];

  async get(): Promise<Profile> {
    return { ...this.current };
  }

  async updateWithAudit(input: { data: Partial<Profile>; audit: AuditContext }): Promise<Profile> {
    this.current = { ...this.current, ...input.data, updatedAt: new Date('2026-08-02T01:00:00Z') };
    this.audits.push(input.audit);
    return { ...this.current };
  }

  /**
   * Mirrors the Prisma repository's merge rule: only keys PRESENT in the patch are written, and a
   * present-but-undefined key (a field the admin cleared) becomes null. Keys absent from the patch
   * must survive untouched — that is the behaviour the per-tab admin screens depend on.
   */
  async patchWithAudit(input: {
    data: Record<string, unknown>;
    audit: AuditContext;
  }): Promise<Profile> {
    const next: Profile = { ...this.current, updatedAt: new Date('2026-08-02T01:00:00Z') };
    for (const key of Object.keys(input.data)) {
      Reflect.set(next, key, input.data[key] ?? null);
    }
    this.current = next;
    this.audits.push(input.audit);
    return { ...this.current };
  }
}

function build() {
  const repository = new FakeRepository();
  const service = createProfileService({
    repository,
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  });
  return { repository, service };
}

describe('profile service', () => {
  it('getProfile returns the singleton row', async () => {
    const { service } = build();
    const result = await service.getProfile();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.fullName).toBe('');
  });

  it('updateProfile persists changes and writes an audit entry', async () => {
    const { repository, service } = build();
    const result = await service.updateProfile(
      { fullName: 'Dr. Cavallaro', title: 'Professor of Information Security' },
      'admin:1',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.fullName).toBe('Dr. Cavallaro');
    expect(repository.audits.at(-1)).toEqual({ actor: 'admin:1', action: 'profile.update' });
  });

  it('surfaces a repository failure as an AppError result', async () => {
    const { repository, service } = build();
    repository.get = vi.fn().mockRejectedValue(new Error('db down'));
    const result = await service.getProfile();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('internal');
  });

  it('patchProfile writes only the supplied field and leaves the rest untouched', async () => {
    const { repository, service } = build();
    repository.current = {
      ...BLANK,
      fullName: 'Dr. Cavallaro',
      title: 'Professor',
      bio: 'Existing bio.',
      researchStatement: 'Existing statement.',
    };

    const result = await service.patchProfile({ teachingIntro: 'Courses I teach.' }, 'admin:1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.teachingIntro).toBe('Courses I teach.');
    // Every field another admin screen owns is unchanged.
    expect(result.data.fullName).toBe('Dr. Cavallaro');
    expect(result.data.title).toBe('Professor');
    expect(result.data.bio).toBe('Existing bio.');
    expect(result.data.researchStatement).toBe('Existing statement.');
  });

  it('patchProfile records the changed field names in the audit metadata', async () => {
    const { repository, service } = build();
    await service.patchProfile({ teamIntro: 'Our team.', eventsIntro: 'Talks.' }, 'admin:1');
    expect(repository.audits.at(-1)).toEqual({
      actor: 'admin:1',
      action: 'profile.update',
      metadata: { fields: ['teamIntro', 'eventsIntro'] },
    });
  });

  it('patchProfile clears a field when the key is present but empty', async () => {
    const { repository, service } = build();
    repository.current = { ...BLANK, calendlyUrl: 'https://calendly.com/old', bio: 'Keep me.' };

    const result = await service.patchProfile({ calendlyUrl: null }, 'admin:1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.calendlyUrl).toBeNull();
    expect(result.data.bio).toBe('Keep me.');
  });

  it('patchProfile surfaces a repository failure as an AppError result', async () => {
    const { repository, service } = build();
    repository.patchWithAudit = vi.fn().mockRejectedValue(new Error('db down'));
    const result = await service.patchProfile({ teamIntro: 'x' }, 'admin:1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('internal');
  });

  it('updateProfile still writes the whole document (unchanged by the partial path)', async () => {
    const { repository, service } = build();
    repository.current = { ...BLANK, teachingIntro: 'Old intro.' };

    const result = await service.updateProfile(
      { fullName: 'Dr. Cavallaro', title: 'Professor' },
      'admin:1',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.fullName).toBe('Dr. Cavallaro');
    expect(repository.audits.at(-1)).toEqual({ actor: 'admin:1', action: 'profile.update' });
  });
});
