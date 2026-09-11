'use client';

import { useState } from 'react';
import { BookOpen, Plus } from 'lucide-react';
import { useDeleteRecord } from '@/modules/shared/lib/use-delete-record';
import { Button } from '@/modules/shared/ui/button';
import { EmptyState } from '@/modules/shared/ui/empty-state';
import { ConfirmDialog } from '@/modules/shared/ui/confirm-dialog';
import { RowActions } from '@/modules/shared/ui/row-actions';
import { FormSection, FormSectionCount } from '@/modules/shared/ui/form-section';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/ui/table';
// Deep imports, not the barrel — see course-form-dialog.tsx's comment.
import type { Course } from '../teaching.types';
import { CourseFormDialog } from './course-form-dialog';

// The courses section of a member's admin profile page, next to that member's CV lists.

export function CoursesAdmin({
  teamMemberId,
  courses,
}: {
  /** The member who teaches these courses. */
  teamMemberId: string;
  courses: Course[];
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Course | undefined>(undefined);

  const remove = useDeleteRecord<Course>((id) => `/api/admin/teaching/courses/${id}`);

  return (
    <div id="courses" className="scroll-mt-24">
      <FormSection
        title="Courses"
        description="Shown on the member's public profile, grouped by level."
        badge={<FormSectionCount count={courses.length} />}
        action={
          <Button
            aria-label="Add course"
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
        {courses.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No courses yet."
            description="Add the first course to show it on the public profile."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Course</TableHead>
                <TableHead>Level</TableHead>
                <TableHead>Term</TableHead>
                <TableHead>Order</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {courses.map((course) => (
                <TableRow key={course.id}>
                  <TableCell className="min-w-0 font-medium text-foreground">
                    <span className="line-clamp-2 block max-w-[46ch] break-words">
                      {course.code && (
                        <span className="mr-2 font-mono text-xs text-muted-foreground">
                          {course.code}
                        </span>
                      )}
                      {course.title}
                    </span>
                  </TableCell>
                  <TableCell className="min-w-0 text-muted-foreground">
                    <span className="block max-w-[20ch] truncate" title={course.level}>
                      {course.level}
                    </span>
                  </TableCell>
                  <TableCell className="min-w-0 text-muted-foreground">
                    <span className="block max-w-[18ch] truncate" title={course.term ?? undefined}>
                      {course.term ?? '—'}
                    </span>
                  </TableCell>
                  <TableCell className="tabular text-muted-foreground">
                    {course.sortOrder}
                  </TableCell>
                  <TableCell className="text-right">
                    <RowActions
                      editLabel={`Edit course: ${course.title}`}
                      deleteLabel={`Delete course: ${course.title}`}
                      onEdit={() => {
                        setEditing(course);
                        setFormOpen(true);
                      }}
                      onDelete={() => remove.request(course)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </FormSection>

      <CourseFormDialog
        teamMemberId={teamMemberId}
        open={formOpen} onOpenChange={setFormOpen} course={editing} />

      <ConfirmDialog
        {...remove.dialogProps}
        title="Delete this course?"
        description="It is removed from the public profile. This action cannot be undone."
      />
    </div>
  );
}
