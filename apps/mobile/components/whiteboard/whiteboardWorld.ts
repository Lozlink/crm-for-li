/**
 * Whiteboard world bounds + clamp helpers.
 *
 * Single source of truth for the whiteboard's world size and the math that
 * keeps the camera + items from drifting off into empty space. Earlier
 * revisions had `width: 6000` hard-coded in WhiteboardCanvas styles with no
 * clamping anywhere — users could pan into infinite blank canvas and lose
 * items dragged past the edges with no way to recover them.
 *
 * 2026-05-10: Pan/zoom clamps moved from world-rect (`[0, WORLD_WIDTH]`) to
 * **content-rect** (items' bounding box + breathing room). Reason: items
 * cluster in <10% of the 4000×4000 world, so the old clamp let users drift
 * into vast empty canvas with no way back. The world dims are still the
 * outer safety ceiling (used by `clampItemPosition` to prevent dragging into
 * literally-infinite space), but the camera now follows where things ARE.
 *
 * All helpers below are worklets — they're called from Reanimated gesture
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
 * Axis-aligned bounding rect describing where the camera is allowed to roam.
 *
 * Two flavors in practice:
 *   1. CONTENT bounds: bounding box of all items, padded by ~one viewport
 *      so users can pan beyond the cluster to add new items in open space.
 *      This is what `WhiteboardCanvas` clamps to.
 *   2. WORLD bounds: the abstract `[0, WORLD_*]` rect — used as a fallback
 *      when the board is empty (no items → no content bbox).
 */
export interface ContentBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Default bounds when the board is empty — the historical world rect, so
 * panning still works on a blank canvas.
 */
export const DEFAULT_WORLD_BOUNDS: ContentBounds = {
  minX: 0,
  minY: 0,
  maxX: WORLD_WIDTH,
  maxY: WORLD_HEIGHT,
};

/**
 * Inflate a bounds rect by `pad` on every side, then clip to the abstract
 * world rect so items can't be panned past the legacy safety ceiling.
 *
 * Caller passes the items' bbox; this returns the *effective* bounds the
 * camera should be allowed to roam within. Padding is typically `max(viewportW,
 * viewportH)` so the user has roughly one screen of breathing room beyond
 * existing items — enough to pan to empty space and drop new items there.
 */
export function padBounds(b: ContentBounds, pad: number): ContentBounds {
  return {
    minX: Math.max(0, b.minX - pad),
    minY: Math.max(0, b.minY - pad),
    maxX: Math.min(WORLD_WIDTH, b.maxX + pad),
    maxY: Math.min(WORLD_HEIGHT, b.maxY + pad),
  };
}

/**
 * Clamp the camera's translate on a single axis so the bounds rect always
 * covers the viewport. `screen = camera + world * scale`, so:
 *
 *   - To keep the bounds-LEFT edge from drifting RIGHT past the screen left
 *     edge: `camera + boundsMin * scale ≤ 0` → `camera ≤ -boundsMin * scale`
 *   - To keep the bounds-RIGHT edge from drifting LEFT past the screen right
 *     edge: `camera + boundsMax * scale ≥ viewport` → `camera ≥ viewport -
 *     boundsMax * scale`
 *
 * If the bounds rect is smaller than the viewport at the current scale (small
 * board OR very zoomed-out), there's no valid range — center the bounds in
 * the viewport instead.
 *
 * @param value     proposed new camera translate (cameraX or cameraY).
 * @param viewport  viewport extent on this axis (pt).
 * @param boundsMin content-bounds minimum on this axis (world coords).
 * @param boundsMax content-bounds maximum on this axis (world coords).
 * @param scale     current camera scale.
 */
export function clampCameraAxis(
  value: number,
  viewport: number,
  boundsMin: number,
  boundsMax: number,
  scale: number,
): number {
  'worklet';
  const upper = -boundsMin * scale;            // bounds-left flush with screen-left
  const lower = viewport - boundsMax * scale;  // bounds-right flush with screen-right
  if (lower > upper) {
    // Bounds rect fits inside the viewport at this scale (zoomed-out OR
    // small board). DO NOT force a centered position here — that override
    // breaks the focal-anchor math in cameraPinch.onUpdate (the world point
    // under the user's fingers gets snapped to a different screen position
    // mid-pinch, felt as the camera "panning" during zoom). Letting the
    // caller's value through means: at zoom-out, the camera stays where the
    // focal-anchor put it; the user sees the items stay under their fingers
    // exactly as expected. Recentering on demand is now Home / Fit-All's job.
    return value;
  }
  if (value < lower) return lower;
  if (value > upper) return upper;
  return value;
}

/**
 * Like `clampCameraAxis` but allows overshoot with rubberband resistance —
 * suitable for the LIVE pan/pinch update. The trailing snap-back to the
 * exact clamp boundary is left to the gesture's `.onEnd` (typically a
 * `withSpring` toward `clampCameraAxis(...)` of the same value).
 *
 * Example: at the right edge, dragging another 100pt past the limit only
 * moves the camera 40pt visually (RUBBER=0.4) — the elastic feel is what
 * makes "you've hit the edge" obvious without a hard wall.
 */
export function rubberbandCameraAxis(
  value: number,
  viewport: number,
  boundsMin: number,
  boundsMax: number,
  scale: number,
  rubber: number = 0.4,
): number {
  'worklet';
  const upper = -boundsMin * scale;
  const lower = viewport - boundsMax * scale;
  if (lower > upper) {
    // Bounds fits inside viewport at this scale — no rubberband resistance,
    // free panning. The previous implementation pulled the camera back toward
    // a "centered rest position" with rubberband, which made small/zoomed-out
    // boards feel pinned to the screen center. Mirrors the same change in
    // clampCameraAxis above; together they fix the "zoom-out pans" bug.
    return value;
  }
  if (value > upper) return upper + (value - upper) * rubber;
  if (value < lower) return lower - (lower - value) * rubber;
  return value;
}

/**
 * Legacy world-rect clamp. Equivalent to `clampCameraAxis(value, viewport, 0,
 * worldDim, scale)`. Retained for callers that still treat `[0, WORLD_*]` as
 * the pan boundary (e.g. tap-to-pan helpers that don't know the content
 * bounds). Prefer `clampCameraAxis` for new code.
 */
export function clampCameraTranslate(
  value: number,
  viewport: number,
  worldDim: number,
  scale: number,
): number {
  'worklet';
  return clampCameraAxis(value, viewport, 0, worldDim, scale);
}

/**
 * Clamp an item's position (top-left corner) so its full body stays inside
 * the world. Used in the drag onEnd to prevent items being dragged off the
 * canvas and lost.
 *
 * Note: this is intentionally clamped to the abstract world rect, not the
 * content bounds — items legitimately get dragged into the padding region
 * around the cluster (that's how new items are added in open space).
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
