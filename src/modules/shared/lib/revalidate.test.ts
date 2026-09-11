import { revalidatePath } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { revalidateOn, revalidatePublic } from './revalidate';
import { err, ok } from './result';

// Regression coverage for the [locale]-stale-path bug (ADR-007): `revalidatePath` silently no-ops
// on a non-matching path instead of throwing, so a wrong path here would pass every other test
// while invalidating nothing in production. Asserting the exact literal paths is the point.

const mockedRevalidatePath = vi.mocked(revalidatePath);

beforeEach(() => {
  mockedRevalidatePath.mockClear();
});

describe('revalidatePublic', () => {
  it('revalidates the flat public route and its mirrored API route for research', () => {
    revalidatePublic('research');

    expect(mockedRevalidatePath).toHaveBeenCalledWith('/research');
    expect(mockedRevalidatePath).toHaveBeenCalledWith('/api/research');
    expect(mockedRevalidatePath).toHaveBeenCalledTimes(2);
  });

  it('revalidates publications page + API route', () => {
    revalidatePublic('publications');

    expect(mockedRevalidatePath).toHaveBeenCalledWith('/publications');
    expect(mockedRevalidatePath).toHaveBeenCalledWith('/api/publications');
  });

  it('revalidates the team page, every profile page, and the byline pages for team edits', () => {
    revalidatePublic('team');

    // The About page renders the director's card.
    expect(mockedRevalidatePath).toHaveBeenCalledWith('/');
    expect(mockedRevalidatePath).toHaveBeenCalledWith('/team');
    // A template path needs the `page` type, or it matches nothing.
    expect(mockedRevalidatePath).toHaveBeenCalledWith('/team/[id]', 'page');
    expect(mockedRevalidatePath).toHaveBeenCalledWith('/research');
    expect(mockedRevalidatePath).toHaveBeenCalledWith('/publications');
    expect(mockedRevalidatePath).toHaveBeenCalledWith('/api/team-members');
    expect(mockedRevalidatePath).not.toHaveBeenCalledWith('/api/groups');
  });

  it('revalidates every profile page and the teaching API route for CV/course edits', () => {
    revalidatePublic('teaching');

    expect(mockedRevalidatePath).toHaveBeenCalledWith('/team/[id]', 'page');
    expect(mockedRevalidatePath).toHaveBeenCalledWith('/api/teaching');
    expect(mockedRevalidatePath).toHaveBeenCalledTimes(2);
  });

  it('revalidates the events page and the events API route', () => {
    revalidatePublic('events');

    expect(mockedRevalidatePath).toHaveBeenCalledWith('/events');
    expect(mockedRevalidatePath).toHaveBeenCalledWith('/api/events');
  });

  it('revalidates only the appointment page (no matching public API route)', () => {
    revalidatePublic('appointment');

    expect(mockedRevalidatePath).toHaveBeenCalledWith('/appointment');
    expect(mockedRevalidatePath).toHaveBeenCalledTimes(1);
  });

  it('revalidates the root layout and /api/profile for profile edits', () => {
    revalidatePublic('profile');

    expect(mockedRevalidatePath).toHaveBeenCalledWith('/', 'layout');
    expect(mockedRevalidatePath).toHaveBeenCalledWith('/api/profile');
  });
});

describe('revalidateOn', () => {
  it('revalidates and returns the result on success', () => {
    const result = ok({ id: 'res_1' });

    const returned = revalidateOn(result, 'research');

    expect(returned).toBe(result);
    expect(mockedRevalidatePath).toHaveBeenCalledWith('/research');
  });

  it('does not revalidate on a failed result', () => {
    const result = err(new Error('conflict'));

    const returned = revalidateOn(result, 'research');

    expect(returned).toBe(result);
    expect(mockedRevalidatePath).not.toHaveBeenCalled();
  });
});
