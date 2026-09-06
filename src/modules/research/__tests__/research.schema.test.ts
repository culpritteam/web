import { describe, expect, it } from 'vitest';
import { createResearchSchema, updateResearchSchema } from '../research.schema';

describe('createResearchSchema', () => {
  it('parses a valid research work', () => {
    const result = createResearchSchema.safeParse({
      title: 'Malware Analysis',
      summary: 'Studying evasive malware.',
      area: 'malware analysis',
      sortOrder: 2,
    });
    expect(result.success).toBe(true);
  });

  it('strips HTML from free-text fields', () => {
    const result = createResearchSchema.safeParse({
      title: '<b>Malware</b> Analysis',
      summary: '<script>alert(1)</script>Studying evasive malware.',
      area: 'malware',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.title).toBe('Malware Analysis');
    expect(result.data.summary).toBe('alert(1)Studying evasive malware.');
  });

  it('requires title, summary, and area', () => {
    const result = createResearchSchema.safeParse({});
    expect(result.success).toBe(false);
    if (result.success) return;
    const fieldErrors = result.error.flatten().fieldErrors;
    expect(fieldErrors.title).toBeDefined();
    expect(fieldErrors.summary).toBeDefined();
    expect(fieldErrors.area).toBeDefined();
  });

  it('defaults sortOrder to undefined when omitted (service applies 0)', () => {
    const result = createResearchSchema.safeParse({
      title: 'X',
      summary: 'Y',
      area: 'Z',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.sortOrder).toBeUndefined();
  });

  it('rejects a negative sortOrder', () => {
    const result = createResearchSchema.safeParse({
      title: 'X',
      summary: 'Y',
      area: 'Z',
      sortOrder: -1,
    });
    expect(result.success).toBe(false);
  });
  // Attribution is rows, not a column: an empty list is how "his own solo work" is expressed.
  it('accepts an empty contributor list, which means solo work', () => {
    const result = createResearchSchema.safeParse({
      title: 'Malware Analysis',
      summary: 'Studying evasive malware.',
      area: 'malware analysis',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.contributors).toEqual([]);
  });

  it('accepts linked team members and outside collaborators in one list', () => {
    const result = createResearchSchema.safeParse({
      title: 'Malware Analysis',
      summary: 'Studying evasive malware.',
      area: 'malware analysis',
      contributors: [
        { teamMemberId: 'tm_1', name: 'R. Lindqvist' },
        { teamMemberId: null, name: 'T. Meyer' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects the same team member credited twice', () => {
    const result = createResearchSchema.safeParse({
      title: 'Malware Analysis',
      summary: 'Studying evasive malware.',
      area: 'malware analysis',
      contributors: [
        { teamMemberId: 'tm_1', name: 'R. Lindqvist' },
        { teamMemberId: 'tm_1', name: 'R. Lindqvist' },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an over-length contributor name', () => {
    const result = createResearchSchema.safeParse({
      title: 'Malware Analysis',
      summary: 'Studying evasive malware.',
      area: 'malware analysis',
      contributors: [{ name: 'a'.repeat(201) }],
    });
    expect(result.success).toBe(false);
  });
});

describe('updateResearchSchema', () => {
  it('allows a partial update', () => {
    const result = updateResearchSchema.safeParse({ title: 'New title' });
    expect(result.success).toBe(true);
  });

  it('allows an empty object (no-op update rejected later by the service, not the schema)', () => {
    const result = updateResearchSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});
