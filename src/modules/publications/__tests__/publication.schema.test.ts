import { describe, expect, it } from 'vitest';
import { createPublicationSchema, updatePublicationSchema } from '../publication.schema';

describe('createPublicationSchema', () => {
  it('parses a valid publication', () => {
    const result = createPublicationSchema.safeParse({
      title: 'Evasive Malware Detection',
      authors: [{ name: 'A. Author' }, { name: 'B. Author' }],
      venue: 'USENIX Security',
      year: 2024,
      link: 'https://doi.org/10.1234/abcd',
    });
    expect(result.success).toBe(true);
  });

  it('coerces a numeric-string year', () => {
    const result = createPublicationSchema.safeParse({
      title: 'X',
      authors: [],
      venue: 'Z',
      year: '2024',
      link: 'https://example.com',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.year).toBe(2024);
  });

  it('rejects an out-of-range year', () => {
    const result = createPublicationSchema.safeParse({
      title: 'X',
      authors: [],
      venue: 'Z',
      year: 1899,
      link: 'https://example.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-URL link', () => {
    const result = createPublicationSchema.safeParse({
      title: 'X',
      authors: [],
      venue: 'Z',
      year: 2024,
      link: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('strips HTML from free-text fields', () => {
    const result = createPublicationSchema.safeParse({
      title: '<b>Evasive</b> Malware',
      authors: [{ name: 'A. Author' }],
      venue: 'USENIX',
      year: 2024,
      link: 'https://example.com',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.title).toBe('Evasive Malware');
  });

  // Attribution is rows, not a column, so "the professor's own solo work" is an EMPTY list — not a
  // null, not a placeholder name. If this ever stops parsing, every solo publication breaks.
  it('accepts an empty author list, which means solo work', () => {
    const result = createPublicationSchema.safeParse({
      title: 'X',
      venue: 'Z',
      year: 2024,
      link: 'https://example.com',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.authors).toEqual([]);
  });

  it('accepts linked team members and outside co-authors in one list', () => {
    const result = createPublicationSchema.safeParse({
      title: 'X',
      authors: [
        { teamMemberId: 'tm_1', name: 'R. Lindqvist' },
        { teamMemberId: null, name: 'T. Meyer' },
      ],
      venue: 'Z',
      year: 2024,
      link: 'https://example.com',
    });
    expect(result.success).toBe(true);
  });

  // Caught here rather than left to the composite unique index, which would surface as a database
  // constraint error the admin cannot read.
  it('rejects the same team member credited twice', () => {
    const result = createPublicationSchema.safeParse({
      title: 'X',
      authors: [
        { teamMemberId: 'tm_1', name: 'R. Lindqvist' },
        { teamMemberId: 'tm_1', name: 'R. Lindqvist' },
      ],
      venue: 'Z',
      year: 2024,
      link: 'https://example.com',
    });
    expect(result.success).toBe(false);
  });

  it('allows two unlinked authors, who are distinct people with no id to collide', () => {
    const result = createPublicationSchema.safeParse({
      title: 'X',
      authors: [{ name: 'A. One' }, { name: 'B. Two' }],
      venue: 'Z',
      year: 2024,
      link: 'https://example.com',
    });
    expect(result.success).toBe(true);
  });

  // Mirrors the partial unique index on publication_author. She is one person; two owner rows on
  // one paper is a data error the admin should see as a sentence, not a constraint violation.
  it('rejects the professor being credited twice on one publication', () => {
    const result = createPublicationSchema.safeParse({
      title: 'X',
      authors: [
        { name: 'J. Jaimunk', isProfileOwner: true },
        { name: 'J. Jaimunk', isProfileOwner: true },
      ],
      venue: 'Z',
      year: 2024,
      link: 'https://example.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an over-length author name', () => {
    const result = createPublicationSchema.safeParse({
      title: 'X',
      authors: [{ name: 'a'.repeat(201) }],
      venue: 'Z',
      year: 2024,
      link: 'https://example.com',
    });
    expect(result.success).toBe(false);
  });
});

describe('updatePublicationSchema', () => {
  it('allows a partial update', () => {
    const result = updatePublicationSchema.safeParse({ year: 2025 });
    expect(result.success).toBe(true);
  });
});
