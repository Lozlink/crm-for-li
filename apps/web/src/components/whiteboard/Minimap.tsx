'use client';

import { useRef, useCallback, useState } from 'react';
import type { WhiteboardItem, WhiteboardItemType } from '@realestate-crm/types';
import { PRIMARY_COLOR } from './whiteboardColors';

const WORLD_SIZE = 6000;
const MINIMAP_W = 200;
const MINIMAP_H = 140;
const MINIMAP_SCALE = MINIMAP_W / WORLD_SIZE; // world coords → minimap px

// Per-type accent colors for item rectangles on the minimap.
const TYPE_COLOR: Record<WhiteboardItemType, string> = {
  sticky:     '#FEF3AC', // Sunshine — matches default sticky color
  checklist:  '#BFE0FD', // Sky
  photo:      '#BBFAD0', // Mint
  contact:    '#FFCDD0', // Coral
  property:   '#FFE0C4', // Peach
  map:        '#E2D9FC', // Lavender
  goal:       '#FEF3AC', // Sunshine
  suggestion: '#D1D5DB', // Gray-300
};

function itemColor(item: WhiteboardItem): string {
  if (item.type === 'sticky' && item.color) {
    return item.color; // sticky stores its exact hex as the color key
  }
  return TYPE_COLOR[item.type] ?? '#D1D5DB';
}

interface Props {
  items: WhiteboardItem[];
  cameraX: number;
  cameraY: number;
  viewportW: number;
  viewportH: number;
  onSyncCamera: (x: number, y: number) => void;
}

export function Minimap({ items, cameraX, cameraY, viewportW, viewportH, onSyncCamera }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  // Convert a minimap-local pointer position to a world coordinate, then
  // pan the camera so that world point is centered in the viewport.
  // Math: worldX = minimapX / MINIMAP_SCALE → cameraX = viewW/2 - worldX
  const panToMinimapPoint = useCallback(
    (minimapX: number, minimapY: number) => {
      const worldX = minimapX / MINIMAP_SCALE;
      const worldY = minimapY / MINIMAP_SCALE;
      onSyncCamera(viewportW / 2 - worldX, viewportH / 2 - worldY);
    },
    [viewportW, viewportH, onSyncCamera],
  );

  const getSvgLocalCoords = useCallback(
    (e: React.PointerEvent<SVGSVGElement>): { x: number; y: number } => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    },
    [],
  );

  // ── Pointer handlers for tap + drag on the minimap ──────────────────────

  const isDragging = useRef(false);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      isDragging.current = true;
      const local = getSvgLocalCoords(e);
      panToMinimapPoint(local.x, local.y);
    },
    [getSvgLocalCoords, panToMinimapPoint],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!isDragging.current) return;
      const local = getSvgLocalCoords(e);
      panToMinimapPoint(local.x, local.y);
    },
    [getSvgLocalCoords, panToMinimapPoint],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      isDragging.current = false;
      e.currentTarget.releasePointerCapture(e.pointerId);
    },
    [],
  );

  // ── Viewport rectangle in minimap coordinates ────────────────────────────
  // Web scale = 1 always. Viewport in world coords:
  //   worldLeft = -cameraX, worldTop = -cameraY
  //   worldRight = -cameraX + viewportW, worldBottom = -cameraY + viewportH
  const vpX = Math.max(0, (-cameraX) * MINIMAP_SCALE);
  const vpY = Math.max(0, (-cameraY) * MINIMAP_SCALE);
  const vpW = Math.min(viewportW * MINIMAP_SCALE, MINIMAP_W - vpX);
  const vpH = Math.min(viewportH * MINIMAP_SCALE, MINIMAP_H - vpY);

  const itemCount = items.length;

  return (
    // Positioned in the top-right corner of the canvas container.
    // Bottom-right conflicts with the FAB (+) button; top-right keeps both visible.
    <div
      className="absolute right-4 top-4 z-30 overflow-hidden rounded-xl shadow-lg"
      style={{
        width: MINIMAP_W + 2,   // +2 for 1px border each side
        border: '1px solid rgba(0,0,0,0.12)',
        background: '#FFFFFF',
      }}
    >
      {/* ── Header row with item count + chevron ── */}
      <div
        className="flex cursor-pointer select-none items-center justify-between px-2.5 py-1.5"
        style={{ background: PRIMARY_COLOR }}
        onClick={() => setCollapsed((c) => !c)}
      >
        <span className="text-[11px] font-semibold text-white">
          {itemCount === 0 ? 'Empty board' : `${itemCount} item${itemCount !== 1 ? 's' : ''}`}
        </span>
        <svg
          width="14"
          height="14"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2.5}
          stroke="white"
          style={{
            transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 200ms ease',
          }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </div>

      {/* ── Map surface — hidden when collapsed ── */}
      {!collapsed && (
        <svg
          ref={svgRef}
          width={MINIMAP_W}
          height={MINIMAP_H}
          viewBox={`0 0 ${MINIMAP_W} ${MINIMAP_H}`}
          style={{ display: 'block', background: '#F5F0E8', cursor: 'crosshair' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {/* Item rectangles */}
          {items.map((it) => (
            <rect
              key={it.id}
              x={it.position_x * MINIMAP_SCALE}
              y={it.position_y * MINIMAP_SCALE}
              width={Math.max(2, it.width * MINIMAP_SCALE)}
              height={Math.max(2, it.height * MINIMAP_SCALE)}
              rx={1}
              fill={itemColor(it)}
              stroke="rgba(0,0,0,0.15)"
              strokeWidth={0.5}
            />
          ))}

          {/* Viewport rectangle */}
          {vpW > 0 && vpH > 0 && (
            <rect
              x={vpX}
              y={vpY}
              width={vpW}
              height={vpH}
              rx={2}
              fill={`${PRIMARY_COLOR}18`}
              stroke={PRIMARY_COLOR}
              strokeWidth={1.5}
            />
          )}
        </svg>
      )}
    </div>
  );
}
