// projects module — what a team member built, rendered on their profile page at `/team/[id]`.
// Allowed for every team (see shared/lib/team-kind), and the only content section a `development`
// member has besides their bio and links. Admin CRUD only: there is no public /api/projects route,
// because projects are read as part of the member profile the research-groups service assembles.

export {
  createProjectSchema,
  updateProjectSchema,
  listProjectsQuerySchema,
  type CreateProjectInput,
  type UpdateProjectInput,
  type ListProjectsQuery,
} from './project.schema';

export type { Project, ProjectStats, AuditContext } from './project.types';

export {
  createProjectService,
  type ProjectService,
  type ProjectServiceDeps,
} from './project.service';

export type { ProjectRepository } from './project.repository';

export { getProjectService } from './container';

export { ProjectList } from './ui/project-list';
export { ProjectsAdmin } from './ui/projects-admin';
