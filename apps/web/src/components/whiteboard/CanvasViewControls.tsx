'use client';

import { useCallback } from 'react';
import type { WhiteboardItem } from '@realestate-crm/types';
import { PRIMARY_COLOR } from './whiteboardColors';

// Web canvas has no zoom (scale = 1 always). Zoom +/- buttons are omitted on web.
// Only Fit All + Reset are implemented. When zoom is added to the web canvas,
// wire cameraScale state through here and uncomment the ± buttons.

const WORLD_SIZE = 6000;

interface Props {
  cameraX: number;
  cameraY: number;
  items: WhiteboardItem[];
  viewportW: number;
  viewportH: number;
  onSyncCamera: (x: number, y: number) => void;
}

export function CanvasViewControls({
  items,
  viewportW,
  viewportH,
  onSyncCamera,
}: Props) {
  const handleFitAll = useCallback(() => {
    if (items.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const it of items) {
      minX = Math.min(minX, it.position_x);
      minY = Math.min(minY, it.position_y);
      maxX = Math.max(maxX, it.position_x + it.width);
      maxY = Math.max(maxY, it.position_y + it.height);
    }

    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const padding = 0.1;
    const scaleX = (viewportW * (1 - padding * 2)) / contentW;
    const scaleY = (viewportH * (1 - padding * 2)) / contentH;

    // Web scale is always 1 — we pan to center the bounding box at scale=1.
    // If content is larger than the viewport, we still pan to its center.
    const clampedScale = Math.min(scaleX, scaleY, 1);
    const centerWorldX = (minX + maxX) / 2;
    const centerWorldY = (minY + maxY) / 2;
    const newCamX = viewportW / 2 - centerWorldX * clampedScale;
    const newCamY = viewportH / 2 - centerWorldY * clampedScale;

    onSyncCamera(newCamX, newCamY);
  }, [items, viewportW, viewportH, onSyncCamera]);

  const handleReset = useCallback(() => {
    onSyncCamera(0, 0);
  }, [onSyncCamera]);

  return (
    <div
      className="absolute bottom-4 left-4 z-30 flex flex-col overflow-hidden rounded-xl shadow-lg"
      style={{ border: '1px solid rgba(0,0,0,0.10)' }}
    >
      <ControlButton
        label="Fit all"
        onClick={handleFitAll}
        disabled={items.length === 0}
        title={items.length === 0 ? 'No items on board' : 'Fit all items in view'}
      >
        <FitAllIcon />
      </ControlButton>
      <Divider />
      <ControlButton
        label="Reset"
        onClick={handleReset}
        title="Reset camera to origin"
      >
        <ResetIcon />
      </ControlButton>
    </div>
  );
}

function ControlButton({
  label,
  onClick,
  disabled,
  title,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={label}
      className={`flex flex-col items-center gap-0.5 bg-white px-3 py-2.5 text-[10px] font-semibold transition-colors
        ${disabled
          ? 'cursor-not-allowed text-gray-300'
          : 'text-gray-600 hover:bg-gray-50 active:bg-gray-100'
        }`}
      style={{ minWidth: 52 }}
    >
      <span style={{ color: disabled ? '#D1D5DB' : PRIMARY_COLOR }}>{children}</span>
      <span>{label}</span>
    </button>
  );
}

function Divider() {
  return <div className="h-px w-full bg-gray-100" />;
}

function FitAllIcon() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  );
}
