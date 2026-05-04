'use client';

/**
 * Empty board state — shown when there are no items.
 *
 * DESIGN.md §9:
 * - Draw icon at 60% opacity.
 * - "Your board is blank" headline.
 * - Secondary "Tap + to drop a quick note, photo, or to-do."
 * - Never says "widget" in user-facing copy.
 */
export function WhiteboardEmptyState() {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2">
      {/* Draw icon */}
      <svg
        className="h-16 w-16 text-gray-400"
        style={{ opacity: 0.6 }}
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.2}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
        />
      </svg>

      <p className="text-xl font-semibold text-gray-400" style={{ opacity: 0.7 }}>
        Your board is blank
      </p>
      <p className="text-sm text-gray-400" style={{ opacity: 0.7 }}>
        Click + to drop a quick note, photo, or to-do.
      </p>
    </div>
  );
}
