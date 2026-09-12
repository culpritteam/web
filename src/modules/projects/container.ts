import { PrismaProjectRepository } from './project.repository';
import { createProjectService, type ProjectService } from './project.service';

// Composition root: wires the Prisma-backed repository into the service. Route handlers and Server
// Components call this getter and nothing else.

let cached: ProjectService | undefined;

export function getProjectService(): ProjectService {
  if (!cached) {
    cached = createProjectService({ repository: new PrismaProjectRepository() });
  }
  return cached;
}
