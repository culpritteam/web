'use client';

import { useState } from 'react';
import { CalendarDays, ImageIcon, Plus, Users, Video } from 'lucide-react';
import { useDeleteRecord } from '@/modules/shared/lib/use-delete-record';
import { Button } from '@/modules/shared/ui/button';
import { FormSection, FormSectionCount } from '@/modules/shared/ui/form-section';
import { EmptyState } from '@/modules/shared/ui/empty-state';
import { ConfirmDialog } from '@/modules/shared/ui/confirm-dialog';
import { RowActions } from '@/modules/shared/ui/row-actions';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/ui/table';
import { INSTITUTION_TIME_ZONE } from '@/modules/shared/lib/timezone';
// Deep imports, not the barrel — see event-form-dialog.tsx's comment.
import type { Event } from '../event.types';
import { EventFormDialog } from './event-form-dialog';
import {
  EventParticipantsDialog,
  type ParticipantPerson,
} from './event-participants-dialog';

// Admin: Manage Events. Replaced Manage Appointments on 2026-09-01, and is a plainer screen than
// the one it replaced — an event has no status, no cancel/reschedule actions and no public/private
// toggle, so the row actions are just edit and delete.

// Pinned to the institution's zone for the same reason the public list is — the admin table and
// the public page must not disagree about what day an event is on.
// `timeStyle` can't be combined with explicit date component options (day/month/year) — Intl
// throws "Invalid option : option" if you try. Spell the time out as hour/minute instead.
const dateTimeFormatter = new Intl.DateTimeFormat('en', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: INSTITUTION_TIME_ZONE,
});

export function EventsTable({
  items,
  members = [],
}: {
  items: Event[];
  /** Pickers for the participants dialog. Default empty so the table still renders without them. */
  members?: ParticipantPerson[];
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Event | undefined>(undefined);
  const [participantsFor, setParticipantsFor] = useState<Event | undefined>(undefined);

  // Re-read from `items` on every render rather than holding the opened event in state: the dialog
  // mutates participants and calls router.refresh(), so the copy captured when it opened would go
  // stale the moment somebody was added.
  const participantsEvent = participantsFor
    ? (items.find((item) => item.id === participantsFor.id) ?? participantsFor)
    : undefined;

  const remove = useDeleteRecord<Event>((id) => `/api/admin/events/${id}`);

  // Evaluated once per render, client-side: this is only a label, and the authoritative split is
  // done server-side on the public tab.
  const now = Date.now();

  return (
    <div id="events" className="scroll-mt-24">
      <FormSection
        title="Events"
        description="Talks, workshops and visits. Upcoming and past are split by date on the public tab."
        badge={<FormSectionCount count={items.length} />}
        action={
          <Button
            aria-label="Add event"
            onClick={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
          >
            <Plus className="size-4" aria-hidden="true" />
            Add
          </Button>
        }
      >
        {items.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No events yet."
            description="Add the first event to show it on the public Events tab."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Media</TableHead>
                <TableHead>People</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const upcoming = item.eventDate.getTime() >= now;
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium text-foreground">{item.title}</TableCell>
                    <TableCell className="text-muted-foreground">
                      <span className="tabular">{dateTimeFormatter.format(item.eventDate)}</span>
                      {/* Upcoming/past is derived from the date in the same cell, not given its own
                        column: it is a reading of that date, not a separate fact about the row. */}
                      <span className="mt-0.5 block font-mono text-xs uppercase tracking-[0.12em]">
                        {upcoming ? 'Upcoming' : 'Past'}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <span className="flex items-center gap-3 text-xs">
                        <span className="flex items-center gap-1">
                          <ImageIcon className="size-3.5" aria-hidden="true" />
                          <span className="tabular">{item.photoUrls.length}</span>
                          <span className="sr-only">
                            {item.photoUrls.length === 1 ? 'photo' : 'photos'}
                          </span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Video className="size-3.5" aria-hidden="true" />
                          <span className="tabular">{item.videoUrls.length}</span>
                          <span className="sr-only">
                            {item.videoUrls.length === 1 ? 'video' : 'videos'}
                          </span>
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <span className="tabular text-xs">{item.participants.length}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActions
                        editLabel={`Edit: ${item.title}`}
                        deleteLabel={`Delete: ${item.title}`}
                        onEdit={() => {
                          setEditing(item);
                          setFormOpen(true);
                        }}
                        onDelete={() => remove.request(item)}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Participants: ${item.title}`}
                          onClick={() => setParticipantsFor(item)}
                        >
                          <Users className="size-4" aria-hidden="true" />
                        </Button>
                      </RowActions>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </FormSection>

      <EventFormDialog open={formOpen} onOpenChange={setFormOpen} event={editing} />

      <EventParticipantsDialog
        open={Boolean(participantsFor)}
        onOpenChange={(open) => !open && setParticipantsFor(undefined)}
        event={participantsEvent}
        members={members}
      />

      <ConfirmDialog
        {...remove.dialogProps}
        title="Delete this event?"
        // Says what actually survives: the uploaded photos stay in object storage (nothing here
        // reaches into R2), and the audit entry keeps the event's before-state.
        description="The event is removed from the public tab. This action cannot be undone."
      />
    </div>
  );
}
