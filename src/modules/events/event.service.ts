import { NotFoundError } from '@/modules/shared/lib/errors';
import { attempt, type Result } from '@/modules/shared/lib/result';
import { logger as defaultLogger, type Logger } from '@/modules/shared/lib/logger';
import type { EventRepository, NewParticipant } from './event.repository';
import type { Event, EventParticipant, EventStats } from './event.types';
import type { AddParticipantInput, CreateEventInput, UpdateEventInput } from './event.schema';

// Business layer for Events. An event is plain published content: no status, no lifecycle, no
// approval step, no per-row visibility flag — so unlike the Appointment service it replaced, there
// are no illegal transitions to reject and nothing here returns 409. Every event is public the
// moment it is created.

/**
 * The subset of a team member this module needs in order to snapshot them onto an event.
 * Deliberately not the research-groups `TeamMember` type: events depend on a shape, not on that
 * module's model, so the two can evolve independently.
 */
export type TeamMemberSnapshot = {
  id: string;
  name: string;
  role: string;
  photoUrl: string | null;
};

/**
 * Port onto the team-member data this module needs. Injected rather than imported so the events
 * service never reaches into another module's repository, and so the expansion logic below is
 * testable without a database. Wired to the research-groups service in `container.ts`.
 */
export interface TeamMemberDirectory {
  byId(id: string): Promise<TeamMemberSnapshot | null>;
}

export type EventServiceDeps = {
  repository: EventRepository;
  teamMembers: TeamMemberDirectory;
  logger?: Logger;
};

/** What an add produced — `skipped` counts people already on the event. */
export type AddParticipantsResult = {
  added: EventParticipant[];
  skipped: number;
};

export interface EventService {
  /** Every event, newest first. */
  list(): Promise<Result<Event[]>>;
  /**
   * Headline counts for the dashboard, aggregated in SQL. `now` is the upcoming/past boundary and
   * defaults to the current clock, exactly like `splitByTiming` — pass one only to pin it in tests.
   */
  stats(now?: Date): Promise<Result<EventStats>>;
  create(input: CreateEventInput, actor: string): Promise<Result<Event>>;
  update(id: string, input: UpdateEventInput, actor: string): Promise<Result<Event>>;
  /** Returns the removed record (pre-delete snapshot) for confirmation. */
  remove(id: string, actor: string): Promise<Result<Event>>;

  /** Add one person — a team member (snapshotted server-side) or a free-text guest. */
  addParticipant(
    eventId: string,
    input: AddParticipantInput,
    actor: string,
  ): Promise<Result<AddParticipantsResult>>;

  removeParticipant(
    eventId: string,
    participantId: string,
    actor: string,
  ): Promise<Result<EventParticipant>>;
}

/** Freeze a member's current details onto the event row — see `EventParticipant`. */
function snapshotOf(member: TeamMemberSnapshot): NewParticipant {
  return {
    teamMemberId: member.id,
    name: member.name,
    role: member.role,
    photoUrl: member.photoUrl,
  };
}

export function createEventService(deps: EventServiceDeps): EventService {
  const { repository, teamMembers } = deps;
  const log = deps.logger ?? defaultLogger;

  async function requireExisting(id: string): Promise<Event> {
    const existing = await repository.findById(id);
    if (!existing) throw new NotFoundError('Event not found.');
    return existing;
  }

  return {
    list: () => attempt(() => repository.list()),

    stats: (now = new Date()) => attempt(() => repository.stats(now)),

    create: (input, actor) =>
      attempt(async () => {
        const created = await repository.createWithAudit({
          data: input,
          audit: { actor, action: 'event.create' },
        });
        log.info('event_created', { id: created.id, actor });
        return created;
      }),

    update: (id, input, actor) =>
      attempt(async () => {
        await requireExisting(id);
        const updated = await repository.updateWithAudit({
          id,
          data: input,
          audit: { actor, action: 'event.update' },
        });
        log.info('event_updated', { id, actor });
        return updated;
      }),

    remove: (id, actor) =>
      attempt(async () => {
        const existing = await requireExisting(id);
        // The audit entry carries the full pre-delete state, written inside the same transaction
        // as the delete. An event's description and media list are otherwise unrecoverable — this
        // is the same before-state convention the deleted appointment module used.
        await repository.deleteWithAudit({
          id,
          audit: {
            actor,
            action: 'event.delete',
            metadata: {
              title: existing.title,
              eventDate: existing.eventDate.toISOString(),
              description: existing.description,
              photoUrls: existing.photoUrls,
              videoUrls: existing.videoUrls,
            },
          },
        });
        log.info('event_deleted', { id, actor });
        return existing;
      }),

    addParticipant: (eventId, input, actor) =>
      attempt(async () => {
        await requireExisting(eventId);

        let participant: NewParticipant;
        if (input.kind === 'guest') {
          participant = {
            teamMemberId: null,
            name: input.name,
            role: input.role ?? null,
            photoUrl: null,
          };
        } else {
          // A member's details are read here and frozen onto the row. The client sends only an id,
          // so it cannot claim someone attended under a name or title they never held.
          const member = await teamMembers.byId(input.teamMemberId);
          if (!member) throw new NotFoundError('Team member not found.');
          participant = snapshotOf(member);
        }

        const added = await repository.addParticipantsWithAudit({
          eventId,
          participants: [participant],
          audit: { actor, action: 'event.participant.add' },
        });
        log.info('event_participant_added', { eventId, actor, added: added.length });
        return { added, skipped: 1 - added.length };
      }),

    removeParticipant: (eventId, participantId, actor) =>
      attempt(async () => {
        const removed = await repository.removeParticipantWithAudit({
          eventId,
          participantId,
          audit: { actor, action: 'event.participant.remove' },
        });
        log.info('event_participant_removed', { eventId, participantId, actor });
        return removed;
      }),
  };
}

/**
 * Splits a newest-first list into the two halves the public tab renders. Pure and clock-injectable
 * so the boundary is testable; the page passes no `now`, evaluating it at render time.
 *
 * An event whose date is exactly now counts as upcoming — the boundary has to fall on one side,
 * and "starting right now" is not yet past.
 */
export function splitByTiming(
  events: Event[],
  now: Date = new Date(),
): { upcoming: Event[]; past: Event[] } {
  const upcoming: Event[] = [];
  const past: Event[] = [];
  for (const event of events) {
    if (event.eventDate.getTime() >= now.getTime()) upcoming.push(event);
    else past.push(event);
  }
  // The repository returns newest-first, which is right for past events (most recent first) but
  // backwards for upcoming ones — the next thing happening should lead.
  upcoming.reverse();
  return { upcoming, past };
}
