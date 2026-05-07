/**
 * Whiteboard world bounds + clamp helpers.
 *
 * Single source of truth for the whiteboard's world size and the math that
 * keeps the camera + items from drifting off into empty space. Earlier
 * revisions had `width: 6000` hard-coded in WhiteboardCanvas styles with no
 * clamping anywhere — users could pan into infinite blank canvas and lose
 * items dragged past the edges with no way to recover them.
 *
 * Both helpers below are worklets — they're called from Reanimated gesture
 * `.onUpdate` / `.onEnd` callbacks on the UI thread. The `'worklet'`
 * directive is mandatory under Reanimated 4 strict mode (see
 * `reanimated-worklet-helpers-gotcha.md`).
 */

// 4000pt — ~10 screen widths at scale=1, enough for real use cases.
// Reduced from the historical 6000pt (too large, felt boundless). Items persisted
// at positions > 4000pt are migrated defensively in WhiteboardItemView on first
// mount (clamp → optimistic-update → persist), so the transition is seamless.
export const WORLD_WIDTH = 4000;
export const WORLD_HEIGHT = 4000;

/**
 * Clamp the camera's translate value so the user can't pan past the edges of
 * the world. `screen = camera + world * scale`, so to keep the world right
 * edge from leaving the screen right edge: `camera ≥ viewportW - WORLD * scale`.
 * To keep the world left edge from leaving the screen left edge: `camera ≤ 0`.
 *
 * If the world fits entirely inside the viewport (small world OR zoomed out),
 * pin to 0 so the world's top-left sits at the viewport's top-left rather
 * than letting the camera float in undefined space.
 */
export function clampCameraTranslate(
  value: number,
  viewport: number,
  worldDim: number,
  scale: number,
): number {
  'worklet';
  const min = viewport - worldDim * scale;
  const max = 0;
  if (min > max) return 0; // world fits — pin to origin
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Clamp an item's position (top-left corner) so its full body stays inside
 * the world. Used in the drag onEnd to prevent items being dragged off the
 * canvas and lost.
 */
export function clampItemPosition(
  value: number,
  itemDim: number,
  worldDim: number,
): number {
  'worklet';
  const max = worldDim - itemDim;
  if (value < 0) return 0;
  if (value > max) return max;
  return value;
}
