import { getCourseService, getCvEntryService } from '@/modules/teaching';
import { PrismaTeamMemberRepository } from './team-member.repository';
import {
  createTeamMemberService,
  type MemberCvDirectory,
  type TeamMemberService,
} from './team-member.service';

// Composition root: wires the Prisma-backed repository and the teaching module's per-member reads
// into the service. Route handlers and Server Components call getTeamMemberService() and nothing
// else.

const memberCv: MemberCvDirectory = {
  async cvEntriesFor(teamMemberId) {
    const result = await getCvEntryService().listForMember(teamMemberId);
    if (!result.ok) throw result.error;
    return result.data;
  },
  async coursesFor(teamMemberId) {
    const result = await getCourseService().listForMember(teamMemberId);
    if (!result.ok) throw result.error;
    return result.data;
  },
};

let cached: TeamMemberService | undefined;

export function getTeamMemberService(): TeamMemberService {
  if (!cached) {
    cached = createTeamMemberService({
      repository: new PrismaTeamMemberRepository(),
      cv: memberCv,
    });
  }
  return cached;
}
