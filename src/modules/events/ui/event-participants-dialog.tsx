'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Plus, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { apiDelete, apiSend } from '@/modules/shared/lib/api-client';
import { Avatar } from '@/modules/shared/ui/avatar';
import { Button } from '@/modules/shared/ui/button';
import { Dialog, DialogFooter } from '@/modules/shared/ui/dialog';
import { EmptyState } from '@/modules/shared/ui/empty-state';
import { FormField } from '@/modules/shared/ui/form-field';
import { Input } from '@/modules/shared/ui/input';
import { Select } from '@/modules/shared/ui/select';
// Deep imports, not the barrel — see event-form-dialog.tsx's comment.
import type { Event } from '../event.types';

// Admin: who took part in one event. Two ways in — an existing team member or a free-text guest —
// and one way out.
//
// This is a separate dialog from the event form rather than another field on it. Participants are
// their own rows behind their own endpoints, added and removed one at a time and taking effect
// immediately; folding them into a form whose Save writes the whole event would mean an admin
// could add three people, hit Cancel, and reasonably expect them not to be there.

export type ParticipantPerson = { id: string; name: string; role: string };

type AddResult = { added: unknown[]; skipped: number };

function post(url: string, body: unknown) {
  return apiSend<AddResult>('POST', url, body);
}

/** "Added 3." / "Added 2, 1 already on this event." — says what actually happened. */
function describeAdd(result: AddResult): string {
  const added = result.added.length;
  if (added === 0) return 'Everyone selected is already on this event.';
  if (result.skipped === 0) return added === 1 ? 'Added.' : `Added ${added}.`;
  return `Added ${added}, ${result.skipped} already on this event.`;
}

export function EventParticipantsDialog({
  open,
  onOpenChange,
  event,
  members,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: Event;
  members: ParticipantPerson[];
}) {
  const router = useRouter();
  const [memberId, setMemberId] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestRole, setGuestRole] = useState('');

  const participants = event?.participants ?? [];
  // Members already on the event are dropped from the picker rather than shown and rejected.
  const onEvent = new Set(participants.map((p) => p.teamMemberId).filter(Boolean));
  const selectable = members.filter((member) => !onEvent.has(member.id));

  const refresh = (message: string) => {
    toast.success(message);
    router.refresh();
  };

  const addMember = useMutation({
    mutationFn: (id: string) =>
      post(`/api/admin/events/${event?.id}/participants`, { kind: 'member', teamMemberId: id }),
    onSuccess: (result) => {
      setMemberId('');
      refresh(describeAdd(result));
    },
    onError: () => toast.error('Could not add that person. Please try again.'),
  });

  const addGuest = useMutation({
    mutationFn: () =>
      post(`/api/admin/events/${event?.id}/participants`, {
        kind: 'guest',
        name: guestName,
        role: guestRole || undefined,
      }),
    onSuccess: (result) => {
      setGuestName('');
      setGuestRole('');
      refresh(describeAdd(result));
    },
    onError: () => toast.error('Could not add that guest. Please try again.'),
  });

  const remove = useMutation({
    mutationFn: (participantId: string) =>
      apiDelete(`/api/admin/events/${event?.id}/participants/${participantId}`),
    onSuccess: () => refresh('Removed.'),
    onError: () => toast.error('Could not remove. Please try again.'),
  });

  const busy = addMember.isPending || addGuest.isPending || remove.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={event ? `Participants — ${event.title}` : 'Participants'}
      description="Team members and guests who took part. Changes save immediately."
      closeLabel="Close"
    >
      <div className="flex flex-col gap-6">
        <section aria-labelledby="add-member-heading" className="flex flex-col gap-2">
          <h3 id="add-member-heading" className="text-sm font-semibold text-foreground">
            Add a team member
          </h3>
          <div className="flex gap-2">
            <Select
              aria-label="Team member"
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              disabled={selectable.length === 0}
            >
              <option value="">
                {selectable.length === 0 ? 'Everyone is already added' : 'Choose someone…'}
              </option>
              {selectable.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} — {member.role}
                </option>
              ))}
            </Select>
            <Button
              variant="outline"
              disabled={!memberId || busy}
              loading={addMember.isPending}
              onClick={() => addMember.mutate(memberId)}
            >
              <UserPlus className="size-4" aria-hidden="true" />
              Add
            </Button>
          </div>
        </section>

        <section aria-labelledby="add-guest-heading" className="flex flex-col gap-3">
          <h3 id="add-guest-heading" className="text-sm font-semibold text-foreground">
            Add a guest
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Name" htmlFor="guest-name">
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                />
              )}
            </FormField>
            <FormField label="Role or affiliation" htmlFor="guest-role">
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  value={guestRole}
                  onChange={(e) => setGuestRole(e.target.value)}
                  placeholder="Optional"
                />
              )}
            </FormField>
          </div>
          <div>
            <Button
              variant="outline"
              disabled={!guestName.trim() || busy}
              loading={addGuest.isPending}
              onClick={() => addGuest.mutate()}
            >
              <Plus className="size-4" aria-hidden="true" />
              Add guest
            </Button>
          </div>
        </section>

        <section aria-labelledby="current-heading" className="flex flex-col gap-3">
          <h3 id="current-heading" className="text-sm font-semibold text-foreground">
            On this event
            <span className="tabular ml-2 font-mono text-xs font-normal text-muted-foreground">
              {participants.length}
            </span>
          </h3>
          {participants.length === 0 ? (
            <EmptyState title="Nobody added yet." className="px-5 py-8" />
          ) : (
            <ul className="flex flex-col">
              {participants.map((participant) => (
                <li
                  key={participant.id}
                  className="flex items-center gap-3 border-t border-border py-3 first:border-t-0"
                >
                  <Avatar
                    src={participant.photoUrl}
                    alt=""
                    fallback={participant.name.slice(0, 1).toUpperCase()}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {participant.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {participant.role ?? (participant.teamMemberId ? 'Team member' : 'Guest')}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${participant.name}`}
                    className="text-destructive hover:bg-destructive/10"
                    disabled={busy}
                    onClick={() => remove.mutate(participant.id)}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Done
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
