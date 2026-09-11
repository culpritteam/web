import { describe, expect, it } from 'vitest';
import { patchProfileSchema, updateProfileSchema } from '../profile.schema';

describe('updateProfileSchema', () => {
  it('parses a full valid profile', () => {
    const result = updateProfileSchema.safeParse({
      labName: 'The Culprit of Privacy Technologies',
      labTagline: 'Privacy engineering research',
      logoUrl: 'https://example.com/logo.png',
      labOverview: 'Short overview.',
      positionAffiliation: 'Professor, University College London',
      education: [{ title: 'PhD, Computer Science', subtitle: 'MIT', year: '2010' }],
      researchInterests: [{ title: 'Malware analysis' }],
      researchStatement: 'My research statement.',
      invitedTalks: [{ title: 'Keynote', year: '2024' }],
    });
    expect(result.success).toBe(true);
  });

  it('strips HTML from free-text fields', () => {
    const result = updateProfileSchema.safeParse({
      labName: 'The <b>Culprit</b>',
      labOverview: '<script>alert(1)</script>Bio text',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.labName).toBe('The Culprit');
    expect(result.data.labOverview).toBe('alert(1)Bio text');
  });

  it('requires labName, and only labName', () => {
    const result = updateProfileSchema.safeParse({ labOverview: 'x' });
    expect(result.success).toBe(false);
    if (result.success) return;
    const fieldErrors = result.error.flatten().fieldErrors;
    expect(fieldErrors.labName).toBeDefined();
    expect(updateProfileSchema.safeParse({ labName: 'Lab' }).success).toBe(true);
  });

  it("drops the professor's personal fields, which moved to her team-member row", () => {
    const result = updateProfileSchema.safeParse({
      labName: 'Lab',
      fullName: 'Dr. X',
      citationName: 'X.',
      linkedinUrl: 'https://example.com',
      teachingIntro: 'Old',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    for (const key of ['fullName', 'citationName', 'linkedinUrl', 'teachingIntro']) {
      expect(result.data).not.toHaveProperty(key);
    }
  });

  it('rejects a non-URL logoUrl', () => {
    const result = updateProfileSchema.safeParse({
      labName: 'Lab',
      logoUrl: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('allows logoUrl to be explicitly null (clear the logo)', () => {
    const result = updateProfileSchema.safeParse({
      labName: 'Lab',
      logoUrl: null,
    });
    expect(result.success).toBe(true);
  });

  // The CV list fields left this schema in ADR-012 — Zod now strips them as unknown keys, so
  // asserting on them here would only test Zod. Their validation lives in the teaching module's
  // `teaching.schema.test.ts` instead.
  it('ignores CV list fields, which are no longer part of the profile document', () => {
    const result = updateProfileSchema.safeParse({
      labName: 'Lab',
      education: [{ subtitle: 'MIT' }],
    });

    expect(result.success).toBe(true);
    expect(result.success && 'education' in result.data).toBe(false);
  });
});

describe('patchProfileSchema', () => {
  it('accepts a single-field patch and carries only that key', () => {
    const result = patchProfileSchema.safeParse({ teamIntro: 'Our team.' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(Object.keys(result.data)).toEqual(['teamIntro']);
    expect(result.data.teamIntro).toBe('Our team.');
  });

  it('does not require labName, which the whole-document PUT does', () => {
    expect(patchProfileSchema.safeParse({ labOverview: 'Just the overview.' }).success).toBe(true);
  });

  it('rejects an empty patch rather than accepting a silent no-op', () => {
    const result = patchProfileSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects a body whose only keys are unknown (they are stripped, leaving nothing)', () => {
    expect(patchProfileSchema.safeParse({ notAField: 'x' }).success).toBe(false);
  });

  it('keeps a cleared field as a present key so the repository writes NULL', () => {
    const result = patchProfileSchema.safeParse({ eventsIntro: '' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect('eventsIntro' in result.data).toBe(true);
    expect(result.data.eventsIntro).toBeUndefined();
  });

  it('strips HTML from every intro field', () => {
    const result = patchProfileSchema.safeParse({
      publicationsIntro: '<script>alert(1)</script>Selected work',
      teamIntro: '<i>Team</i>',
      eventsIntro: '<em>Events</em>',
      appointmentIntro: '<p>Book a slot</p>',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.publicationsIntro).toBe('alert(1)Selected work');
    expect(result.data.teamIntro).toBe('Team');
    expect(result.data.eventsIntro).toBe('Events');
    expect(result.data.appointmentIntro).toBe('Book a slot');
  });

  it('rejects an intro field over 2000 characters', () => {
    expect(patchProfileSchema.safeParse({ teamIntro: 'x'.repeat(2001) }).success).toBe(false);
  });

  it('rejects a non-URL calendlyUrl', () => {
    const result = patchProfileSchema.safeParse({ calendlyUrl: 'not-a-url' });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.flatten().fieldErrors.calendlyUrl).toBeDefined();
  });

  it('accepts a valid calendlyUrl and clears it on empty string', () => {
    expect(
      patchProfileSchema.safeParse({ calendlyUrl: 'https://calendly.com/culprit/30min' }).success,
    ).toBe(true);
    const cleared = patchProfileSchema.safeParse({ calendlyUrl: '' });
    expect(cleared.success).toBe(true);
    if (cleared.success) expect(cleared.data.calendlyUrl).toBeNull();
  });
});
