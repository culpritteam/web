import { getTeamMemberService } from '@/modules/research-groups';
import { PrismaCvEntryRepository } from './cv-entry.repository';
import { PrismaCourseRepository } from './course.repository';
import {
  createCvEntryService,
  createCourseService,
  type CvEntryService,
  type CourseService,
  type MemberTeamDirectory,
} from './teaching.service';

// Composition root: wires the Prisma-backed repositories, and the research-groups module's team
// lookup, into the services. Route handlers and Server Components call these getters and nothing
// else.
//
// research-groups imports this module's services too (to assemble a member's profile), so the two
// composition roots form an import cycle. It is safe because it is entirely lazy: neither module
// dereferences the other at import time — every use is inside a method body that only runs once a
// request is being served, by which point both modules are fully evaluated.

const memberTeams: MemberTeamDirectory = {
  async teamKindOf(teamMemberId) {
    const result = await getTeamMemberService().findById(teamMemberId);
    if (!result.ok) throw result.error;
    return result.data?.teamKind ?? null;
  },
};

let cachedEntries: CvEntryService | undefined;
let cachedCourses: CourseService | undefined;

export function getCvEntryService(): CvEntryService {
  if (!cachedEntries) {
    cachedEntries = createCvEntryService({
      repository: new PrismaCvEntryRepository(),
      members: memberTeams,
    });
  }
  return cachedEntries;
}

export function getCourseService(): CourseService {
  if (!cachedCourses) {
    cachedCourses = createCourseService({
      repository: new PrismaCourseRepository(),
      members: memberTeams,
    });
  }
  return cachedCourses;
}
