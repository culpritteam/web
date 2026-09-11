import { describe, expect, it } from 'vitest';
import { createCourseSchema, createCvEntrySchema, updateCvEntrySchema } from '../teaching.schema';

describe('createCvEntrySchema', () => {
  const VALID = { teamMemberId: 'mem_1', section: 'education', title: 'PhD in Computer Science' };

  it('accepts a minimal entry', () => {
    const parsed = createCvEntrySchema.parse(VALID);

    expect(parsed.section).toBe('education');
    expect(parsed.title).toBe('PhD in Computer Science');
    // Absent, not blank — the transform to null only fires when the form actually sends "".
    expect(parsed.subtitle).toBeUndefined();
  });

  it('requires the owning team member', () => {
    expect(createCvEntrySchema.safeParse({ ...VALID, teamMemberId: undefined }).success).toBe(
      false,
    );
  });

  it('rejects a section that is not one of the seven', () => {
    expect(createCvEntrySchema.safeParse({ ...VALID, section: 'hobbies' }).success).toBe(false);
  });

  it('rejects an empty title', () => {
    expect(createCvEntrySchema.safeParse({ ...VALID, title: '   ' }).success).toBe(false);
  });

  it('keeps a year range as free text rather than coercing it', () => {
    expect(createCvEntrySchema.parse({ ...VALID, year: '2019–2023' }).year).toBe('2019–2023');
    expect(createCvEntrySchema.parse({ ...VALID, year: 'present' }).year).toBe('present');
  });

  it('turns a blank optional field into null, not an empty string', () => {
    const parsed = createCvEntrySchema.parse({ ...VALID, subtitle: '', year: '' });

    expect(parsed.subtitle).toBeNull();
    expect(parsed.year).toBeNull();
  });

  it('strips HTML from free text', () => {
    const parsed = createCvEntrySchema.parse({
      ...VALID,
      description: 'Thesis <script>alert(1)</script> on formal methods',
    });

    expect(parsed.description).not.toContain('<script>');
  });
});

describe('updateCvEntrySchema', () => {
  it('accepts a partial patch', () => {
    expect(updateCvEntrySchema.parse({ title: 'Renamed' })).toEqual({ title: 'Renamed' });
  });

  it('allows moving an entry between sections', () => {
    expect(updateCvEntrySchema.parse({ section: 'teaching_role' }).section).toBe('teaching_role');
  });

  it('does not let an update move an entry to another member', () => {
    expect(updateCvEntrySchema.parse({ teamMemberId: 'mem_2' })).not.toHaveProperty('teamMemberId');
  });
});

describe('createCourseSchema', () => {
  const VALID = { teamMemberId: 'mem_1', title: 'Applied Cryptography', level: 'Graduate' };

  it('accepts a course with no code and no term', () => {
    const parsed = createCourseSchema.parse(VALID);

    expect(parsed.code).toBeUndefined();
    expect(parsed.term).toBeUndefined();
  });

  it('turns the blank strings a form actually sends into nulls', () => {
    const parsed = createCourseSchema.parse({ ...VALID, code: '', term: '' });

    expect(parsed.code).toBeNull();
    expect(parsed.term).toBeNull();
  });

  it('requires a level, because it is the grouping key on the public tab', () => {
    expect(
      createCourseSchema.safeParse({ teamMemberId: 'mem_1', title: 'Applied Cryptography' })
        .success,
    ).toBe(false);
    expect(createCourseSchema.safeParse({ ...VALID, level: '  ' }).success).toBe(false);
  });

  it('treats an untouched link input as no link rather than a validation failure', () => {
    expect(createCourseSchema.parse({ ...VALID, link: '' }).link).toBeNull();
  });

  it('rejects a link that is not a URL', () => {
    expect(createCourseSchema.safeParse({ ...VALID, link: 'not-a-url' }).success).toBe(false);
  });

  it('requires the owning team member', () => {
    expect(createCourseSchema.safeParse({ title: 'X', level: 'Graduate' }).success).toBe(false);
  });

  it('coerces the sort order from a form string', () => {
    expect(createCourseSchema.parse({ ...VALID, sortOrder: '3' }).sortOrder).toBe(3);
  });
});
