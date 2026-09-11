import { describe, expect, it } from 'vitest';
import {
  createEventService,
  splitByTiming,
  type TeamMemberDirectory,
  type TeamMemberSnapshot,
} from '../event.service';
import type { EventRepository, NewParticipant } from '../event.repository';
import type { AuditContext, Event, EventParticipant } from '../event.types';

const SILENT_LOGGER = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

function makeEvent(overrides: Partial<Event> = {}): Event {
  const now = new Date('2026-09-01T00:00:00Z');
  return {
    id: 'evt_1',
    title: 'Guest lecture',
    description: 'A talk.',
    content: null,
    eventDate: new Date('2026-10-14T04:00:00Z'),
    photoUrls: [],
    videoUrls: [],
    participants: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const MEMBERS: TeamMemberSnapshot[] = [
  { id: 'tm_1', name: 'Ada Lovelace', role: 'PhD Candidate', photoUrl: null },
  { id: 'tm_2', name: 'Alan Turing', role: 'Research Fellow', photoUrl: null },
  { id: 'tm_3', name: 'Grace Hopper', role: 'Visiting Professor', photoUrl: null },
];

const directory: TeamMemberDirectory = {
  async byId(id) {
    return MEMBERS.find((member) => member.id === id) ?? null;
  },
};

class FakeRepository implements EventRepository {
  store = new Map<string, Event>();
  audits: (AuditContext & { entityId: string })[] = [];
  private seq = 0;

  seed(event: Event) {
    this.store.set(event.id, { ...event });
  }

  async findById(id: string): Promise<Event | null> {
    const found = this.store.get(id);
    return found ? { ...found } : null;
  }

  async list(): Promise<Event[]> {
    return [...this.store.values()].sort((a, b) => b.eventDate.getTime() - a.eventDate.getTime());
  }

  // Answers the aggregate through splitByTiming itself, so a drift between the dashboard's counts
  // and the public tab's split would fail here rather than ship.
  async stats(now: Date) {
    const rows = await this.list();
    const { upcoming } = splitByTiming(rows, now);
    return {
      total: rows.length,
      upcoming: upcoming.length,
      nextEventDate: upcoming[0]?.eventDate ?? null,
    };
  }

  async createWithAudit(input: { data: Partial<Event>; audit: AuditContext }): Promise<Event> {
    const id = `evt_${++this.seq}`;
    // `content` is optional on the input but required on Event, so it is normalised here rather
    // than spread straight through.
    const event = makeEvent({ ...input.data, content: input.data.content ?? null, id });
    this.store.set(id, event);
    this.audits.push({ ...input.audit, entityId: id });
    return { ...event };
  }

  async updateWithAudit(input: {
    id: string;
    data: Partial<Event>;
    audit: AuditContext;
  }): Promise<Event> {
    const current = this.store.get(input.id);
    if (!current) throw new Error('not found');
    const updated = { ...current, ...input.data };
    this.store.set(input.id, updated);
    this.audits.push({ ...input.audit, entityId: input.id });
    return { ...updated };
  }

  async deleteWithAudit(input: { id: string; audit: AuditContext }): Promise<void> {
    this.store.delete(input.id);
    this.audits.push({ ...input.audit, entityId: input.id });
  }

  // Mirrors the real repository's skip-on-duplicate behaviour, which is what lets the service
  // report "added 2, 1 already there" instead of failing the whole batch.
  async addParticipantsWithAudit(input: {
    eventId: string;
    participants: NewParticipant[];
    audit: AuditContext;
  }): Promise<EventParticipant[]> {
    const event = this.store.get(input.eventId);
    if (!event) throw new Error('not found');
    const taken = new Set(event.participants.map((p) => p.teamMemberId).filter(Boolean));

    const written: EventParticipant[] = [];
    for (const participant of input.participants) {
      if (participant.teamMemberId !== null && taken.has(participant.teamMemberId)) continue;
      if (participant.teamMemberId !== null) taken.add(participant.teamMemberId);
      written.push({
        id: `p_${++this.seq}`,
        eventId: input.eventId,
        teamMemberId: participant.teamMemberId,
        name: participant.name,
        role: participant.role,
        photoUrl: participant.photoUrl,
        sortOrder: event.participants.length + written.length,
      });
    }
    this.store.set(input.eventId, {
      ...event,
      participants: [...event.participants, ...written],
    });
    if (written.length > 0) this.audits.push({ ...input.audit, entityId: input.eventId });
    return written;
  }

  async removeParticipantWithAudit(input: {
    eventId: string;
    participantId: string;
    audit: AuditContext;
  }): Promise<EventParticipant> {
    const event = this.store.get(input.eventId);
    const found = event?.participants.find((p) => p.id === input.participantId);
    if (!event || !found) throw new Error('not found');
    this.store.set(input.eventId, {
      ...event,
      participants: event.participants.filter((p) => p.id !== input.participantId),
    });
    this.audits.push({ ...input.audit, entityId: input.eventId });
    return found;
  }
}

function makeService() {
  const repository = new FakeRepository();
  const service = createEventService({
    repository,
    teamMembers: directory,
    logger: SILENT_LOGGER,
  });
  return { repository, service };
}

describe('event service', () => {
  it('creates an event and writes an audit entry', async () => {
    const { repository, service } = makeService();

    const result = await service.create(
      {
        title: 'Workshop',
        description: 'Hands-on.',
        eventDate: new Date('2026-11-02T07:00:00Z'),
      },
      'admin:1',
    );

    expect(result.ok).toBe(true);
    expect(repository.audits).toHaveLength(1);
    expect(repository.audits[0]).toMatchObject({ actor: 'admin:1', action: 'event.create' });
  });

  it('rejects an update to an id that does not exist', async () => {
    const { service } = makeService();

    const result = await service.update('missing', { title: 'x' }, 'admin:1');

    expect(result.ok).toBe(false);
  });

  it('records the full before-state when deleting', async () => {
    const { repository, service } = makeService();
    repository.seed(
      makeEvent({ id: 'evt_9', title: 'Panel', photoUrls: ['https://cdn.example.org/a.jpg'] }),
    );

    const result = await service.remove('evt_9', 'admin:1');

    expect(result.ok).toBe(true);
    expect(repository.store.has('evt_9')).toBe(false);
    expect(repository.audits[0]).toMatchObject({
      action: 'event.delete',
      metadata: { title: 'Panel', photoUrls: ['https://cdn.example.org/a.jpg'] },
    });
  });

  it('refuses to delete an id that does not exist', async () => {
    const { service } = makeService();

    const result = await service.remove('missing', 'admin:1');

    expect(result.ok).toBe(false);
  });

  it('stats() agrees with splitByTiming on the same clock', async () => {
    const { repository, service } = makeService();
    const now = new Date('2026-09-01T12:00:00Z');
    const seeded = [
      makeEvent({ id: 'far', eventDate: new Date('2026-12-01T00:00:00Z') }),
      makeEvent({ id: 'soon', eventDate: new Date('2026-09-10T00:00:00Z') }),
      makeEvent({ id: 'recent', eventDate: new Date('2026-08-20T00:00:00Z') }),
    ];
    for (const event of seeded) repository.seed(event);

    const result = await service.stats(now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { upcoming } = splitByTiming(await repository.list(), now);
    expect(result.data).toEqual({
      total: 3,
      upcoming: upcoming.length,
      nextEventDate: upcoming[0]!.eventDate,
    });
    expect(result.data.nextEventDate).toEqual(new Date('2026-09-10T00:00:00Z'));
  });

  it('stats() counts an event starting exactly now as upcoming, like splitByTiming', async () => {
    const { repository, service } = makeService();
    const now = new Date('2026-09-01T12:00:00Z');
    repository.seed(makeEvent({ id: 'exact', eventDate: now }));

    const result = await service.stats(now);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ total: 1, upcoming: 1, nextEventDate: now });
  });

  it('stats() reports no next event when nothing is ahead', async () => {
    const { repository, service } = makeService();
    repository.seed(makeEvent({ id: 'old', eventDate: new Date('2026-01-05T00:00:00Z') }));

    const result = await service.stats(new Date('2026-09-01T12:00:00Z'));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ total: 1, upcoming: 0, nextEventDate: null });
  });
});

describe('event participants', () => {
  it('snapshots a team member onto the event rather than storing only a link', async () => {
    const { repository, service } = makeService();
    repository.seed(makeEvent({ id: 'evt_9' }));

    const result = await service.addParticipant(
      'evt_9',
      { kind: 'member', teamMemberId: 'tm_1' },
      'admin:1',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The name and role come from the directory, not from the request — a client sending only an
    // id cannot claim somebody attended under a title they never held.
    expect(result.data.added[0]).toMatchObject({
      teamMemberId: 'tm_1',
      name: 'Ada Lovelace',
      role: 'PhD Candidate',
    });
    expect(repository.audits.at(-1)).toMatchObject({ action: 'event.participant.add' });
  });

  it('adds a guest with no team-member link', async () => {
    const { repository, service } = makeService();
    repository.seed(makeEvent({ id: 'evt_9' }));

    const result = await service.addParticipant(
      'evt_9',
      { kind: 'guest', name: 'Visiting Speaker', role: 'Keynote' },
      'admin:1',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.added[0]).toMatchObject({
      teamMemberId: null,
      name: 'Visiting Speaker',
      role: 'Keynote',
    });
  });

  it('rejects an unknown team member and an unknown event', async () => {
    const { repository, service } = makeService();
    repository.seed(makeEvent({ id: 'evt_9' }));

    const badMember = await service.addParticipant(
      'evt_9',
      { kind: 'member', teamMemberId: 'nope' },
      'a',
    );
    const badEvent = await service.addParticipant(
      'missing',
      { kind: 'member', teamMemberId: 'tm_1' },
      'a',
    );

    expect(badMember.ok).toBe(false);
    expect(badEvent.ok).toBe(false);
  });

  it('removes a participant and audits it', async () => {
    const { repository, service } = makeService();
    repository.seed(makeEvent({ id: 'evt_9' }));
    const added = await service.addParticipant(
      'evt_9',
      { kind: 'member', teamMemberId: 'tm_1' },
      'a',
    );
    if (!added.ok) throw new Error('setup failed');

    const result = await service.removeParticipant('evt_9', added.data.added[0]!.id, 'admin:1');

    expect(result.ok).toBe(true);
    expect(repository.store.get('evt_9')!.participants).toEqual([]);
    expect(repository.audits.at(-1)).toMatchObject({ action: 'event.participant.remove' });
  });
});

describe('splitByTiming', () => {
  const now = new Date('2026-09-01T12:00:00Z');
  // Newest-first, the order the repository returns.
  const events = [
    makeEvent({ id: 'far', eventDate: new Date('2026-12-01T00:00:00Z') }),
    makeEvent({ id: 'soon', eventDate: new Date('2026-09-10T00:00:00Z') }),
    makeEvent({ id: 'recent', eventDate: new Date('2026-08-20T00:00:00Z') }),
    makeEvent({ id: 'old', eventDate: new Date('2026-01-05T00:00:00Z') }),
  ];

  it('puts the soonest upcoming event first and the most recent past event first', () => {
    const { upcoming, past } = splitByTiming(events, now);

    expect(upcoming.map((e) => e.id)).toEqual(['soon', 'far']);
    expect(past.map((e) => e.id)).toEqual(['recent', 'old']);
  });

  it('counts an event starting exactly now as upcoming', () => {
    const { upcoming, past } = splitByTiming([makeEvent({ id: 'exact', eventDate: now })], now);

    expect(upcoming.map((e) => e.id)).toEqual(['exact']);
    expect(past).toEqual([]);
  });

  it('handles an empty list', () => {
    expect(splitByTiming([], now)).toEqual({ upcoming: [], past: [] });
  });
});
