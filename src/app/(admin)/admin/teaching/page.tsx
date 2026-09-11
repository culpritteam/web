import { redirect } from 'next/navigation';

// Moved: courses and teaching CV lists belong to each member's profile (ADR-016) and are edited
// from /admin/team. Kept as a redirect so existing bookmarks and links still land somewhere.
export default function MovedPage() {
  redirect('/admin/team');
}
