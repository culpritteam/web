// events module — admin-authored events shown on the public Events tab, split into Upcoming and
// Past by `eventDate` at render time. Replaced the appointments module on 2026-09-01: the public
// Make Appointment tab (Calendly embed) is unaffected and still exists, but nothing a visitor
// books there is recorded locally, so there is no admin-side appointment screen anymore.

export {
  createEventSchema,
  updateEventSchema,
  addParticipantSchema,
  participantIdSchema,
  type CreateEventInput,
  type UpdateEventInput,
  type AddParticipantInput,
} from './event.schema';

export type { Event, EventParticipant, EventTiming, EventStats, AuditContext } from './event.types';

export {
  createEventService,
  splitByTiming,
  type EventService,
  type EventServiceDeps,
  type TeamMemberDirectory,
  type TeamMemberSnapshot,
  type AddParticipantsResult,
} from './event.service';

export type { EventRepository } from './event.repository';

export { getEventService } from './container';

export { EventList } from './ui/event-list';
export { PastEventList } from './ui/past-event-list';
export { EventsTable } from './ui/events-table';
