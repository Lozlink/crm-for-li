'use client';

import type { WhiteboardItemType } from '@realestate-crm/types';

interface Props {
  onSelect: (type: WhiteboardItemType) => void;
  onClose: () => void;
}

interface CellSpec {
  type: WhiteboardItemType | null;
  label: string;
  icon: React.ReactNode;
  comingSoon?: boolean;
}

/**
 * "Add to your board" panel — web version of AddWidgetSheet (DESIGN.md §8).
 *
 * 3-column grid. Active types: sticky / checklist / photo.
 * Coming-soon types: Contact / Property / Map / Goal — rendered at 40% opacity.
 *
 * Positioned as a dropdown below the + FAB. Closes on backdrop click.
 */
export function AddWidgetPanel({ onSelect, onClose }: Props) {
  const cells: CellSpec[] = [
    {
      type: 'sticky',
      label: 'Quick note',
      icon: <NoteIcon className="h-7 w-7 text-blue-600" />,
    },
    {
      type: 'checklist',
      label: 'To-do',
      icon: <ChecklistIcon className="h-7 w-7 text-blue-600" />,
    },
    {
      type: 'photo',
      label: 'Photo',
      icon: <PhotoIcon className="h-7 w-7 text-blue-600" />,
    },
    {
      type: null,
      label: 'Contact',
      icon: <ContactIcon className="h-7 w-7 text-gray-400" />,
      comingSoon: true,
    },
    {
      type: null,
      label: 'Property',
      icon: <HomeIcon className="h-7 w-7 text-gray-400" />,
      comingSoon: true,
    },
    {
      type: null,
      label: 'Map',
      icon: <MapIcon className="h-7 w-7 text-gray-400" />,
      comingSoon: true,
    },
    {
      type: null,
      label: 'Goal',
      icon: <GoalIcon className="h-7 w-7 text-gray-400" />,
      comingSoon: true,
    },
  ];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />

      {/* Panel */}
      <div
        className="absolute bottom-16 right-0 z-50 w-[320px] rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl"
        role="dialog"
        aria-label="Add to your board"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle bar */}
        <div className="mb-3 flex justify-center">
          <div className="h-1 w-9 rounded-full bg-gray-200" />
        </div>

        <p className="mb-3 text-sm font-bold text-gray-900">Add to your board</p>

        {/* 3-column grid — DESIGN.md §8: 80pt wide cells, 24pt gap */}
        <div className="grid grid-cols-3 gap-3">
          {cells.map((cell) => (
            <Cell
              key={cell.label}
              cell={cell}
              onPress={() => {
                if (cell.type) {
                  onSelect(cell.type);
                  onClose();
                }
              }}
            />
          ))}
        </div>
      </div>
    </>
  );
}

interface CellProps {
  cell: CellSpec;
  onPress: () => void;
}

function Cell({ cell, onPress }: CellProps) {
  const disabled = cell.comingSoon || !cell.type;

  return (
    <button
      onClick={disabled ? undefined : onPress}
      disabled={disabled}
      aria-label={disabled ? `${cell.label} — coming soon` : cell.label}
      className={`flex flex-col items-center justify-center gap-1.5 rounded-xl px-1 py-3 text-center transition-colors ${
        disabled
          ? 'opacity-40 cursor-default'
          : 'bg-gray-50 hover:bg-blue-50 cursor-pointer'
      }`}
      style={{ minHeight: 88 }}
    >
      {cell.icon}
      <span className="text-xs font-semibold text-gray-800 leading-tight">
        {cell.label}
      </span>
      {cell.comingSoon && (
        <span className="text-[10px] text-gray-500 leading-tight">Coming soon</span>
      )}
    </button>
  );
}

/* Inline SVG icons — matching MaterialCommunityIcons used on mobile */

function NoteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function ChecklistIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function PhotoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
  );
}

function ContactIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
  );
}

function MapIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
    </svg>
  );
}

function GoalIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    </svg>
  );
}
