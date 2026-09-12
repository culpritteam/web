import { NotFoundError } from '@/modules/shared/lib/errors';
import { attempt, type Result } from '@/modules/shared/lib/result';
import { logger as defaultLogger, type Logger } from '@/modules/shared/lib/logger';
import type { ProjectRepository } from './project.repository';
import type { Project, ProjectStats } from './project.types';
import type { CreateProjectInput, UpdateProjectInput } from './project.schema';

// Business layer for the Projects section of a team member's profile page. Projects are plain
// published content — no status, no lifecycle — and every team is allowed them, so there is no team
// rule to enforce here (unlike courses and CV entries in the teaching service). The service stays
// thin: existence checks, audit context, structured logging, errors on the Result channel.

export type ProjectServiceDeps = {
  repository: ProjectRepository;
  logger?: Logger;
};

export interface ProjectService {
  /** One member's projects, in the admin's arrangement. */
  listForMember(teamMemberId: string): Promise<Result<Project[]>>;
  /** Headline counts for the dashboard, aggregated in SQL. */
  stats(): Promise<Result<ProjectStats>>;
  create(input: CreateProjectInput, actor: string): Promise<Result<Project>>;
  update(id: string, input: UpdateProjectInput, actor: string): Promise<Result<Project>>;
  /** Returns the removed record (pre-delete snapshot) for confirmation. */
  remove(id: string, actor: string): Promise<Result<Project>>;
}

export function createProjectService(deps: ProjectServiceDeps): ProjectService {
  const { repository } = deps;
  const log = deps.logger ?? defaultLogger;

  async function requireExisting(id: string): Promise<Project> {
    const existing = await repository.findById(id);
    if (!existing) throw new NotFoundError('Project not found.');
    return existing;
  }

  return {
    listForMember: (teamMemberId) => attempt(() => repository.listForMember(teamMemberId)),

    stats: () => attempt(() => repository.stats()),

    create: (input, actor) =>
      attempt(async () => {
        const created = await repository.createWithAudit({
          data: input,
          audit: { actor, action: 'project.create' },
        });
        log.info('project_created', {
          id: created.id,
          teamMemberId: created.teamMemberId,
          actor,
        });
        return created;
      }),

    update: (id, input, actor) =>
      attempt(async () => {
        await requireExisting(id);
        const updated = await repository.updateWithAudit({
          id,
          data: input,
          audit: { actor, action: 'project.update' },
        });
        log.info('project_updated', { id, actor });
        return updated;
      }),

    remove: (id, actor) =>
      attempt(async () => {
        const existing = await requireExisting(id);
        // The before-state goes into the audit entry inside the delete transaction: a project write-up
        // is typed by hand and has no other copy once the row is gone.
        await repository.deleteWithAudit({
          id,
          audit: {
            actor,
            action: 'project.delete',
            metadata: {
              teamMemberId: existing.teamMemberId,
              title: existing.title,
              summary: existing.summary,
              link: existing.link,
            },
          },
        });
        log.info('project_deleted', { id, actor });
        return existing;
      }),
  };
}
