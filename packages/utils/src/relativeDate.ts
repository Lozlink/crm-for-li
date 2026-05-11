/**
 * Shared relative-date formatter so notes, map annotation popups, contact
 * detail "last contacted", etc. all display the same `created_at` field
 * the same way.
 *
 * Buckets:
 *   0 days  → "Today"
 *   1 day   → "Yesterday"
 *   <7 days → "N days ago"
 *   ≥7 days → locale-formatted date (e.g. "5/11/2026")
 *
 * Earlier the app had at least three slightly different implementations
 * — `formatDate` in notes.tsx, an inline `.toLocaleDateString()` on map
 * annotation markers, and the contact detail's relative-time helper.
 * Two notes from the same event showed as "5/11/26" in one screen and
 * "Today" in another.
 */
export function formatRelativeDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  // Floor at zero — a clock-skew "future" timestamp should still read as Today,
  // not show "−1 days ago".
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}
