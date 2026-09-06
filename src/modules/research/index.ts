// research module — research works CRUD (title, summary, area, contributors, sortOrder).

export {
  createResearchSchema,
  updateResearchSchema,
  type CreateResearchInput,
  type UpdateResearchInput,
} from './research.schema';

export type { Research, ResearchContributor, ResearchStats, AuditContext } from './research.types';

export {
  createResearchService,
  type ResearchService,
  type ResearchServiceDeps,
} from './research.service';

export type { ResearchRepository } from './research.repository';

export { getResearchService } from './container';

export { ResearchList } from './ui/research-list';
export { ResearchTable } from './ui/research-table';
