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
  // Allow bounds to extend NEGATIVE down to -WORLD_* — earlier rev clamped
  // minX/Y to ≥ 0, which made it impossible to use the canvas region above
  // and to the left of the world origin. Users hit an invisible wall when
  // dragging cards toward the top of the screen at any zoom level.
  // Symmetric world range: items can live in [-WORLD_*, +WORLD_*].
  return {
    minX: Math.max(-WORLD_WIDTH, b.minX - pad),
    minY: Math.max(-WORLD_HEIGHT, b.minY - pad),
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
/**
 * Minimum screen-pt of the bounds rect that must remain visible inside the
 * viewport. Keeps the user from wandering arbitrarily far past their items
 * at low zoom while never triggering a force-center override. ~10% of a
 * typical phone viewport — enough that the user always has at least a sliver
 * of bounds on screen, and enough that the minimap rect always retains some
 * overlap with the items cluster.
 */
const MIN_VISIBLE_PX = 80;

export function clampCameraAxis(
  value: number,
  viewport: number,
  boundsMin: number,
  boundsMax: number,
  scale: number,
): number {
  'worklet';
  // ── Single rule: bounds must intersect viewport with ≥ MIN_VISIBLE_PX overlap ──
  //
  // Earlier revs had a two-branch design: strict cover when bounds covers
  // viewport, intersect+margin otherwise. The cover branch was too strict
  // in the common case where bounds×scale is JUST barely > viewport (e.g.
  // scale=0.625 with default padding gives only ~9pt of vertical pan room).
  // Users hit an invisible wall and couldn't pan into empty canvas above
  // their items to drop new ones.
  //
  // Unified rule: regardless of bounds-vs-viewport sizing, require the
  // bounds rect to overlap the viewport by at least MIN_VISIBLE_PX
  // (~80pt — roughly 10% of phone viewport). The user gets ~80pt of
  // overscroll past the strict cover edges, so there's always a bit of
  // headroom for adding items in open space, even when zoomed in.
  //
  // What this loses: at high zoom, users can pan items mostly off-screen
  // (only MIN_VISIBLE_PX visible). Acceptable because:
  //   1. Minimap rect still tells you where you are relative to items
  //   2. Home button brings you back instantly
  //   3. Spring snap-back resists going past the rule's boundary
  //
  // Constraints:
  //   bounds-RIGHT must stay ≥ MIN_VISIBLE_PX from screen-LEFT:
  //     camera + boundsMax*scale ≥ MIN_VISIBLE_PX
  //     → camera ≥ MIN_VISIBLE_PX - boundsMax*scale
  //   bounds-LEFT must stay ≤ viewport - MIN_VISIBLE_PX from screen-LEFT:
  //     camera + boundsMin*scale ≤ viewport - MIN_VISIBLE_PX
  //     → camera ≤ viewport - MIN_VISIBLE_PX - boundsMin*scale
  const min = MIN_VISIBLE_PX - boundsMax * scale;
  const max = viewport - MIN_VISIBLE_PX - boundsMin * scale;
  if (value < min) return min;
  if (value > max) return max;
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
  // Single rule matching clampCameraAxis: require MIN_VISIBLE_PX of bounds
  // overlap with viewport. Past either boundary, motion proceeds with
  // reduced sensitivity (rubber=0.4 → 100pt of finger drag past the edge
  // produces 40pt of camera move). Trailing snap-back is the gesture's
  // `.onEnd` job (uses clampCameraAxis directly).
  const min = MIN_VISIBLE_PX - boundsMax * scale;
  const max = viewport - MIN_VISIBLE_PX - boundsMin * scale;
  if (value > max) return max + (value - max) * rubber;
  if (value < min) return min - (min - value) * rubber;
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
  // Symmetric world: items can be placed in [-worldDim, worldDim - itemDim].
  // Earlier rev had `min = 0` which created an invisible upper-edge wall at
  // world Y=0 — users could pan the camera up to see empty canvas above
  // their items but couldn't actually drag cards into that area
  // (reported 2026-05-11 — "menhel+empty photo box is the max I can take
  // cards"). Symmetric bound doubles the usable canvas without changing
  // any single safety ceiling.
  const min = -worldDim;
  const max = worldDim - itemDim;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
