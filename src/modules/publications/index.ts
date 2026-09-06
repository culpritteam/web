// publications module — publications CRUD (title, credited authors, venue, year, link).

export {
  createPublicationSchema,
  updatePublicationSchema,
  type CreatePublicationInput,
  type UpdatePublicationInput,
} from './publication.schema';

export type {
  Publication,
  PublicationAuthor,
  PublicationStats,
  AuditContext,
} from './publication.types';

export {
  createPublicationService,
  type PublicationService,
  type PublicationServiceDeps,
} from './publication.service';

export type { PublicationRepository } from './publication.repository';

export { getPublicationService } from './container';

export { PublicationsList } from './ui/publications-list';
export { PublicationsTable } from './ui/publications-table';
