import { describe, expect, it } from 'vitest';
import {
  TEAM_KINDS,
  TEAM_KIND_RULES,
  allowsCourses,
  allowsCvSection,
  allowsProjects,
  allowsResearchAndPublications,
  isDirectorTeam,
} from './team-kind';
import { CV_SECTIONS } from '@/modules/teaching/teaching.types';

// This table is the single source of truth the teaching service enforces on write and the profile
// read gates on, so it is pinned here the way `revalidate.test.ts` pins its literal paths: a silent
// change to a row would otherwise only show up as a section quietly appearing on a public page.

describe('team kind rules', () => {
  it.each(['director', 'professor'] as const)('gives %s the whole profile', (kind) => {
    expect([...TEAM_KIND_RULES[kind].cvSections].sort()).toEqual([...CV_SECTIONS].sort());
    expect(allowsCourses(kind)).toBe(true);
    expect(allowsProjects(kind)).toBe(true);
    expect(allowsResearchAndPublications(kind)).toBe(true);
  });

  it('gives research members research interests, projects and bylines only', () => {
    expect(TEAM_KIND_RULES.research.cvSections).toEqual(['research_interest']);
    expect(allowsCvSection('research', 'research_interest')).toBe(true);
    expect(allowsCvSection('research', 'education')).toBe(false);
    expect(allowsCourses('research')).toBe(false);
    expect(allowsProjects('research')).toBe(true);
    expect(allowsResearchAndPublications('research')).toBe(true);
  });

  it('gives development members projects only — no CV, no courses, no bylines', () => {
    expect(TEAM_KIND_RULES.development.cvSections).toEqual([]);
    for (const section of CV_SECTIONS) {
      expect(allowsCvSection('development', section)).toBe(false);
    }
    expect(allowsCourses('development')).toBe(false);
    expect(allowsProjects('development')).toBe(true);
    expect(allowsResearchAndPublications('development')).toBe(false);
  });

  it('allows projects for every team', () => {
    expect(TEAM_KINDS.every(allowsProjects)).toBe(true);
  });

  it('names exactly one director team', () => {
    expect(TEAM_KINDS.filter(isDirectorTeam)).toEqual(['director']);
  });
});
