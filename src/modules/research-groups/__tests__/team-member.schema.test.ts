import { describe, expect, it } from 'vitest';
import { createTeamMemberSchema, updateTeamMemberSchema } from '../team-member.schema';

describe('createTeamMemberSchema', () => {
  it('parses a minimal team member', () => {
    const result = createTeamMemberSchema.safeParse({ name: 'Jane Doe', role: 'PhD Candidate' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.isDirector).toBeUndefined();
  });

  it('parses a full profile', () => {
    const result = createTeamMemberSchema.safeParse({
      name: 'Jenjira Jaimunk, PhD.',
      citationName: 'J. Jaimunk',
      role: 'Assistant Professor',
      affiliation: 'Department of Computer Engineering, Chiang Mai University',
      bio: 'Works on privacy by design.',
      photoUrl: 'https://example.com/jane.jpg',
      linkedinUrl: 'https://www.linkedin.com/in/example',
      googleScholarUrl: 'https://scholar.google.com/citations?user=x',
      isDirector: true,
      sortOrder: 3,
    });
    expect(result.success).toBe(true);
  });

  it('requires name and role', () => {
    const result = createTeamMemberSchema.safeParse({});
    expect(result.success).toBe(false);
    if (result.success) return;
    const fieldErrors = result.error.flatten().fieldErrors;
    expect(fieldErrors.name).toBeDefined();
    expect(fieldErrors.role).toBeDefined();
  });

  it('rejects a javascript: link', () => {
    expect(
      createTeamMemberSchema.safeParse({
        name: 'X',
        role: 'Y',
        linkedinUrl: 'javascript:alert(1)',
      }).success,
    ).toBe(false);
  });

  it('turns a blank citation name and link into null so the column is cleared', () => {
    const parsed = updateTeamMemberSchema.parse({ citationName: '', googleScholarUrl: '' });
    expect(parsed.citationName).toBeNull();
    expect(parsed.googleScholarUrl).toBeNull();
  });

  it('strips HTML from free text', () => {
    const parsed = createTeamMemberSchema.parse({
      name: '<b>Jane</b>',
      role: 'PhD',
      affiliation: '<i>Lab</i>',
    });
    expect(parsed.name).toBe('Jane');
    expect(parsed.affiliation).toBe('Lab');
  });

  it('drops the removed fields as unknown keys', () => {
    const parsed = createTeamMemberSchema.parse({
      name: 'Jane',
      role: 'PhD',
      nickname: 'J',
      showOnTeamTab: false,
      researchGroupId: 'grp_1',
    });
    expect(parsed).not.toHaveProperty('nickname');
    expect(parsed).not.toHaveProperty('showOnTeamTab');
    expect(parsed).not.toHaveProperty('researchGroupId');
  });
});
