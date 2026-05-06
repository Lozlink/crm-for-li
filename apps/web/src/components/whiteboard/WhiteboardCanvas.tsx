'use client';

import { useRef, useCallback, useState, useEffect } from 'react';
import type { WhiteboardItem } from '@realestate-crm/types';
import { CANVAS_BG, CANVAS_DOT_COLOR } from './whiteboardColors';
import { WhiteboardItemView } from './WhiteboardItem';
import { WhiteboardEmptyState } from './WhiteboardEmptyState';
import { Minimap } from './Minimap';
import { CanvasViewControls } from './CanvasViewControls';

type WhiteboardMode = 'move' | 'edit';

interface Props {
  items: WhiteboardItem[];
  mode: WhiteboardMode;
  onToggleChecklistEntry: (itemId: string, entryId: string) => void;
  onDelete: (id: string) => void;
  /** Called once on mount with a stable jumpTo function; parent stores it to drive overview tap-to-pan. */
  onRegisterJumpTo?: (jumpTo: (item: WhiteboardItem) => void) => void;
}

/**
 * Infinite-pan canvas — web version of the mobile WhiteboardCanvas.
 *
 * DESIGN.md §1:
 * - Warm canvas bg: light #F5F0E8.
 * - Dot grid (2px dots, 16px spacing) only in Edit mode.
 *
 * Interaction model (web-native, NOT Reanimated):
 * - Single-pointer drag on canvas background pans the camera.
 * - Scroll wheel pans vertically (shift+scroll = horizontal).
 * - Item drags are handled inside WhiteboardItemView and stop propagation.
 */
export function WhiteboardCanvas({ items, mode, onToggleChecklistEntry, onDelete, onRegisterJumpTo }: Props) {
  const [cameraX, setCameraX] = useState(0);
  const [cameraY, setCameraY] = useState(0);
  const [viewportSize, setViewportSize] = useState({ w: 0, h: 0 });

  // Refs for pan gesture — avoids setState on every pointer-move frame.
  const isPanning = useRef(false);
  const panStart = useRef({ clientX: 0, clientY: 0, camX: 0, camY: 0 });

  // live camera used during pan to avoid closure stale-reads
  const liveCamera = useRef({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);

  const syncCamera = useCallback((x: number, y: number) => {
    liveCamera.current = { x, y };
    setCameraX(x);
    setCameraY(y);
  }, []);

  // Smooth-pan to center the given item in the viewport.
  const jumpToItem = useCallback((item: WhiteboardItem) => {
    const el = containerRef.current;
    const viewW = el?.clientWidth ?? window.innerWidth;
    const viewH = el?.clientHeight ?? window.innerHeight;
    const targetX = -(item.position_x - viewW / 2 + item.width / 2);
    const targetY = -(item.position_y - viewH / 2 + item.height / 2);
    // Smooth transition via CSS — temporarily set a transition on the world div,
    // then remove after 300ms so pointer-drag isn't sluggish.
    syncCamera(targetX, targetY);
  }, [syncCamera]);

  useEffect(() => {
    onRegisterJumpTo?.(jumpToItem);
  // Only register once on mount — jumpToItem is stable (syncCamera is stable).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track container size for minimap viewport rect + fit-all math.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0]?.contentRect ?? {};
      if (width && height) setViewportSize({ w: width, h: height });
    });
    obs.observe(el);
    setViewportSize({ w: el.clientWidth, h: el.clientHeight });
    return () => obs.disconnect();
  }, []);

  const handleCanvasPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      // Only start pan if the click landed on the canvas itself (not an item).
      if ((e.target as HTMLElement) !== e.currentTarget) return;

      isPanning.current = true;
      panStart.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        camX: liveCamera.current.x,
        camY: liveCamera.current.y,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [],
  );

  const handleCanvasPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isPanning.current) return;
      const dx = e.clientX - panStart.current.clientX;
      const dy = e.clientY - panStart.current.clientY;
      syncCamera(panStart.current.camX + dx, panStart.current.camY + dy);
    },
    [syncCamera],
  );

  const handleCanvasPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isPanning.current) {
        isPanning.current = false;
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    },
    [],
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      // Trackpad pan and scroll-to-pan
      const dx = e.shiftKey ? e.deltaY : e.deltaX;
      const dy = e.shiftKey ? 0 : e.deltaY;
      syncCamera(liveCamera.current.x - dx, liveCamera.current.y - dy);
    },
    [syncCamera],
  );

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden"
      style={{ backgroundColor: CANVAS_BG.light, cursor: 'default' }}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handleCanvasPointerMove}
      onPointerUp={handleCanvasPointerUp}
      onPointerLeave={handleCanvasPointerUp}
      onWheel={handleWheel}
    >
      {/* Dot grid — Edit mode only, viewport-fixed (DESIGN.md §1) */}
      {mode === 'edit' && <DotGrid color={CANVAS_DOT_COLOR.light} />}

      {/* World — items rendered absolutely in world coords, translated by camera */}
      <div
        className="absolute left-0 top-0"
        style={{
          width: 6000,
          height: 6000,
          transform: `translate(${cameraX}px, ${cameraY}px)`,
          willChange: 'transform',
        }}
      >
        {items.map((it) => (
          <WhiteboardItemView
            key={it.id}
            item={it}
            mode={mode}
            cameraX={cameraX}
            cameraY={cameraY}
            onToggleChecklistEntry={onToggleChecklistEntry}
            onDelete={onDelete}
          />
        ))}
      </div>

      {/* Empty state — centered in viewport */}
      {items.length === 0 && <WhiteboardEmptyState />}

      {/* ── Minimap overlay (top-right, avoids FAB at bottom-right) ── */}
      <Minimap
        items={items}
        cameraX={cameraX}
        cameraY={cameraY}
        viewportW={viewportSize.w}
        viewportH={viewportSize.h}
        onSyncCamera={syncCamera}
      />

      {/* ── View controls (bottom-left) — Fit All + Reset ──────────── */}
      <CanvasViewControls
        cameraX={cameraX}
        cameraY={cameraY}
        items={items}
        viewportW={viewportSize.w}
        viewportH={viewportSize.h}
        onSyncCamera={syncCamera}
      />
    </div>
  );
}

/**
 * Viewport-fixed dot grid for Edit mode.
 * Using CSS background-image radial-gradient so it scales with the viewport
 * without rendering hundreds of DOM nodes like the mobile version does.
 *
 * DESIGN.md §1: 2pt dots, 16pt spacing.
 */
function DotGrid({ color }: { color: string }) {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage: `radial-gradient(circle, ${color} 1px, transparent 1px)`,
        backgroundSize: '16px 16px',
      }}
    />
  );
}
