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

  // An empty list is valid and renders no byline. If this ever stops parsing, every publication
  // saved without authors breaks.
  it('accepts an empty author list', () => {
    const result = createPublicationSchema.safeParse({
      title: 'X',
      venue: 'Z',
      year: 2024,
      link: 'https://example.com',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.authors).toEqual([]);
  });

  it('keeps only the name of each author, dropping the removed link fields', () => {
    const result = createPublicationSchema.safeParse({
      title: 'X',
      authors: [{ name: 'J. Jaimunk', teamMemberId: 'tm_1', isProfileOwner: true }],
      venue: 'Z',
      year: 2024,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.authors).toEqual([{ name: 'J. Jaimunk' }]);
  });

  it('allows the same name twice — two authors can share a name', () => {
    const result = createPublicationSchema.safeParse({
      title: 'X',
      authors: [{ name: 'J. Park' }, { name: 'J. Park' }],
      venue: 'Z',
      year: 2024,
    });
    expect(result.success).toBe(true);
  });

  it('rejects more than 50 authors', () => {
    const result = createPublicationSchema.safeParse({
      title: 'X',
      authors: Array.from({ length: 51 }, (_, i) => ({ name: `A${i}` })),
      venue: 'Z',
      year: 2024,
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
