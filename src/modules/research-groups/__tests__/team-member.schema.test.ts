import { describe, expect, it } from 'vitest';
import { createTeamMemberSchema, updateTeamMemberSchema } from '../team-member.schema';

describe('createTeamMemberSchema', () => {
  it('parses a minimal team member', () => {
    const result = createTeamMemberSchema.safeParse({
      name: 'Jane Doe',
      role: 'PhD Candidate',
      teamKind: 'research',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isDirector).toBeUndefined();
      // The link list defaults to empty, which is how a member with no links is expressed.
      expect(result.data.links).toEqual([]);
    }
  });

  it('parses a full profile', () => {
    const result = createTeamMemberSchema.safeParse({
      name: 'Jenjira Jaimunk, PhD.',
      citationName: 'J. Jaimunk',
      role: 'Assistant Professor',
      affiliation: 'Department of Computer Engineering, Chiang Mai University',
      bio: 'Works on privacy by design.',
      photoUrl: 'https://example.com/jane.jpg',
      teamKind: 'director',
      links: [
        { label: 'LinkedIn', url: 'https://www.linkedin.com/in/example' },
        { label: 'Google Scholar', url: 'https://scholar.google.com/citations?user=x' },
      ],
      sortOrder: 3,
    });
    expect(result.success).toBe(true);
  });

  it('requires name, role and a team', () => {
    const result = createTeamMemberSchema.safeParse({});
    expect(result.success).toBe(false);
    if (result.success) return;
    const fieldErrors = result.error.flatten().fieldErrors;
    expect(fieldErrors.name).toBeDefined();
    expect(fieldErrors.role).toBeDefined();
    expect(fieldErrors.teamKind).toBeDefined();
  });

  it('rejects an unknown team', () => {
    expect(
      createTeamMemberSchema.safeParse({ name: 'X', role: 'Y', teamKind: 'visiting' }).success,
    ).toBe(false);
  });

  it('accepts any label an admin types, but only an http(s) link URL', () => {
    const base = { name: 'X', role: 'Y', teamKind: 'development' as const };

    // The label is free text on purpose — adding a service must not need a migration.
    expect(
      createTeamMemberSchema.safeParse({
        ...base,
        links: [{ label: 'Some niche preprint server', url: 'https://example.org/me' }],
      }).success,
    ).toBe(true);

    // Link URLs render straight into an href, so a javascript: URL must never be storable.
    expect(
      createTeamMemberSchema.safeParse({
        ...base,
        links: [{ label: 'Evil', url: 'javascript:alert(1)' }],
      }).success,
    ).toBe(false);

    // A label is required: an unlabelled link has nothing to render as its text.
    expect(
      createTeamMemberSchema.safeParse({
        ...base,
        links: [{ label: '', url: 'https://example.org/me' }],
      }).success,
    ).toBe(false);
  });

  it('strips HTML from a link label', () => {
    const parsed = createTeamMemberSchema.parse({
      name: 'X',
      role: 'Y',
      teamKind: 'development',
      links: [{ label: '<b>GitHub</b>', url: 'https://github.com/example' }],
    });
    expect(parsed.links[0]!.label).toBe('GitHub');
  });

  it('turns a blank citation name into null so the column is cleared', () => {
    const parsed = updateTeamMemberSchema.parse({ citationName: '' });
    expect(parsed.citationName).toBeNull();
  });

  it('leaves links absent on a partial update, which means "leave them alone"', () => {
    const parsed = updateTeamMemberSchema.parse({ role: 'Senior Researcher' });
    expect(parsed.links).toBeUndefined();
  });

  it('strips HTML from free text', () => {
    const parsed = createTeamMemberSchema.parse({
      name: '<b>Jane</b>',
      role: 'PhD',
      teamKind: 'research',
      affiliation: '<i>Lab</i>',
    });
    expect(parsed.name).toBe('Jane');
    expect(parsed.affiliation).toBe('Lab');
  });

  it('drops the removed fields as unknown keys', () => {
    const parsed = createTeamMemberSchema.parse({
      name: 'Jane',
      role: 'PhD',
      teamKind: 'research',
      nickname: 'J',
      showOnTeamTab: false,
      researchGroupId: 'grp_1',
      // Replaced by `links` on 2026-09-12.
      linkedinUrl: 'https://www.linkedin.com/in/example',
      googleScholarUrl: 'https://scholar.google.com/citations?user=x',
    });
    expect(parsed).not.toHaveProperty('nickname');
    expect(parsed).not.toHaveProperty('showOnTeamTab');
    expect(parsed).not.toHaveProperty('researchGroupId');
    expect(parsed).not.toHaveProperty('linkedinUrl');
    expect(parsed).not.toHaveProperty('googleScholarUrl');
  });
});
