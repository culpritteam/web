import { describe, expect, it } from 'vitest';
import { createProjectSchema, listProjectsQuerySchema, updateProjectSchema } from '../project.schema';

describe('createProjectSchema', () => {
  const VALID = {
    teamMemberId: 'mem_1',
    title: 'Lab website',
    summary: 'The public site and the admin app behind it.',
  };

  it('accepts a minimal project, leaving the optional fields absent', () => {
    const parsed = createProjectSchema.parse(VALID);

    // Absent, not null: an absent key is what the repository reads as "no value supplied".
    expect(parsed.link).toBeUndefined();
    expect(parsed.sortOrder).toBeUndefined();
    // An empty string from an untouched form input does become null, clearing the column.
    expect(createProjectSchema.parse({ ...VALID, link: '' }).link).toBeNull();
  });

  it('strips HTML from the free-text fields', () => {
    const parsed = createProjectSchema.parse({
      ...VALID,
      title: '<b>Lab website</b>',
      summary: 'A site<script>alert(1)</script>',
    });

    expect(parsed.title).toBe('Lab website');
    expect(parsed.summary).not.toContain('<script>');
  });

  it('rejects a non-http link, which would render into an href', () => {
    const parsed = createProjectSchema.safeParse({ ...VALID, link: 'javascript:alert(1)' });

    expect(parsed.success).toBe(false);
  });

  it('requires a member, a title and a summary', () => {
    for (const key of ['teamMemberId', 'title', 'summary'] as const) {
      const incomplete: Record<string, unknown> = { ...VALID };
      delete incomplete[key];
      expect(createProjectSchema.safeParse(incomplete).success).toBe(false);
    }
  });

  it('bounds the free text', () => {
    expect(createProjectSchema.safeParse({ ...VALID, title: 'x'.repeat(301) }).success).toBe(false);
    expect(createProjectSchema.safeParse({ ...VALID, summary: 'x'.repeat(5001) }).success).toBe(
      false,
    );
  });
});

describe('updateProjectSchema', () => {
  it('is partial and cannot move a project to another member', () => {
    const parsed = updateProjectSchema.parse({ title: 'Renamed', teamMemberId: 'someone-else' });

    expect(parsed.title).toBe('Renamed');
    expect('teamMemberId' in parsed).toBe(false);
  });
});

describe('listProjectsQuerySchema', () => {
  it('requires a member id', () => {
    expect(listProjectsQuerySchema.safeParse({ teamMemberId: null }).success).toBe(false);
    expect(listProjectsQuerySchema.parse({ teamMemberId: 'mem_1' })).toEqual({
      teamMemberId: 'mem_1',
    });
  });
});
