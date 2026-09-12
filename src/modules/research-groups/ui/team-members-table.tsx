'use client';

import { useState } from 'react';
import Link from 'next/link';
import { IdCard, Plus, Users2 } from 'lucide-react';
import { Avatar } from '@/modules/shared/ui/avatar';
import { useDeleteRecord } from '@/modules/shared/lib/use-delete-record';
import { Button, buttonVariants } from '@/modules/shared/ui/button';
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
// Deep imports, not the barrel — see team-member-form-dialog.tsx's comment.
import type { MemberLink, TeamMember } from '../team-member.types';
import { TeamMemberFormDialog } from './team-member-form-dialog';

export function TeamMembersTable({
  items,
  linksByMember = {},
}: {
  items: TeamMember[];
  /**
   * Each member's external links, keyed by member id, so the edit dialog opens with the list the
   * admin is about to change. Read on the server with the members themselves — the alternative,
   * fetching them when the dialog opens, would mean a second round trip and a spinner inside a
   * form that otherwise opens fully populated.
   */
  linksByMember?: Record<string, MemberLink[]>;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TeamMember | undefined>(undefined);

  const remove = useDeleteRecord<TeamMember>((id) => `/api/admin/team-members/${id}`);

  return (
    <div id="members" className="scroll-mt-24">
      <FormSection
        title="Team members"
        description="Everyone on the public Team tab. Each member has a profile page with their CV and courses."
        badge={<FormSectionCount count={items.length} />}
        action={
          <Button
            aria-label="Add team member"
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
            icon={Users2}
            title="No team members yet."
            description="Add the first team member."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium text-foreground">
                    <div className="flex items-center gap-2.5">
                      <Avatar
                        src={item.photoUrl}
                        alt=""
                        fallback={item.name.slice(0, 1).toUpperCase()}
                        size="sm"
                        className="size-8 ring-0"
                      />
                      <span className="min-w-0 break-words">{item.name}</span>
                      {item.isDirector && (
                        <span className="rounded-full border border-accent/40 px-2 py-0.5 text-xs font-medium text-accent">
                          Director
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{item.role}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/admin/team/${item.id}`}
                        aria-label={`Edit profile: ${item.name}`}
                        className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                      >
                        <IdCard className="size-4" aria-hidden="true" />
                        Edit profile
                      </Link>
                    <RowActions
                      editLabel={`Edit: ${item.name}`}
                      deleteLabel={`Delete: ${item.name}`}
                      onEdit={() => {
                        setEditing(item);
                        setFormOpen(true);
                      }}
                      onDelete={() => remove.request(item)}
                    />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </FormSection>

      <TeamMemberFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        member={editing}
        links={editing ? (linksByMember[editing.id] ?? []) : []}
      />

      <ConfirmDialog
        {...remove.dialogProps}
        title="Delete this member?"
        description="Their profile, CV entries and courses are removed from the public site. This action cannot be undone."
      />
    </div>
  );
}
