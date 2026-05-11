# Changelog

## [Unreleased] - 2026-05-11

A long session driven mostly by two threads that branched into many. First thread: whiteboard pan/zoom and minimap kept "almost working" — items vanished at non-1× zoom, the minimap rect drifted off the surface, drags felt sluggish. Second thread: a full visual + data audit across the rest of the app, then live-simulator polish of every tab. Closing thread: features the user asked for in the same sitting (customizable bottom tabs, geocoded field notes, Android photo upload, route-exit affordances).

### Fixed — Whiteboard canvas (the actual root cause)

- **`transformOrigin: '0% 0%'` on the world layer** (`apps/mobile/components/whiteboard/WhiteboardCanvas.tsx`). React Native's default `transformOrigin` for a transformed `<View>` is the element's center. The world layer is `4000 × 4000`, so its center is `(2000, 2000)`. At `scale=0.4` the `scale()` transform shifted every child by `(1 - 0.4) × 2000 = 720pt`, pushing items entirely off the viewport. Every formula in this module — `clampCameraAxis`, the minimap projection, `WhiteboardItemView` placement — was written as `screen = camera + world * scale`, which only matches reality when origin is top-left. One line fix, but underneath it were a series of compounding "fixes" that hid the real bug: bounds-relaxing clamps, force-centering branches, no-clamp fall-throughs — each masking a different symptom of the wrong `transformOrigin`. Items rendered correctly at `scale=1.0` only because at scale 1 the origin doesn't matter.

- **Bounds-aware camera clamp** (`apps/mobile/components/whiteboard/whiteboardWorld.ts`). Replaced `clampCameraTranslate(value, viewport, worldDim, scale)` with `clampCameraAxis(value, viewport, boundsMin, boundsMax, scale)`. The clamp target is now the items' bounding box (`itemBounds`) padded by half a viewport rather than the abstract `[0, WORLD_*]` rect, so users can't pan into the 80%+ of empty world that contains no content. After several false starts, the final rule is: **bounds rect must overlap viewport with at least `MIN_VISIBLE_PX = 80pt`**, applied uniformly at every zoom. Earlier two-branch designs ("cover when bounds > viewport, intersect when bounds < viewport") produced edge cases at `bounds*scale ≈ viewport` where the camera force-pinned to a single value and zoom-out felt like a pan. The unified intersect+min-visible rule never triggers a force-center, so focal-anchor preservation during pinch is intact.

- **`rubberbandCameraAxis` + spring snap-back** (`whiteboardWorld.ts`, `WhiteboardCanvas.tsx`). During pan/pinch the new helper allows overshoot past the clamp boundary with reduced sensitivity (`rubber = 0.4` → 100pt finger drag past edge = 40pt camera movement). On `.onEnd` the camera springs back to the strict `clampCameraAxis` boundary via `withSpring(_, SNAP_BACK_SPRING)`. No more hard walls.

- **Item drag scale-compensation** (`WhiteboardItemView.tsx`). `pan.onUpdate` was setting `translateY.value = startY.value + e.translationY`, but `startY` is in world coords while `e.translationY` is in finger pixels. At `scale=0.4` the item moved 0.4 world-pt per finger pixel, rendering as 0.16 screen-pt per finger pixel — the finger hit the screen edge before the item had moved as far as the user expected, manifesting as "the drag stopped early." Now divides by `cameraScale.value` (threaded through from `WhiteboardCanvas`) so finger:screen movement is 1:1 at every zoom.

- **Symmetric world: items can be placed in `[-WORLD, +WORLD]`** (`whiteboardWorld.ts`). `clampItemPosition`'s lower bound moved from `0` to `-worldDim`, and `padBounds` now allows `minX/Y` to go negative (was `Math.max(0, ...)`, now `Math.max(-WORLD_*, ...)`). Previously the camera could pan to reveal empty canvas above the items via padding, but cards couldn't actually be placed in that area — invisible upper-edge wall.

- **Union-bounds minimap projection** (`Minimap.tsx`). Minimap projects against `union(itemBounds, currentVisibleWorld)` recomputed per frame via `useDerivedValue`. Both items cluster AND viewport rect always fit fully inside the minimap; when the user pans far past items the minimap dynamically rescales to keep both visible (Figma/Miro pattern). Each item dot is now its own `<MinimapDot>` component with `useAnimatedStyle` so projection changes propagate per-frame without re-rendering the parent.

- **Pinch focal-point preservation under axis clamp** (`WhiteboardCanvas.tsx`). Replaced the cover/intersect two-branch with the strict-inequality `coverLower < coverUpper` fall-through so equality cases (where bounds×scale exactly equals viewport) don't pin the camera to a single value mid-pinch. Pinch-out now keeps the world point under the user's fingers fixed on screen regardless of zoom level.

- **Nested `TouchableOpacity` was stealing drag from item gesture** (`ContactCard.tsx`, `PropertyCard.tsx`, `MapCard.tsx`, `WhiteboardItemView.tsx`). The three card types wrapped themselves in `TouchableOpacity` with `onPress = router.push(...)`. The legacy RN touch responder captured initial press, cancelled mid-drag when the finger moved beyond Touchable's threshold, and released the touch to the responder chain — at which point the canvas's `movePan` layer picked it up and panned the camera instead of moving the card. Hoisted navigation into `WhiteboardItemView.handleSingleTap` (`switch (item.type)` → `/contact/:id` | `/property/:id` | `/(tabs)/map?lat=...`) and replaced the inner Touchables with plain `<View>` so the parent gesture handler owns the touch end-to-end.

- **Reanimated strict-mode warning + Surface shadow warning** (`WhiteboardCanvas.tsx`, `Minimap.tsx`). Cleared "Writing to `value` during component render" by dropping a SharedValue-shadow of `bounds` prop and letting the gesture worklets capture the plain numbers from closure (same pattern as `viewportW`). Cleared "When setting overflow to hidden on Surface the shadow will not be displayed correctly" by moving `overflow: hidden` off the `Surface` and onto an inner `<View>` wrapper.

- **World-anchored coarse grid** (`WhiteboardCanvas.tsx`). Added a 21×21 grid of 4pt orientation dots at 200pt world-spacing inside the camera-transformed world layer. Translates and scales with the camera, providing motion parallax when panning across empty canvas — previously the viewport-fixed fine grid looked identical at every position so panning felt motionless.

- **Home button distinct from Fit-All** (`apps/mobile/components/shared/CanvasViewControls.tsx`). Fit-All zooms to frame all items with 10% padding. Home now resets to `scale=1.0` centered on the items cluster — a distinct "back to normal working zoom" destination instead of duplicating Fit-All.

### Fixed — Android photo upload (Supabase Storage + RN OkHttp incompatibility)

- **`uploadWhiteboardPhotoFile`** (`packages/api/src/whiteboardPhotos.ts`). The old `uploadWhiteboardPhotoBuffer` decoded the picker's base64 to an `ArrayBuffer` and called `supabase.storage.from(...).upload(path, arrayBuffer, ...)`. The Supabase JS SDK wraps that in a `fetch()` with the ArrayBuffer as request body. iOS's URLSession-backed fetch handles ArrayBuffer bodies; **Android's OkHttp-backed fetch does not** — the request goes out with zero bytes (or hangs to timeout) and the SDK reports no error. New function POSTs the picker's local `file://` URI to `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}` as multipart `FormData` (RN's idiomatic `{uri, name, type}` shape), with the user's session token in `Authorization`. Works identically on both platforms. Old buffer function kept and marked `@deprecated` for the web `PhotoWidget` (browsers handle ArrayBuffer fetch bodies fine).
- **`EditItemSheet.tsx`** switched to the new path: passes `asset.uri` instead of decoding base64. Removed `base64: true` from picker options (saved ~5MB JS-heap per photo on Android — the OOM during big captures likely contributed to the silent failure). Removed the now-unused `decodeBase64ToArrayBuffer` helper.

### Added — Customizable bottom tabs (per-user)

- **`useTabPreferencesStore`** (`packages/hooks/src/useTabPreferencesStore.ts`). Zustand store with per-user AsyncStorage persistence (keyed `tabPrefs:v1:<userId>` or `:demo` in demo mode). Actions: `togglePin`, `moveTabUp`, `moveTabDown`, `setPinned`, `resetToDefaults`. Constraints: minimum 1 pinned, maximum 5 pinned, dedupe + sanitize stale storage payloads. Defaults to the existing `[index, map, prospecting, whiteboard-tab, more]` set.
- **Dynamic `(tabs)/_layout.tsx`**. All 12 tab routes are still mounted; pinned ones render with their normal `href`, unpinned with `href: null` (invisible in the bar but reachable from More, deep links, or programmatic nav). Render order = user's pinned order first, then unpinned at the end. The Whiteboard tab's `href: '/whiteboard'` redirect is preserved when pinned.
- **`CustomTabBarButton`**. Custom `tabBarButton` in `screenOptions` wraps each native button in a `Pressable` with `onLongPress` that navigates to `/settings/customize-tabs`. Long-press is uniform across all tabs (no need to remember which tab opens settings).
- **`app/settings/customize-tabs.tsx`**. Modal editor with two sections: **Pinned (N/5)** with up/down/unpin per row, **Available** with tap-to-pin (greyed at the 5-tab ceiling). Helper text at min/max boundaries. "Reset to defaults" with Alert confirm. "Done" header button.

### Added — Reverse-geocoded note/annotation display

- **`useGeocodedAddress(lat, lng)`** (`packages/hooks/src/useGeocodedAddress.ts`). React adapter on top of the existing in-memory-cached `reverseGeocode` API. Returns `{ address, loading }`; null inputs short-circuit to "no data" without firing a request. Used to render notes/annotations as readable street addresses instead of bare lat/lng pairs.
- **Notes tab unlinked annotations** (`apps/mobile/app/(tabs)/notes.tsx`) — extracted a small `<AnnotationLocationLabel>` component (hooks can't live in `renderItem` callbacks) that resolves coords to `"7/46 Coronation Rd, Baulkham Hills"` with the raw coords as fallback during loading / on geocode failure.
- **Pinned field-note stickies** — `buildPinnedFieldNoteText` is now `async` and awaits `reverseGeocode` before composing the sticky body. New stickies say `"Field note @ <street address>"`.
- **Legacy sticky self-healing** (`apps/mobile/components/whiteboard/StickyNote.tsx`). On render, regex-matches the legacy `Field note @ <lat>, <lng>` header pattern. If matched, fires a one-shot reverse-geocode and `updateItem`s the sticky in place — preserving the date line and user-written body. Guarded by a `useRef` so it runs at most once per item per session. Existing pre-2026-05-11 stickies now upgrade themselves the next time they render.

### Changed — Guided session no longer "active" until walking starts

- **`useGuidedProspectingStore`** (`packages/hooks/src/useGuidedProspectingStore.ts`). Split the route-prep step from the activation flag:
  - `startGuidedSession(lat, lng, scoresMap)` now *only* computes the optimized stops list and seeds the store. `isActive` stays false.
  - New `activateGuidedSession()` flips `isActive=true`. Called from `handleStartWalking` so the active-session banner on the Prospecting tab only appears when the user has actually started walking.
  - New `cancelGuidedSession()` wipes prepared stops and clears `isActive`. Called from the editing-phase Cancel button so backing out leaves the store clean.
- **`guided.tsx` mount effect** now reads `stops.length === 0` as the "prepare a route" gate instead of `!isActive`, since `isActive` no longer indicates "stops have been prepared."
- **Walking phase header** now has a `headerLeft` `End` button that triggers the same Alert-confirmed `handleEndSession` flow as the existing bottom button. Two visible exits instead of one.

### Added — Route/guided modal exits

- **`route/new` Cancel button** (`apps/mobile/app/route/new.tsx`). The "New Route" modal had no visible exit on Android (iOS-only swipe-down dismiss). Added a `<Stack.Screen options={{ headerLeft: () => <Button>Cancel</Button> }} />` override.
- **Guided Edit Route Cancel button** (`apps/mobile/app/prospecting/guided.tsx`). The parent `prospecting/_layout` sets `headerShown: false`; the editing phase's override to `headerShown: true` didn't guarantee a back arrow. Added explicit `headerLeft` Cancel that also calls `cancelGuidedSession` so the store is wiped.
- **Whiteboard close routes to Today** (`apps/mobile/app/whiteboard.tsx`). `handleClose` used `router.replace('/(tabs)')` which defaulted to the currently-active tab. If the user entered via the Whiteboard tab's redirect, `/(tabs)` resolved back to the Whiteboard tab placeholder — a blank screen. Now explicitly targets `/(tabs)/index`.

### Fixed — Visual / data inconsistencies (audit pass)

- **Pipeline value computed three different ways** (`apps/mobile/app/(tabs)/index.tsx`, `pipeline.tsx`, `stats.tsx`). Today used `advertised_price ?? appraisal_price ?? 0`, Pipeline matched, Stats used `advertised_price || 0` with no appraisal fallback. Same set of properties summed to three different "total active value" numbers across screens. Extracted to a shared helper:
  - New `packages/utils/src/propertyPricing.ts` — `getPropertyPipelineValue(p)` + `sumPipelineValue(properties)`.
  - Today (`pipelineStats.totalValue`), Pipeline (`getRawPrice` now aliases the shared helper), Stats (`activeListingsValue`) all wired through.

- **Shared `formatRelativeDate`** (`packages/utils/src/relativeDate.ts`). The Notes tab and Map annotation marker descriptions used different formatters for the same `created_at` timestamp — same field rendered as "Today" in one place and "5/11/2026" in another. New shared helper buckets to `Today` / `Yesterday` / `N days ago` / locale date. Notes `formatDate` is now a thin alias. Map annotation marker `description` switched from `toLocaleDateString()` to `formatRelativeDate`.

- **Stats date-range chips removed** (`apps/mobile/app/(tabs)/stats.tsx`). The chip row was rendered and stateful (`useState<DateRange>`) but no metric below actually consumed `dateRange`. The screen showed lifetime totals while the chips implied filtering. Hidden with a `TODO(stats-date-range)` comment; state/types/helpers retained as scaffolding for when someone wires the filter through.

- **Today "Under Offer" relabel** (`index.tsx`). The Today snapshot's "Under Offer" count summed `under_offer + exchanged` but the Pipeline board showed them as separate columns — user saw `3 Under Offer` on Today and `1 + 2` on the Pipeline. Relabelled the Today cell to `"Under Offer / Exchanged"` so the combination is explicit.

- **Notes "Unlinked" badge search-independent** (`notes.tsx`). The badge counted *filtered* unlinked annotations, so typing in the search box dropped the number — reading as "notes vanished from the store." Now derived from `allAnnotations.filter(a => !a.contact_id).length`. The filtered list itself still respects search.

- **Map sessions "X more" hint uses correct base** (`apps/mobile/app/(tabs)/map.tsx`). The hint compared `sessions.length` (unfiltered total) to 10, so a 7-day window with only 3 hidden sessions showed "8 more — narrow time window." Split `windowedSessionsAll` (filtered, not sliced) from `windowedSessions` (filtered + sliced to 10) and based the hint on the former.

- **Map a11y labels** (`map.tsx`). Added `accessibilityLabel` + `accessibilityRole="button"` to the icon-only GPS-center and Layers buttons.

- **Stats "— days" empty state** (`stats.tsx`). `avgDaysOnMarket === null` rendered `"— days"` which read as a half-loaded value. Changed to `"No data"`. Subtitle "No settled properties yet" already explains it.

- **TerritoryBriefingCard polish** (`apps/mobile/components/TerritoryBriefingCard.tsx`). Added a K-suffix branch to `formatPrice` so `$500K` matches the prospecting tab's formatter (`$500,000` was the diverging output). Added "days" unit to the bare `avgDaysOnMarket` so it has a unit like its siblings ($M, %).

- **Settings hardcoded version + redundant demo branch** (`apps/mobile/app/(tabs)/settings.tsx`). `description="1.0.0"` was static; now reads from `Constants.expoConfig?.version`. Mode line `isDemo ? 'X' : isDemoMode ? 'X' : 'Y'` had two branches returning the same string; collapsed to `(isDemo || isDemoMode) ? 'X' : 'Y'`.

- **`more.tsx` campaigns route trailing slash** (`/campaigns/` → `/campaigns`).

- **Production console.log in prospecting render** (`prospecting.tsx`). Removed `console.log('[SuburbIntel] ...)` that fired every render.

- **Prospecting building coverage denominator** (`prospecting.tsx`). Was rendering `{totalUnitsVisited} units` while the map's BuildingActivityDialog showed `12 / 80 — 15% coverage` for the same building. Now `${visited}/${estimated} units` when `estimatedUnits` is known, bare number otherwise.

- **Prospecting "last visited" date format consistency** (`prospecting.tsx`). Unified to `'day numeric, month short, year numeric'` matching the map dialog (was missing the year).

### Fixed —

- **Prospecting top tabs (Daily / Weekly / Funnel / Territory / Sessions) all truncated** (`prospecting.tsx`). RN Paper's `SegmentedButtons` divides width evenly across N items; at 5 items even "Daily" couldn't fit. Replaced with a horizontally-scrollable `<ScrollView><Chip>...</Chip></ScrollView>` row so each chip sizes to its label, and the row scrolls when content overflows.

- **More tab Field Work labels wrap mid-word** (`more.tsx`). 5-column grid with `flex: 1` per card squeezed `"Sessions" → "Session/s"`, `"Whiteboard" → "Whitebo/ard"`, `"Campaigns" → "Campai/gns"`. Switched to `flexWrap: 'wrap'` with `width: '31%'` per card so 5 items flow into 3+2 rows with full labels intact. Added `numberOfLines={1}` for defense.

- **Territory "Penetration" column header wraps to "Penetratio/n"** (`prospecting.tsx`). Shortened to `"Pen %"` with `numberOfLines={1}`.

- **`"1 attendees"` pluralization** (`prospecting.tsx`). Inspections summary card now switches between `attendee` and `attendees` based on count.

- **Stat-cell trend chip "WoW" suffix** (`prospecting.tsx`). `metrics.trends.doors.changePercent` is a week-over-week comparison, but the Daily card displays today's count — `▼ -100%` read as "down 100% from yesterday" (wrong). Added `WoW` suffix to make the comparison period explicit. Em-dash fallback when both periods are 0 commented to explain intent.

- **Recent sessions chips on Today now labeled** (`apps/mobile/app/(tabs)/index.tsx`). Three pill chips under "Start Prospecting" floated with no section header — read as ambiguous repeated `0 km · 0m` pills. Added a "Recent sessions" caption above them.

- **Chip text descender clipping** — eight Chip styles had explicit `height: 20–28` that squashed Paper's natural text line-box, clipping descenders ("notes" / "to-dos" / "Warm" / "Cold"). Removed fixed heights in: `prospecting.tierChipOnPrimary`, prospecting session-list status chips (`Tracking` / `Guided` / `Planned` / `In Progress`), `OverviewSheet.countChip`, `OverviewSheet.filterChip`, `notes.sourceBadge`, `map.tagChip`, `map.editFilterChip`, `map.buildingUnitChip`, `property.matchFieldChip`. Paper's `compact` prop on each `<Chip>` handles padding correctly; let the chip size to content vertically.

### Dead code identified (couldn't `rm` from sandbox)

Eight component files under `apps/mobile/components/` have zero imports anywhere in the repo and should be `git rm`'d at convenience:

```
ContactCard.tsx
ContactPreview.tsx
FilterSheet.tsx
ActivityFeed.tsx
AddActivityDialog.tsx
MapSearchBar.tsx
TagPicker.tsx
TagManager.tsx
```

All eight import a non-existent `../lib/store` path. They appear to be pre-extraction copies of components now living in `@realestate-crm/ui` / `@realestate-crm/hooks`. If anything ever accidentally imports them, the app picks up a parallel `useCRMStore` and state will silently desync between screens.

### Verified

- `pnpm --filter mobile type-check` ✓ (also `apps/web`, `packages/api`, `packages/utils`, `packages/hooks`).
- **Live simulator verification** of the whiteboard fixes — drove the simulator via computer-use to confirm `cameraY` actually moves now (was getting force-pinned to 0 in cover-rule branch); confirmed items render correctly at `scale=0.4`–`1.0`+ after `transformOrigin` fix; confirmed dynamic minimap projection follows pan/zoom honestly.
- **Audit findings doc** at `audit-2026-05-11.md` (root of repo) — the code-only audit produced by a subagent sweep, plus a separate live-simulator pass log.
- **Native build state**: no new native modules in this batch; the existing pending EAS build (still ongoing from 2026-05-06 for `expo-image-picker` + `caller-id`) covers everything here. The Android photo-upload fix in particular needs the next EAS build to take effect since RN networking is native.

---

## [Unreleased] - 2026-05-07

### Added — Smart Whiteboard canvas v3: viewport navigation, world boundaries, quick arrange

A full day's sprint on the whiteboard canvas. Goal: take the v2 freeform canvas (shipped 2026-05-04) and harden it into something that doesn't lose the user — clear viewport navigation, hard world edges, an auto-layout escape hatch when the board gets messy, and a simpler gesture model with no modal toggle. Closing thread: a long-running minimap viewport-rect bug whose root cause was finally found via runtime instrumentation rather than further math-patching.

#### Viewport navigation primitives (mobile + web)

- **`CanvasViewControls`** (`apps/mobile/components/shared/CanvasViewControls.tsx`, `apps/web/src/components/whiteboard/CanvasViewControls.tsx`) — bottom-left floating control cluster with zoom in/out, fit-all, reset. Mobile has the complete set (zoom + fit-all + reset). Web ships fit-all + reset; pinch-to-zoom on web is deferred until the web canvas grows a pinch handler.
- **`Minimap`** (`apps/mobile/components/whiteboard/Minimap.tsx`, `apps/web/src/components/whiteboard/Minimap.tsx`) — bottom-right 140×100 overlay showing all board items as dots plus a live viewport rectangle. Mobile supports tap-to-pan (translates camera so the tapped minimap point becomes the new viewport center); web is read-only display this sprint.
- **`OverviewSheet`** (`apps/mobile/components/whiteboard/OverviewSheet.tsx`) — slide-up sheet with a searchable list of all items; tap an item → camera pans to center it. Web equivalent (`OverviewDrawer`) wired the same way.
- **Centralized world boundaries** — new `apps/mobile/components/whiteboard/whiteboardWorld.ts` exports `WORLD_WIDTH = 4000`, `WORLD_HEIGHT = 4000`, plus pure helpers `clampCameraTranslate(translate, viewport, worldSize, scale)` and `clampItemPosition(pos, size, worldSize)`. All previously-hardcoded `4000`s across `WhiteboardCanvas`, `WhiteboardItemView`, `Minimap`, `OverviewSheet` now reference these constants.

#### Quick Arrange auto-layout

- **"Quick Arrange" action** in `CanvasViewControls` — sorts items by `updated_at` (most recent first), lays them into a tidy column-major grid (3 columns, 24pt gutter, 32pt outer pad), updates each item's `position_x/y` via the existing optimistic `updateItem` path, then animates the camera to fit-all the new layout. Provides an escape hatch when a freeform board gets messy without nuking item content. Computed in-place in `whiteboard.tsx` rather than calling `CanvasViewControls.handleFitAll` because the `items` array hasn't re-rendered yet at the moment the post-arrange fit fires.

#### Geocoding debounce + dialer + tab rename

- **600ms debounce on reverse-geocoding** (`apps/mobile/components/whiteboard/EditItemSheet.tsx`) — the embedded MapView picker calls `reverseGeocode` on every region change. Dragging the marker or long-press-dropping a pin used to spam Nominatim with 5+ requests/sec. A single `setTimeout` per pending region drops that to ≤1 request per pause.
- **Dialer hardening** (`apps/mobile/app/dialer.tsx`) — bypassed `Linking.canOpenURL` false-negatives that were swallowing valid `tel:` URLs on certain Android OEM dialers; added a try/catch fallback so `Linking.openURL` errors surface as a toast instead of silently failing.
- **App URL-scheme allowlist** (`apps/mobile/app.config.ts`) — Android `<queries>` and iOS `LSApplicationQueriesSchemes` widened to cover `tel`, `sms`, `mailto`, `https`, plus mapping/scheme entries for future `Linking.canOpenURL` checks. Without these, Android 11+ silently returns false from `canOpenURL`.
- **"Contacts" tab → "Prospecting"** (`apps/mobile/app/(tabs)/_layout.tsx`) — better matches what's actually on that screen now (smart prospecting engine, lead score sort, building coverage). Icon swapped to match.

### Changed — gesture model simplification

- **Move/Edit mode toggle removed** (`apps/mobile/components/whiteboard/WhiteboardToolbar.tsx`, `WhiteboardItemView.tsx`, `WhiteboardCanvas.tsx`, `whiteboard.tsx`, `types.ts`). The animated segmented pill, the `WhiteboardMode` type, and all mode-conditional gesture branches are gone. The new model is mode-free and always-on:
  - Tap an item → bring to front.
  - Long-press an item → open structured editor.
  - Drag an item → move it.
  - Single-finger drag on empty space → pan camera.
  - Two-finger pinch → zoom (and pan, see Fixed below).
- **`StickyNote` and `ChecklistCard` are read-only inline views** — the inline-editing path is gone. Editing always goes through long-press → `EditItemSheet`. This also retires the buffered-editor pattern that was needed in the inline path to dodge the "writes backwards" cursor-reset bug; `EditItemSheet` already had its own working buffered editors.

### Fixed

- **Minimap viewport rect drifts away from where the camera actually is** (`apps/mobile/components/whiteboard/WhiteboardCanvas.tsx`). This was the bug that ate the morning. **Root cause**: `cameraGestures = Gesture.Simultaneous(cameraPan, cameraPinch, movePan)` allowed a `.minPointers(2).maxPointers(2)` pan handler to run *concurrently* with the pinch handler. During every 2-finger gesture, *both* wrote to `cameraX.value` and `cameraY.value` — pinch wrote the focal-anchored value, pan wrote `startX + e.translationX`. The minimap's `useAnimatedStyle` re-evaluated between writes and read whichever value was set most recently, producing the visible flicker. Runtime instrumentation (a `useDerivedValue` camera-watch logger) caught the smoking gun: `[pinch] sets cameraX=-220.5` followed immediately by `[minimap-rect] reads cameraX=-277.2` on the very next frame. **Fix**: dropped the standalone two-finger `cameraPan` entirely. `cameraPinch` now uses `e.focalX/Y` on the LHS of its focal-point algebra (instead of the captured `startFocalX/Y`), so centroid translation and scale change are handled atomically by one writer. The unified formula reduces to pure pan when `e.scale ≈ 1` (`cameraX_new = startX + (e.focalX - startFocalX)`), preserving 2-finger drag-without-zoom UX. `cameraGestures = Gesture.Simultaneous(cameraPinch, movePan)` — only two handlers now, with non-overlapping pointer counts so they can never fight again. Verified by reproing the original bug post-fix: `[minimap-rect]` matches `[camera-watch]` on every single frame, no divergence anywhere. ([fd13a1d])
- **Minimap items dots distort when zoomed** (`Minimap.tsx`). The minimap is 140×100 but the world is 4000×4000 (1:1). A single `MINIMAP_SCALE` produced clipped dots near world edges. Split into per-axis `MINIMAP_SCALE_X = 140/4000` and `MINIMAP_SCALE_Y = 100/4000`. Items dots and viewport rect are computed independently per axis, accurately reflecting the world's aspect.
- **`OverviewSheet` scrim blocks taps after dismiss** (`OverviewSheet.tsx`). The slide-out animation left the React tree mounted because dismiss only flipped `visible=false`; the scrim's `pointerEvents` stayed live. Added a `mounted` state flipped via `runOnJS` after `withTiming(0)` resolves, so the component unmounts only after animation completes — no more dead scrim swallowing touches on the canvas underneath.
- **`OverviewSheet` item-centering wrong at non-default zoom** (`OverviewSheet.tsx`). The tap-to-pan handler computed camera offsets without applying `cameraScale`. At any zoom ≠ 1, tapping an item put it well off-center. Now scales correctly. (Same `aa9d9cd` and `9bc2b09` were both needed because the first fix corrected centering math but didn't touch unmount; the second corrected unmount but exposed a second centering bug at non-default zoom.)
- **Camera and items can drift past world edges** — without bounds enforcement, a fast 2-finger pan or a dragged-and-released widget could land in empty world space, effectively "vanishing." `clampCameraTranslate` (called from pinch + movePan) and `clampItemPosition` (called from `WhiteboardItemView`'s drag onEnd) now keep both within world bounds. Special-case: when `world * scale < viewport` (zoomed out enough that the world fits inside the viewport), camera pins to origin instead of clamping to a min/max range.

### DEV-only diagnostic instrumentation (ships in dev bundles, dead-code-eliminated in production)

- **Live camera-state overlay** on the canvas (`WhiteboardCanvas.tsx`). Top-right monospace pill showing `cameraX / cameraY / scale` formatted to 1–4 decimals, updated at 60fps via `useAnimatedProps` on `Animated.createAnimatedComponent(TextInput)`. Critical detail: the `useAnimatedProps` callback drives the `text` prop, **not** `value` — `value` is React's controlled-input prop and goes through reconciliation, so it never updates from the UI thread; `text` is the documented Reanimated-only animatable prop on the native TextInput shadow node. The first attempt used `value` and silently did nothing.
- **`[whiteboard:pinch]`** Metro log — fires inside the pinch worklet's `onUpdate` with every gesture, raw, clamped, and final camera value. Tag-prefixed for filterability.
- **`[whiteboard:minimap-rect]`** Metro log — fires every minimap re-evaluation with the read camera state plus the rect formula's intermediate values (raw vs clamped left/top, computed width/height).
- **`[whiteboard:camera-watch]`** Metro log (`whiteboard.tsx`) — `useDerivedValue` watcher that fires on every camera-state change regardless of which writer caused it. Reads the current cameraX/Y/scale plus item count. Critical for narrowing "who's writing this value?" questions when multiple gestures or effects compete.

All four are gated on `if (__DEV__)` (the JS log calls) or `{__DEV__ && …}` (the JSX overlay), so Metro's dead-code elimination strips them from production OTAs.

### Known issues / Deferred

- **Web Minimap is read-only.** Mobile supports tap-to-pan; the web port doesn't yet. Trivial to add but not in scope this sprint.
- **Web CanvasViewControls missing zoom.** Web canvas needs its own pinch/scroll-wheel handler before the buttons can usefully scale the camera. Deferred until web canvas v3.
- **Web parity for Quick Arrange + Move/Edit removal.** Mobile-first per convention; web parity sprint will follow.
- **Dev instrumentation cleanup.** The four diagnostic channels above are still in the codebase. They're DEV-only and zero production cost, but should be removed in a follow-up commit once the canvas has been stable for a few sessions. Keeping them now in case any related regression surfaces.
- **Piada

### Verified

- `pnpm --filter mobile type-check` ✓
- **Runtime verification of the minimap-rect fix**: re-ran the original memo's repro (open whiteboard → pinch zoom out twice). Default-state rect now sits at minimap top-left on top of the items dots (was at bottom-center-right). During pinch, every `[whiteboard:pinch]` line is matched by a `[whiteboard:minimap-rect]` and `[whiteboard:camera-watch]` line at the same value — no divergence. Original bug confirmed dead.
- **Native build state**: same EAS rebuild that's still pending from 2026-05-06 (for `expo-image-picker`) covers everything in this sprint too — none of today's work adds new native modules. Once the next EAS build lands, today's changes are immediately available alongside the photo picker + caller-id native module fix.

---

## [Unreleased] - 2026-05-06 (later)

### Added — Whiteboard polish follow-ups + full web parity

This block is the deferred-items sweep that followed the earlier 2026-05-06 sprint. Mobile follow-ups + complete web parity for everything in the prior block, shipped by a two-engineer team (`mobile-eng`, `web-eng`) with a code review pass that surfaced four high-confidence concerns (all fixed in the same session).

**Mobile follow-ups:**

- **Lead-scoring perf cliff fixed** (`packages/hooks/src/useLeadScoringEngine.ts`). The `attendeeIndex` rebuild was firing on every `inspections`/`upcomingInspections` reference change — including `set({ isLoading: true })` flips during inspection mutations. Stabilized via an `attendeeHash` content-fingerprint of `[attendeeId:contactId:interest_level]` triples; the index now rebuilds only when actual attendee data changes. `interest_level` is included in the hash so a real-time-subscription path that hot-patches nested `inspections[].attendees` can't silently score against stale levels.
- **Snackbar+Undo for completed-checklist remove** (`apps/mobile/app/whiteboard.tsx`). Replaced the prior Dialog confirm. Captures the full item shape (including `ref_id`) before optimistic delete; 5s Undo button on the Snackbar recreates the item with all bindings intact. No more hard-delete-with-no-recovery.
- **Embedded MapView picker for the map widget editor** (`apps/mobile/components/whiteboard/EditItemSheet.tsx`). Replaced the three numeric lat/lng/zoom inputs with a 210pt embedded `<MapView>`: draggable centered Marker plus `onLongPress` to drop a pin. Region changes debounce 600ms then reverse-geocode; the resolved address renders below the map. Save derives `viewport.zoom` (tile-zoom integer) from the map's `latitudeDelta` via `Math.round(Math.log2(360 / delta))`, clamped 1–21. Uses `react-native-maps` which is already a dep — no native rebuild needed.
- **Pin-to-whiteboard expanded** to three more entry points:
  - `apps/mobile/app/inspection/[id].tsx` — header overflow Menu pins the inspection's `property_id` as a `property` widget. Menu item is `disabled` when the inspection has no property_id (was a silent no-op before review).
  - `apps/mobile/app/(tabs)/map.tsx` — building Dialog.Actions adds a "Pin to whiteboard" button; pins as a `map` widget with `overlays: ['buildings']` so re-tapping opens the map with the buildings layer enabled (T#13's deep-link contract from the prior block).
  - `apps/mobile/app/(tabs)/contacts.tsx` — multi-select bar adds a "Pin" button capped at 10/tap. Cards stagger on a 24pt diagonal so they don't all land at the same coords.

**Full web parity for the 2026-05-06 sprint:**

- **`apps/web/src/components/whiteboard/MapCard.tsx`** (new, 108 lines) — calls `reverseGeocode` on first render, persists address/suburb via `updateItem`, navigates to `/map?lat=&lng=&zoom=&layer=` on click. Replaces the prior "View on mobile" placeholder for `map`-typed items.
- **Animated Move/Edit toggle on web** (`apps/web/src/components/WhiteboardView.tsx`) — `AnimatedModePill` 230×36px segmented control with a sliding indicator (CSS transform + 200ms cubic-bezier transition). Visual parity with the mobile spring-pill but using web-native motion primitives.
- **Completed-checklist Snackbar+Undo on web** (`apps/web/src/components/WhiteboardView.tsx`) — when all checklist entries are checked and the widget is deleted, a 5s bottom-center toast offers Undo. Recreate captures the FULL item shape including `ref_id` so live-binding survives the delete/undo round-trip even for non-checklist widget types reusing this path.
- **Real photo picker on web** (`apps/web/src/components/whiteboard/PhotoWidget.tsx`) — uses the browser's native File API (`<input type="file" accept="image/*">`) since `expo-image-picker` is RN-only. Same Supabase Storage `whiteboard-photos` bucket as mobile; same demo-mode bypass to a `picsum.photos` placeholder; same inline error UX on upload failure.
- **`apps/web/src/components/whiteboard/SuggestionCard.tsx`** (new, 216 lines) — port of mobile SuggestionCard with kind→route translation: `hot_prospects` → `/contacts/<id>`, `coverage_gap` → `/map?layer=buildings&...`, `today_play` → `/prospecting` (no web inspection detail screen exists yet — falls back gracefully), `route` → `/map?layer=contacts&...`.
- **Map deep-link consumer on web** (`apps/web/src/components/MapView.tsx`) — accepts `?lat=&lng=&zoom=&layer=` and applies on URL change. `?zoom=` is treated strictly as `latitudeDelta` in degrees (cross-platform contract); converted to Google Maps tile-zoom at the boundary via `Math.round(Math.log2(360 / delta))`. Layer param wires to existing layer toggles.
- **Pin-to-whiteboard on web detail screens** (`apps/web/src/components/ContactDetail.tsx`, `apps/web/src/components/PropertyDetail.tsx`) — buttons below Edit/Delete; toast with "Open" link to `/whiteboard`. Both correctly carry `ref_id` for live-binding (caught in review — see Fixed below).

### Fixed (post-review pass)

- **Web pin-to-whiteboard omitted `ref_id`** — `ContactDetail.tsx` and `PropertyDetail.tsx` were creating widgets without the live-binding key, so deletion cleanup and lead-score live updates wouldn't propagate to web-pinned cards. Added `ref_id` to both (mobile equivalents already had it). H1 from review.
- **Snackbar+Undo recreate omitted `ref_id`** — both mobile (`apps/mobile/app/whiteboard.tsx`) and web (`apps/web/src/components/WhiteboardView.tsx` ) were dropping `ref_id` on the recreate path. Latent today (only fires for ref_id-less checklists) but a landmine for any future widget type reusing the path. Added to both. H3 from review.
- **`?zoom=` cross-platform contract drift** — three different conventions in play: web MapCard pushed tile-zoom integers, web SuggestionCard pushed latitudeDelta, web MapView consumer used a `>21 = delta, ≤21 = tile-zoom` heuristic to disambiguate. The heuristic was brittle (a producer pushing `?zoom=0.5` thinking "coarse delta" would be misread as tile-zoom 1, fly to a whole-region view). Unified all producers to send `latitudeDelta`; web MapCard now converts `360 / 2^z` at push time matching mobile. Consumer drops the heuristic; `?zoom=` is strictly a delta. H2 from review.
- **`attendeeHash` missed `interest_level` mutations** — the perf-fix hash only fingerprinted `id:contact_id`, so a level change on an existing attendee wouldn't trigger an `attendeeIndex` rebuild. Masked today by the fact that `useInspectionStore.updateAttendee` mutates the flat `attendees` array, not the nested `inspections[].attendees`, but a future real-time-subscription path could trigger silent stale-score scoring. Hash now includes `interest_level`. H4 from review.

### Style / polish (folded in)

- **Inspection pin no-op silenced** when `property_id` is missing — Menu.Item now disables itself rather than swallowing the tap. (S1 from review.)
- **Bulk-pin contacts cascade-stagger** at 24pt diagonal instead of all stacking at `(0, 0)`. (S2 from review.)

### Verified

- `cd apps/mobile && pnpm exec tsc --noEmit` ✓
- `cd apps/web && pnpm exec tsc --noEmit` ✓
- `pnpm --filter web build` ✓ (web-eng confirmed; reviewer re-verified — all 19 routes static-prerender)
- Reviewer verdict: **ship-with-followups** before fixes; all four high-confidence concerns landed in the same session, leaving no follow-ups blocking ship.

### Deferred to a future sprint

- **iOS haptics** on the Move/Edit toggle (Android works via `Vibration` core API; iOS needs `expo-haptics` + an EAS prebuild — no precedent for the dep elsewhere, deferred per user call).
- **Documented zoom-contract helper** — H2 was patched at every site, but a shared `buildMapDeepLink({ lat, lng, tileZoom })` helper in `packages/api` would prevent future producers from drifting again. Worth doing on the next map-feature touch.
- **MapCard `useEffect` dep noise** — the `content` reference in the deps array is fine in practice (the `geocodeFired` ref guards against re-fetch) but reads ambiguously. Replace with primitive deps. (S3 from review.)
- **Map picker tile-zoom rounding** can shift the saved zoom by ±1 from what the user pinch-zooms to. Acceptable for territory pins but worth flagging if a partner reports it. (S5 from review.)

---

## [Unreleased] - 2026-05-06

### Added — Whiteboard becomes a first-class index into the app

- **Whiteboard in the bottom tab bar** — new `apps/mobile/app/(tabs)/whiteboard-tab.tsx` redirect shim + `_layout.tsx` entry. Was previously buried under More → Field Work; now one tap from anywhere.
- **"Pin to whiteboard" actions** on contact + property detail screens (`apps/mobile/app/contact/[id].tsx`, `apps/mobile/app/property/[id].tsx`). Header overflow icon → creates the corresponding live-bound widget on the board → Snackbar "Pinned to whiteboard — Open" with a one-tap link back to the board. Inspection + building detail are deferred to a follow-up.
- **Real photo upload** for the photo widget — `expo-image-picker` (camera + library) → Supabase Storage upload to `whiteboard-photos` bucket → public URL persisted as `content.url`. Demo mode falls back to `picsum.photos` placeholder URLs so seed users don't hit Storage. Replaces the paste-an-image-URL placeholder UX. Touches `EditItemSheet.tsx` (+217 lines), `package.json`, lockfile.
- **Tappable suggestion cards** (`apps/mobile/components/whiteboard/SuggestionCard.tsx`) — Intelligence sidebar suggestions now deep-link by kind:
  - `hot_prospects` → `/contact/<id>` (uses first id in payload).
  - `coverage_gap` → map centered on the building with the buildings layer enabled.
  - `today_play` → `/inspection/<id>` (or `/(tabs)/prospecting` if id missing).
  - `route` → map centered on the first ordered stop with the contacts layer enabled and a wider zoom (~5km region).
  Missing-payload paths fail soft (no nav) rather than crashing.
- **Map deep-link contract** (`apps/mobile/app/(tabs)/map.tsx`) — accepts `?lat=`, `?lng=`, `?zoom=` (latitudeDelta in degrees), and `?layer=<key>` query params and applies them on focus. Auto-enables the requested layer (`contacts | properties | fieldActivity | buildings | stats`) if not already visible. Same contract is used by MapCard taps, suggestion deep-links, and (in future) the route view's map dispatch.
- **MapCard renders the resolved address** instead of raw `lat: -33.8688 / lng: 151.2093 / zoom: 13`. New `packages/api/src/geocoding.ts` does OSM Nominatim reverse-geocoding with an in-memory LRU cache (200 entries, keyed on lat/lng rounded to 4 decimals ≈ 11m precision), required `User-Agent` header, null-cache on 429/network error. Resolved address + suburb persist back onto the row so re-renders skip the network call. `WhiteboardMapContent` extended with optional `address` + `suburb`.
- **Completed-checklist "Done — remove?" pill** — when every item in a to-do widget is checked, a pill appears on the card so users can dismiss it in one tap. Touches `ChecklistCard.tsx`, `WhiteboardItemView.tsx`, `apps/mobile/app/whiteboard.tsx`. Currently a Dialog confirm → hard delete; Snackbar+Undo deferred (see Known issues).
- **Inspection attendance feeds lead scoring** (`packages/hooks/src/useLeadScoringEngine.ts`) — open-home attendance now bumps the attendee's lead score, weighted by `interest_level` (hot=+12 / warm=+6 / cold=+2 / null=+4), recency-decayed (1.0× ≤14d, 0.6× 15-45d, 0.3× 46-90d, 0× older), capped at +30 so a single hot attendee can't dominate. Total score still capped at 100, tier mapping unchanged. Composes via memoized `Map<contactId, attendees[]>` index keyed on `[inspections, upcomingInspections]`.
- **Animated Move/Edit toggle** — `WhiteboardToolbar.tsx` (+163 lines) replaces the static buttons with a sliding segmented-control pill (Reanimated `withSpring`, mass/damping/stiffness matched to existing `SPRING_LIFT/SPRING_DROP`) plus an Android `Vibration` haptic on real toggle. iOS haptic via `expo-haptics` deferred — no precedent for the dep yet.
- **`useSmartSuggestions` owns its own `fetchUpcoming()` trigger** — mount + 5-min interval + in-flight dedup via `useRef` + demo-mode skip. Without this nothing in the app called `fetchUpcoming()`, so the `today_play` suggestion bucket was effectively dead.

### Changed

- **"Notes" replaces "Session tracking"** in user-facing copy on `apps/mobile/app/tracking/[id].tsx` and the prospecting/guided flow's tracking strings. Internal symbols (`useTrackingStore`, etc.) intentionally kept.
- **Mobile dashboard's today's-inspections filter** now excludes `status === 'cancelled'` and consistently filters on the same-day semantic. Web dashboard parity deferred.
- **`InspectionAttendee` type** now declares `suggestedContactMatch?: boolean` — the transient flag `addAttendee` was already returning but wasn't typed, causing silent property strip in some consumers. (`packages/types/src/entities.ts`.)

### Fixed

- **Move-mode drag crashes the app** (Reanimated 4 strict workletization) — `WhiteboardItemView.tsx` had a module-scope `snap()` helper that was called from inside the Pan gesture's `onEnd` worklet. Reanimated 4 hard-crashes with "Tried to synchronously call a non-worklet function on the UI thread" the moment a drag is released. Fixed by adding the `'worklet'` directive to `snap()`. Repro: drag any whiteboard item ≥ 4pt and release. Symptom: app crash on every drop.
- **Checklist text writes backwards when prepending** — per-entry `TextInput`s in the checklist editor sourced `value` directly from the parent's `checklistEntries` array, so every keystroke triggered a parent re-render that raced the native cursor sync on RN-Paper's `mode="flat" dense` wrapper. Cursor reset to position 0 after each keystroke; typing "abc" at the start of "hello" produced "cbahello". Fixed by extracting a `ChecklistEntryEditor` inner component that buffers the live value in local state and commits upstream on every change. (`apps/mobile/components/whiteboard/EditItemSheet.tsx`.)
- **Sticky-note text writes backwards when prepending** — same root cause as the checklist (parent-controlled `value`, store re-emit on every keystroke). Same buffered-input pattern applied. (`apps/mobile/components/whiteboard/StickyNote.tsx` +80 lines.)
- **Toolbar haptic fires on every screen mount, not just on toggle** — `WhiteboardToolbar.tsx`'s first-render guard was racy. The `onLayout` handler cleared `isFirstRender.current = false` eagerly on first measurement, so the next effect run (triggered by `setSegmentWidth`) found the ref already false and treated a measurement-driven re-render as a real toggle, firing the spring animation + Android vibration. Replaced the ref with a `prevModeRef<WhiteboardMode | null>` keyed on actual mode change. Layout handler no longer touches the ref. Cold-open the whiteboard now does nothing; only real Move↔Edit toggles fire feedback.
- **MapCard tap shows continental view instead of the saved location** — stored `viewport.zoom` is a tile-zoom integer (Google/OSM convention, default 13), but `(tabs)/map.tsx` interprets `?zoom=` as `latitudeDelta` in degrees. A value of 13 ≈ 1450km region, so tapping a Sydney CBD pin showed the entire continent. Fixed by converting tile-zoom → latitudeDelta at push time via `360 / 2^z` with a 1-21 sanity clamp. At z=13 → ~0.044° ≈ 5km region; at z=17 → ~300m.
- **Coverage-gap suggestion card has nowhere to land** — `useSmartSuggestions` payload for the `coverage_gap` kind didn't include lat/lng even though `DeclaredBuilding` rows carry them. Tap-through opened the map with the buildings layer enabled but no camera focus, leaving the user to scan for the building manually. Added `lat`/`lng` to the payload + SuggestionCard now uses them when present (older persisted suggestions without coords still navigate, just to a less-focused view — backward-compatible).
- **Photo upload silently swallows the photo on Supabase error** — when `uploadPhoto()` returned `null`, the picker callbacks did `if (url) setPhotoUrl(url)` and silently no-op'd. The user saw the spinner stop and the local preview persist (which looks identical to a saved photo), then on Save got an empty URL persisted with no warning. Now surfaces inline error text + clears the local preview so the failure is obvious. (`EditItemSheet.tsx`.)
- **`useInspectionStore` actions leave `isLoading: true` on error** — `createInspection` and several siblings only reset `isLoading` on the catch path, not on the `return null` early-out paths after a Supabase error. UI subscribers stuck in loading state on a failed write. Audited every exit path and confirmed reset on both success and failure.
- **iOS pretends to vibrate on Move/Edit toggle** — `Vibration.vibrate(30)` is a no-op on iOS for short pulses, so the toolbar's haptic was Android-only in practice but the call was unconditional. Gated to `Platform.OS === 'android'` so iOS doesn't pretend to provide feedback it isn't. Proper iOS haptics via `expo-haptics` deferred.

### Known issues

- **Lead-scoring perf cliff on large contact tables.** `useLeadScoringEngine.attendeeIndex` rebuilds whenever the `inspections` or `upcomingInspections` reference changes. With the more-aggressive `isLoading: true` set calls preceding mutations, the store now publishes intermediate states more often, which can make the outer per-contact memo recompute frequently during inspection edit flows. Mitigation: split the index memo or use a stable-key cache. Not blocking; flag for next perf pass.
- **Completed-checklist "Done — remove?" hard-deletes with no Undo.** Currently a Paper Dialog confirm → `deleteItem`. Should implement Snackbar + Undo (capture deleted item content/position for recreation) OR add a soft-delete `archived_at` column before broader rollout.
- **iOS haptics on Move/Edit toggle.** Android works; iOS would require adding `expo-haptics` + an EAS prebuild. Deferred — no precedent for the dep elsewhere in the app.
- **Real map picker for the map widget editor.** EditItemSheet still takes raw lat/lng/zoom numeric inputs. The "Zoom" input has no range hint either — users typing a `latitudeDelta` value (e.g. 0.05) will be clamped to 13 by MapCard. Add a range hint + better label, or replace with an embedded MapView with onLongPress to capture coords.
- **"Pin to whiteboard" scope.** Implemented on contact + property detail only. Inspection detail, building detail, and contact-list multi-select pin are not yet wired.
- **Web parity.** Explicitly skipped this sprint per scope. When web is revisited: shared address-resolution helper (already in `packages/api`) and shared lead-scoring inspection bonus (already in shared hook) port for free. Pin-to-whiteboard, image picker, suggestion deep-links, animated toggle, completed-checklist remove, and map deep-link consumer all need web-side ports.

### Required to land this update in the running app: a fresh `eas build`

The photo widget integration adds **`expo-image-picker`**, which is a native module — it ships native iOS and Android code that must be linked into the .ipa / .apk at build time. Static `import * as ImagePicker from 'expo-image-picker'` at the top of `EditItemSheet.tsx` will crash any existing build that doesn't have the native side compiled in: opening the whiteboard route mounts EditItemSheet, the import fires at module-load, the native module isn't registered, and the app crashes.

OTA (`eas update`) cannot deliver this — it only pushes JavaScript bundles to existing native builds. You need a full rebuild:

- `pnpm mobile:build:preview` — rebuilds Android preview channel
- `pnpm mobile:build:production` — rebuilds iOS + Android production
- For local dev: `pnpm --filter mobile ios` / `pnpm --filter mobile android` (runs `expo run:` which prebuilds + builds locally)

The same rebuild also lands the still-pending **caller-id native module fix** from the 2026-05-01 sprint (Android silent SMS + iOS App Group identifier mismatch). Both are bundled into the next build.

### Verified

- `cd apps/mobile && pnpm exec tsc --noEmit` ✓
- ~795 lines added net across 23 modified files + 2 new files (`packages/api/src/geocoding.ts`, `apps/mobile/app/(tabs)/whiteboard-tab.tsx`).
- Pre-existing package-level type errors (`packages/hooks` caller-id native module path, `packages/api` `process` refs) are environmental — they resolve correctly when consumed from `apps/mobile`. Unchanged by this sprint.

---

## [Unreleased] - 2026-05-01

### Added — Web parity sprint (matches mobile capabilities)

- **Lead score column in web ContactsTable** — new "Score" column between Status and Tag, consuming `useLeadScoringEngine.getScore/getTier`. Tailwind-based `LeadScoreBadge` (`apps/web/src/components/LeadScoreBadge.tsx`) — visual port of the React Native version with the same `TIER_COLORS` (hot=red, warm=amber, cold=indigo, dormant=gray).
- **SMS Campaigns on web** — new `SmsCampaignsView` and tabbed `apps/web/src/app/campaigns/page.tsx` with Email / SMS toggle. Consumes `useSmsCampaignStore`. List/create/edit/delete + add-recipients dialog with opt-out + DNC filter, 160-char counter, merge fields. **NOTE: this deviates from the project's mobile-first convention** — SMS UI shipped on web before mobile. Mobile SMS UI is the higher-priority follow-up to restore the normal mobile→web ordering.
- **Caller ID & Communications section on web Settings** — read-only stats (With Phone / Caller-ID Eligible / Do Not Contact). Caller ID recording is iOS/Android only (native module) so web shows the data + directs principals to install mobile app to enable it.
- **Declared building circles on web map** — `GoogleMap` now accepts `declaredBuildings` and renders amber `google.maps.Circle` overlays sized by `estimated_units` (12-40m radius). Click → InfoWindow with address + unit count. New "Buildings" toggle in the map toolbar.
- **"Declare Building" quick-add on web map** — right-click context menu adds a third action alongside Quick Note and New Contact. Opens a small dialog asking for total units, calls `upsertDeclaredBuilding` (which keeps the higher of existing vs new unit count, never downgrades).
- **Web Providers hydrates declared buildings** — `apps/web/src/components/Providers.tsx` now calls `useDeclaredBuildingsStore.fetchDeclaredBuildings()` after `fetchContacts()`, mirroring mobile root layout. Clears on signout.

### Added — Mobile performance sprint

- **Map clustering** — `apps/mobile/app/(tabs)/map.tsx` now uses `ClusterMapView` from `react-native-map-clustering` (drop-in replacement for `MapView`). Markers cluster at zoom <14; Polygons / Circles / Polylines (declared buildings, OSM polygons, tracking polylines, heat circles) pass through unaffected. Cluster styling: indigo `#6366f1`, 40px radius.
- **Viewport-bounds filter** — `mappedContacts` useMemo filters out contacts outside the visible region (with 100% buffer to avoid pop-in when panning), so off-screen Markers never render.
- **Today dashboard 30s staleness guard** — `apps/mobile/app/(tabs)/index.tsx` uses a `useRef<number>` last-fetch timestamp; `useFocusEffect` skips re-fetch when last fetch was <30s ago. Pull-to-refresh resets the timer for manual override.
- **`useStreetStats` enabled flag** — new `options?: { enabled?: boolean }` parameter (default true to preserve existing call sites). When false, the heavy `streets` useMemo early-returns `[]`, skipping the O(n*m) compute. Mobile map now passes `{ enabled: visibleLayers.stats }` so the heatmap layer toggle actually gates the work (it previously didn't, despite the boolean being passed positionally).

### Fixed

- **Web type-check pre-existing failure** — added `apps/web/src/shims/caller-id-module.ts` + tsconfig path mapping to satisfy the `import type { RecentCall } from 'caller-id/src/CallerIdModule'` in shared `useCallLogSync.ts`. Web type-check now passes.
- **Mobile type-check pre-existing failure** — same caller-id resolution issue fixed via path mapping in `apps/mobile/tsconfig.json`. Mobile type-check now passes.

### Added — SMS templates + labels (mobile)

- **New `sms_templates` and `sms_labels` tables** (migration `026_sms_templates.sql`) plus a `sms_template_labels` junction. Templates and labels are sibling entities — labels are not a column on templates, they exist alongside via M2M, so a template can carry multiple labels and a label can apply to many templates. Both team-scoped via RLS.
- **New `useSmsTemplateStore`** in `packages/hooks/src/useSmsTemplateStore.ts`: fetchAll (templates + labels + junction in parallel, then attaches labels per template in-memory), createTemplate (with optional `labelIds`), updateTemplate (replaces label set), deleteTemplate, plus full CRUD for labels, plus a `templatesByLabel(labelId)` helper. Demo-mode seeded with 3 templates and 8 labels (General, Open Home, Follow-up, Cold Outreach, Market Update, Appointment, Listing Update, Seasonal).
- **Bulk SMS modal template picker** (`apps/mobile/app/(tabs)/contacts.tsx`): label filter chips + template chips appear above the message editor in compose phase. Tap a template to apply, tap a label to filter templates. "Save current" button opens a dialog to save the current draft as a new template with selectable labels.
- **Root layout hydration**: `apps/mobile/app/_layout.tsx` now fetches templates + labels alongside contacts and declared buildings on auth, and clears them on signout.

### Fixed — bulk SMS UX from real user feedback

- **"Hard to press send"** (user complaint via screenshot): added a sticky bottom Send button to the bulk SMS modal in compose phase, separate from the keyboard-occluded header Send button. Always reachable while editing the message.
- **"lol fk I lost my message"** (user complaint via screenshot): closing the bulk SMS modal mid-edit now triggers a 3-way Alert — "Keep editing" / "Save & close" (preserves draft for next open) / "Discard" (clears it). The seed message no longer overwrites a preserved draft when the modal is reopened.

### Added — Mobile SMS campaigns screens (restores mobile-first ordering)

- **Channel toggle in `apps/mobile/app/campaigns/index.tsx`**: SegmentedButtons (Email / SMS) at the top of the existing campaigns list. Each channel has its own status filter chips (SMS uses draft/sending/sent/failed; email keeps draft/scheduled/sending/sent). FAB routes to `/campaigns/new` or `/campaigns/sms/new` based on the active channel.
- **New `apps/mobile/app/campaigns/sms/[id].tsx`** — SMS campaign detail/compose screen. Handles both `'new'` (creates a draft on first save, then transitions to edit mode) and existing campaign editing. Includes:
  - Status chip + recipient/sent/failed counts.
  - Template picker (label-filterable chip row, mirrors the bulk SMS modal pattern).
  - Merge-field chips ({{first_name}}, {{last_name}}, {{property_address}}).
  - Character counter (160-char SMS limit warning) + live preview replacing {{first_name}} with a contact's name.
  - Recipient picker dialog (search-filtered, opt-out + DNC filtered server-side via `addRecipients`).
  - "Save draft" / "Save changes" / "Send" / "Delete" actions, gated on draft status.
  - Read-only mode for non-draft campaigns (prevents edits to in-flight or sent campaigns).
- **Route registered** in `apps/mobile/app/_layout.tsx` SafeStack: `campaigns/sms/[id]` with title "SMS Campaign".

This restores the mobile-first convention: SMS UI now exists on mobile too, where the field agents work. The web SMS UI from earlier this sprint becomes the principal/broker oversight view rather than the only surface.

### Fixed — CallerIdModule fails to load on both iOS and Android (user-reported)

- **Root cause**: the `modules/caller-id/` workspace was missing the build files Expo Modules autolinking needs to compile native code. Without them, `requireNativeModule('CallerId')` threw at runtime and the lazy `try/catch` swallowed it silently.
- Created **`modules/caller-id/CallerId.podspec`** so iOS autolinking can build the Pod (with `exclude_files` for the `CallerIdExtension` subfolder so the App Extension target doesn't conflict).
- Created **`modules/caller-id/android/build.gradle`** so Android autolinking can build the AAR (applies the standard `ExpoModulesCorePlugin.gradle`).
- Created **`modules/caller-id/android/src/main/AndroidManifest.xml`** declaring SEND_SMS, READ_CALL_LOG, READ_PHONE_STATE, POST_NOTIFICATIONS — without SEND_SMS the Android `sendDirectSms` would fail even after the module loads.
- **Bonus bug fixed**: the iOS App Group identifier was hard-coded to `group.com.realestate-crm.callerid` in both `CallerIdModule.swift` and `CallerIdExtension/CallDirectoryHandler.swift`, but `app.plugin.js` derives it from the bundle id as `group.<bundleId>.callerid` = `group.com.realestate-geo.crm.callerid` for the current app. Both Swift files now use the matching identifier so Caller ID directory persistence actually works.

**Required to land this fix in the running app**: a fresh `eas build`, NOT an `eas update` / OTA. The fix touches native code (new podspec, build.gradle, AndroidManifest, modified Swift) which OTA can't deliver — `eas update` only pushes JavaScript bundles to existing native builds.

- `pnpm mobile:build:preview` — rebuilds Android preview channel
- `pnpm mobile:build:production` — rebuilds iOS + Android production

You do NOT need to run `pod install` manually; the EAS build pipeline runs it server-side as part of the iOS build. Once the new builds are live in TestFlight / Play Console, normal `pnpm eas:update-preview` / `eas:update-production` OTA updates resume on top of them.

Until a fresh `eas build` lands, bulk SMS on Android will continue to open the native messaging app.

### Known issues (logged for follow-up)

- **(none from this session — CallerIdModule diagnosis + fix shipped above pending rebuild.)**

### Verified

- `pnpm --filter web type-check` ✓
- `pnpm --filter mobile type-check` ✓
- `pnpm --filter web build` ✓ (18 routes compile)

---

## [Unreleased] - 2026-04-14

### Changed

- **Bulk SMS uses first name only** — SMS personalization (`{name}` on mobile, `{{first_name}}` on web) now resolves to `first_name` instead of full name, for more natural casual messaging ("Hi John" instead of "Hi John Smith"). Label updated from "personalized name" to "first name".
- **"Clear Selected" on all multi-select screens** — Web TasksView now has a "Clear Selected" button when tasks are checked. Mobile contacts adds a "Clear" button (deselects all, stays in select mode) alongside "Cancel" (exits mode). Mobile tasks splits the old "Clear" into "Clear" (deselect) + "Cancel" (exit mode). Web ContactsTable already had this.

---

## [Unreleased] - 2026-04-03

### Added

#### Smart Prospecting Engine
- **Lead Scoring Engine** (`useLeadScoringEngine`) — 5-component scoring algorithm (0-100) computing likelihood-to-list for every contact: staleness decay (25pts), nearby sales momentum (25pts), engagement history (25pts), street conversion rate (15pts), dwelling penetration (10pts). Tiers: hot (75+), warm (50-74), cold (25-49), dormant (<25). Batch write-back to Supabase on session end.
- **LeadScoreBadge component** — colored pill badge showing score/tier, small (inline) and medium (header) sizes. Wired into ContactCard, contact detail, and map markers.
- **ScoreBreakdownSheet** — tap a score badge to see the 5-component breakdown with progress bars
- **Route Optimizer** (`routeOptimizer.ts`) — nearest-neighbour TSP with score weighting. Effective distance = haversine * (1.5 - score/100), so high-score contacts are prioritized.
- **Guided Prospecting Store** (`useGuidedProspectingStore`) — manages guided session lifecycle: startGuidedSession (auto-generates scored route), completeStop (outcome → follow-up task rules), skipStop, proximity alerts, building coverage tracking. Follow-up rules: no_answer → 2d task, voicemail → 3d task, interested → 1d appraisal, not_interested → dormant 90d, callback → 1d high priority.
- **Guided Prospecting Screen** (`/prospecting/guided`) — 3-phase flow: loading → editing → walking. Editing phase: full-height map with contact markers, manual stop add/remove/reorder, ad-hoc stops via long-press (reverse geocode), address search via Google Places autocomplete. Walking phase: current stop card with outcome buttons, upcoming stops list, proximity alert banner, building coverage chip.
- **Territory Heatmap** — refactored `useStreetStats` with 5-factor opportunity score: (1-penetration/10)*40 + freshness*30 + salesMomentum*20 + conversionRate*10. New fields: opportunityScore, salesMomentum, penetrationPct, conversionCount. Added `getBriefing()` method returning TerritoryBriefing.
- **TerritoryBriefingCard** — tap a heatmap circle on the map for suburb intel: median price, days on market, penetration %, contact count, recent sales, recommended action chip

#### Prospecting Hub Restructure
- **Prospecting is the central hub** — all field operations flow from the Prospecting tab
- **Past Sessions view** — new "Sessions" segment combining tracking sessions + guided routes, sorted by date, with type badges (Tracking/Guided), duration, distance, stop count. Tap to view detail.
- **Consolidated start actions** — replaced "Go Prospect" chip + "Start Prospecting" FAB with two clear cards: "Start Guided Session" (primary, scored route) and "Start Tracking" (secondary, GPS only). Active session status display when running.
- **Routes tab removed** — functionality migrated to Prospecting hub. Route creation absorbed into guided prospecting editing phase. Past routes visible in Sessions view. Route detail screen preserved as stack screen.
- **Guided session → tracking session bridge** — ending a guided session creates annotations on the active tracking session: summary (stops visited/skipped, outcome breakdown, building coverage) + individual stop annotations linked to contacts

#### Mobile Data Harmonization
- **Activity consolidation** — merged dual arrays (`activities` + `recentActivities`) into single `activities: ActivityWithContact[]`. Unified `fetchActivities(contactIdOrLimit?)` method. All consumers updated.
- **Call outcome dedup** — new `callActivity.ts` utility with `generateCallDedupKey()` and `hasRecentCallActivity()`. Prevents double-logging between auto-detection and manual entry. Respects pre-created activities (checks `call_outcome` before suppressing).
- **Bidirectional Contact ↔ Property sync** — `getPropertiesForContact(contactId)` on usePropertyStore, `propertyLinksVersion` reactivity counter, cascade cleanup on deletion
- **Multi-tag granular methods** — `addTagToContact()` and `removeTagFromContact()` complement existing `syncContactTags()`. ContactForm wired to multi-select TagPicker.
- **Campaign ↔ subscription sync** — `subscriptionStatuses` map in useCRMStore, campaign `addRecipients()` checks opt-out status, returns `{ added, skippedOptOut }`
- **Inspection attendee auto-linking** — `findMatchingContact()` matches by phone (last 8 digits) or email, auto-links or sets `suggestedContactMatch` flag
- **Orphaned types cleanup** — deleted `apps/mobile/lib/types.ts`, migrated 10 import sites to `@realestate-crm/types`, promoted `PlaceAddressComponent` to canonical types

#### TrackingBanner Enhancements
- **Nearby Contacts bottom sheet** — "Nearby" button on expanded tracking banner opens full-width Dialog with sorted contacts (by distance), replacing the cramped top-right floating tray
- **Log Building coverage** — "Log Building" button opens dialog to record units knocked at an address without creating contacts. Stored as structured `BUILDING_COVERAGE` annotations for scoring engine.

### Changed

- **"Start Prospecting" → "Start Tracking"** on prospecting tab — clarifies it's GPS recording only, not guided mode
- **Heatmap layer renamed** "Stats" → "Opportunity" in map layer toggle
- **TrackingBanner "View Route"** → navigates to Prospecting tab instead of removed Routes tab
- **Today screen "Start Route"** → "Go Prospect" pointing to Prospecting tab

### Fixed

- **Post-call modal broken** — `addActivity` was sending `call_dedup_key` (in-memory field) to Supabase insert, causing PostgREST 400 errors on ALL call activity creation. Fixed by stripping the field before insert and re-attaching to in-memory object.
- **Post-call modal suppressed by pre-created activities** — `hasRecentCallActivity` now skips activities without `call_outcome` (pre-created by contact detail before call completes)
- **Android content behind nav buttons** — systemic fix: extracted `SafeStack` component inside `SafeAreaProvider` context, all stack/modal screens get `contentStyle: { paddingBottom: insets.bottom }`. Tab screens excluded.
- **3 missed `fetchRecentActivities` renames** — prospecting.tsx, stats.tsx, web StatsView.tsx updated to `fetchActivities`
- **`as any` cast in inspection store** — replaced with proper `suggestedContactMatch` field on `InspectionAttendee` type

---

## [Unreleased] - 2026-04-01

### Added

#### Contact Import Enhancements
- **Import filters** (web CSV import) — toggles to skip contacts without phone, without email, or duplicates; search box to filter preview rows; live "X of Y will be imported" counter
- **Bulk tag assignment on phone import** (mobile) — tag multi-select chips at preview step, applied to all imported contacts via `syncContactTags`
- **Inline tag creation during import** (mobile) — "+ New Tag" chip opens inline name input + 8-colour preset picker, auto-selects the new tag

#### Call Connect Tracking
- **Two-step CallOutcomeModal** (mobile) — Step 1: "Did the call connect?" (Connected / Not Connected). Step 2a (connected): notes capture ("What was discussed?"). Step 2b (not connected): pick reason (No Answer / Voicemail / Wrong Number / Busy)
- **`call_outcome` column** on `activities` table (migration `022_call_outcome.sql`) — tracks `connected | no_answer | voicemail | wrong_number | busy`
- **`CallOutcome` type** added to shared types, `useCallLogSync` refactored to queue pending calls for user outcome input before logging
- **Call Connect Rate KPI** in ProspectingReports — `callMetrics` in `useProspectingMetrics` computes total calls, connected count, connect rate %, breakdown by not-connected reason, WoW trend

#### Bulk SMS from Tasks
- **Multi-select on task list** (web) — checkbox column on task rows, select-all with indeterminate state
- **"Bulk SMS" button** — appears when 2+ tasks selected, opens compose modal
- **BulkSmsModal** — auto-generates template from `generateTaskMessage()`, editable textarea, live preview with contact name, recipient list with phone numbers, "X skipped — no phone" warning
- **Sequential SMS sending** (iOS-safe) — opens `sms:` links one at a time with progress indicator, Next/Skip/Stop controls, sent/skipped summary

#### SMS Campaign Infrastructure
- **Database migration** (`023_sms_campaigns.sql`) — `sms_campaigns`, `sms_messages`, `sms_opt_outs` tables with team-scoped RLS
- **`SmsCampaign`, `SmsMessage`, `SmsOptOut` types** added to shared types
- **`useSmsCampaignStore`** — Zustand store with campaign CRUD, `addRecipients` (filters opted-out/do_not_contact), `addRecipientsByTag`

#### Notes & Address Matching
- **`normalizeAddress()`** utility (`packages/utils/src/validation.ts`) — strips unit prefixes, normalises street type abbreviations (St/Street, Rd/Road, etc.)
- **`findContactByAddress()`** in `useCRMStore` — fuzzy address matching using `normalizeAddress`
- **"Add Note" panel** in web NotesView — address field auto-suggests matching contacts

#### Multi-Dwelling Input
- **Multi-dwelling toggle** in ContactFormDialog (web) — batch-create contacts at same address with sequential unit numbers (starting unit + count, capped at 100)
- **Multi-Dwelling Quick Add** in ProspectingReports (web) — collapsible card with address input, shows existing contacts/units at address, batch create with skip for existing units

#### Tag Management
- **TagManager component** (web, new) — full CRUD modal with preset + custom colour picker, inline edit name/colour, delete with confirmation
- **Tag filter dropdown** in ContactsTable (web) — checkbox list, count badge, "Manage Tags" button

#### Prospecting & Map
- **`useProspectingMatcher` hook** — GPS proximity matching (configurable radius, default 50m) using `haversineDistance()`, fuzzy address matching via token comparison
- **`haversineDistance()`** utility in `packages/utils/src/geocode.ts`
- **Map geolocation at startup** — both mobile (`expo-location`) and web (`navigator.geolocation`) now centre on user's actual position on first load, falling back to Greenfield Park
- **Nearby Contacts tray** (mobile map) — collapsible bottom panel showing contacts within 200m of current position, sorted by distance, with name/address/unit/last contacted; tap to navigate to contact detail
- **Multi-dwelling quick add from map** (mobile) — long-press dialog enhanced with multi-dwelling toggle, starting unit + number of units inputs, batch creates contacts via `bulkAddContacts`
- **Import filters** (mobile phone import) — skip without phone, skip without email, skip duplicates toggles + preview search bar; `effectiveSkipIndices` merges manual + filter skips; skipped rows dimmed
- **Call Connect Rate card** (mobile prospecting tab) — connect rate %, connected/total count, WoW trend arrow, breakdown chips (No Answer/Voicemail/Wrong Number/Busy); shows in DailyView when calls exist

### Changed

- **Contacts layer off by default** on mobile map (was `true`, now `false`)
- **Map markers guard against nil coordinates** — `.filter(c => c.latitude != null && c.longitude != null)` on contact and property markers to prevent iOS `NSInvalidArgumentException` crash

### Fixed

- **iOS map crash** — `[AIRGoogleMap insertReactSubview:atIndex:]` crash caused by Marker receiving nil lat/lng; fixed with null guards on all marker arrays
- **Migration numbering conflict** — both `call_outcome` and `sms_campaigns` used `022`; renamed SMS to `023_sms_campaigns.sql`

---

## [Unreleased] - 2026-03-30

### Added

#### Smart Contact Import
- **Phone address import** — bulk import and single contact picker now fetch structured addresses from device contacts (`Contacts.Fields.Addresses`), mapping street/city/state/postcode into the address field
- **`parseContactNameField()` utility** (`packages/utils/src/validation.ts`) — regex-based parser that detects Australian addresses embedded in messy name fields (e.g. `"Data: Jason Li – 713/45 Macquarie Street, Parramatta"` → name: Jason Li, address: 713/45 Macquarie Street, unit: 713)
- **Smart parsing on import** — applied as fallback when phone contact has no structured address but name field contains an address pattern; shows "Address extracted" chip in preview
- **Address shown in import preview** — preview list now displays the imported/extracted address for each contact
- **"Clean Up Imports" button** (web) — scans existing contacts for addresses stuck in name fields, shows before/after preview, batch updates

#### Mass Delete Contacts
- **`bulkDeleteContacts()`** store method — batch deletes via Supabase `.in('id', ids)` in 500-row batches, with demo mode support
- **Web multi-select** — checkbox column on contacts table, select-all toggle, floating action bar with count + "Delete Selected" + "Clear"
- **Mobile multi-select** — long-press a contact to enter select mode, checkboxes appear on each row, header bar with Select All / Delete / Cancel actions

#### Import UX Improvements
- **Permissions management** — "Permissions" button on import select screen opens device settings (for expanding from limited to full contact access)
- **Permission denied screen** — now shows "Open Settings" button instead of just "Go Back"
- **"Fill from Phone Contact"** — renamed from "Import from Contacts" in the contact form to clarify it pre-fills the form rather than importing directly

### Fixed

- **Contact edit bug** — `updateContact` now whitelists valid DB columns, preventing silent Supabase failures when form-only fields (`tag_ids`, `initial_note`) were passed through; `handleUpdate` checks for store errors before closing the form
- **Long-press not working** — `ContactCard` component now accepts and forwards `onLongPress` to its `TouchableOpacity`
- **Missing icon** — replaced `account-import` icon with `phone-outline` on the fill-from-phone button

---

## [Unreleased] - 2026-03-29

### Added

#### Prospecting-First UX Overhaul (Mobile)

- **Today dashboard** (`app/(tabs)/index.tsx`) — new home screen
  - Prospecting stat grid (doors, sessions, distance, contacts) with WoW trend badges
  - Streak banner with fire icon, best streak, weekly progress
  - "Where to Go Next" — top 3 recommended streets with scores
  - Quick action buttons, tracking card, overdue tasks, pipeline snapshot, recent contacts
  - Pull-to-refresh across all data sources
- **Prospecting tab** (`app/(tabs)/prospecting.tsx`) — new tab with 4 views:
  - Daily: stat grid, phone capture rate, session list, streak card, inspection summary
  - Weekly: WoW comparison cards, 4-week doors trend bar chart
  - Funnel: conversion funnel (Field Contact → Phone → Appraisal → Listed → Settled), inspection performance metrics
  - Territory: recommended areas with scores, building coverage, 12-week trend, suburb intelligence (ABS data)
- **"Start Prospecting" FAB** on Prospecting tab — confirms, starts tracking, navigates to map
- **Tab structure** — Today → Prospecting → Map → Contacts → More

#### Multi-Dwelling Support

- **`unit_number` field** on Contact + ContactFormData types, migration `020_add_unit_number.sql`
- **Unit/Apt input** in ContactForm (both modes), sanitised on submit
- **Display format** `Unit 3 / 45 Smith St` across ContactCard, ContactDetail, ContactsTable, ContactFormDialog
- **DropNoteDialog multi-dwelling mode** — per-unit logging with quick outcomes (Not Home, Spoke, Callback, Not Interested, Skip), GPS cached per building, structured `[Unit X]` annotation format

#### Map Overhaul (Mobile)

- **Consolidated layers** — replaced 5 separate toggles with Layers pill + bottom sheet with labeled switches
- **Field Activity layer** — merged routes + annotations into one layer with time windowing (7d/30d/All) and per-session selection
- **Buildings layer** — OSM multi-dwelling building footprints via Overpass API, color-coded by prospecting coverage %, tap for building detail dialog with unit coverage
- **"View on Map"** links throughout the app (contact detail, property detail, pipeline cards, properties list, contacts list) with auto-layer activation via `?layer=` param
- **GPS center button**, cleaned up FAB (Add Contact + Quick Note only)

#### Prospecting Performance System (All Phases)

- **`useProspectingMetrics` hook** — shared computation across mobile + web:
  - Period metrics (today/week/last week), WoW trends, conversion funnel
  - Streak tracking (consecutive days, longest streak, weekly target progress)
  - Inspection metrics (completed count, avg attendees, interest distribution, conversion rate)
  - Recommended areas (scored algorithm: staleness × density × past success)
  - Multi-dwelling building coverage (parsed from `[Unit X]` annotations)
  - 4-week and 12-week rolling trend data

#### Web Dashboard + Reports Overhaul

- **Dashboard rewrite** — property pipeline KPIs, upcoming inspections, tasks due, field activity, recent activity with SVG icons
- **Sidebar grouped by workflow** — Prospecting / Listings / Operations / Grow / System
- **Prospecting Reports page** (`/prospecting`) — all 3 phases:
  - KPI cards with WoW trends, conversion funnel, weekly + 12-week trend charts
  - Streak banner (gradient), inspection metrics, recommended areas table with scores
  - Multi-dwelling buildings card, suburb intelligence with penetration %
  - CSV import section for NSW VG sold history + ABS suburb stats
- **Field Activity** page — renamed from "Tracking", time window chips (7d/30d/All), per-session annotation counts, `[Unit X]` parsed into structured badges

#### Data Enrichment (Phase 4)

- **Database migration** (`021_sold_history_and_suburb_stats.sql`) — `sold_history` + `suburb_stats` tables with RLS
- **`useDataEnrichmentStore`** — sold history queries (by suburb, address, nearby with suburb fallback), suburb stats, CSV import methods, dmo data for 5 Western Sydney suburbse
- **`fetchMultiDwellingBuildings`** Overpass API function — queries OSM for apartments/flats/multi-story residential buildings in viewport
- **`OSMBuilding` type** with coordinates, center, levels, estimatedUnits
- **Import scripts** for real data:
  - `scripts/import-nsw-vg.ts` — parses NSW Valuer General `.DAT` files (semicolon-delimited B-records), deduplicates, batch imports
  - `scripts/import-abs-suburbs.ts` — joins ABS Census G01+G02+G34+G36 tables via SAL code lookup, imports dwelling counts + medians
- **Recent Sales Nearby** on property detail — fetches VG sold data within 500m (falls back to suburb match when lat/lng unavailable)
- **Suburb Intelligence** on Prospecting tab — real ABS dwelling counts, penetration %, dwelling mix

#### Tracking Prominence

- **Persistent "Track" button** in top header with confirmation dialog, theme-aware colours
- **Tracking start** from Today screen + Prospecting tab + header

### Changed

- **Tab bar** — Today → Prospecting → Map → Contacts → More (Pipeline moved to More → Manage)
- **More screen** — reorganised: Manage (Pipeline, Properties, Tasks) / Field Work (Routes, Notes, Campaigns) / Insights (Reports, Settings)
                                                     - **TopHeader** wrapped in `React.memo` with stable `renderHeader` reference
- **Pipeline cards** — replaced `onTouchEnd` with `TouchableOpacity` to fix touch propagation for map icon
- **Overpass servers** — replaced dead `maps.mail.ru` with `overpass.openstreetmap.ru`, building queries always start from primary server, 403 added to retry conditions
- **`parseSuburb` helper** — now strips state + postcode suffix (`"Greenfield Park NSW 2176"` → `"Greenfield Park"`) for ABS matching
- **Sold history nearby** — falls back to suburb-name query when VG records lack geocoded coordinates
- **Xcode Node path** — `.xcode.env.local` updated to stable `/opt/homebrew/bin/node` symlink

### Fixed

- **Tracking session start** — confirmation dialog prevents accidental background location tracking
                              - **Today screen contacts** — added `fetchContacts()` to `useFocusEffect`
                              - **Recent sessions** — sorted by `started_at` descending before slicing
- **Supabase migration** — fixed `unnest(get_user_team_ids())` to match existing RLS pattern
- **Web ProspectingReports** — fixed `SuburbRow.totalDwellings` type to allow undefined, fixed `contacts` reference in useMemo dependency

#### Data Integrity Fixes (post-audit)

- **Web Dashboard + ProspectingReports** — added missing `fetchContacts()` call to `useEffect`, fixing all-zeros KPI and empty prospecting metrics
- **Suburb Intelligence data matching** — replaced staleStreets-based suburb counting (capped at 50, filtered for staleness) with `suburbContactCounts` computed from full contacts array in `useProspectingMetrics` hook
- **`parseSuburb` improved** — handles no-comma addresses, 2-part addresses with state-only second segment, street-type heuristic for suburb extraction, strips all AU state codes + postcodes
- **Supabase 1000-row limit** — `fetchSuburbStats` now paginates with `.range()` in 1000-row chunks to fetch all 4,235 NSW suburbs (previously capped at 1000 by Supabase default)
- **Streak weekly progress** — now uses actual annotation count (doors knocked) instead of session count
- **Web sold history suburb fallback** — `PropertyDetail.tsx` now passes `suburb` to `fetchSoldHistoryNearby` matching mobile behavior, so VG data without geocoded lat/lng is found via suburb name match
- **Web SuburbIntelligenceCard** — accepts `suburbContactCounts` Map from hook instead of staleStreets, filters zero-contact suburbs when not searching, searchable with text input, sortable columns, paginated (50/page)
- **Mobile contacts + map screens** — added missing `fetchContacts`/`fetchTags` calls via `useFocusEffect`
- **Removed duplicate `parseSuburb`** in mobile `prospecting.tsx` — now uses shared version from `useProspectingMetrics`
- **Overpass servers** — replaced dead `maps.mail.ru` with `overpass.openstreetmap.ru`, building queries always start from primary server

---

## [Unreleased] - 2026-02-22

### Added

#### Field Notes & Annotation System

- **Tracking annotations table** (`supabase/migrations/007_tracking_annotations.sql`)
  - `tracking_annotations` table with session_id, lat/lng, note, contact_id
  - Team-scoped RLS policies
- **`TrackingAnnotation` type** added to shared types package
- **Annotation CRUD in tracking store** (`packages/hooks/src/useTrackingStore.ts`)
  - `fetchAnnotations`, `createAnnotation`, `updateAnnotation`, `deleteAnnotation`, `linkAnnotationContact`
  - Demo mode support, team context scoping
- **Route stop notes & contact linking** (`packages/hooks/src/useRouteStore.ts`)
  - `updateStopNotes(stopId, notes)` — edit notes without changing stop status
  - `linkStopContact(stopId, contactId)` — link a contact to a route stop

#### Mobile — Tracking Enhancements

- **Drop Note FAB** (`app/(tabs)/routes.tsx`) — amber floating button during active tracking to capture GPS-tagged annotations
- **Tracking session detail** (`app/tracking/[id].tsx`) — annotation markers (amber pins) on map, annotations merged into chronological timeline

#### Web Dashboard — Route Detail

- **RouteDetail** (`apps/web/src/components/RouteDetail.tsx`)
  - Collapsible stop cards with chevron toggle
  - Editable notes on visited/skipped stops (edit → textarea → save/cancel)
  - Contact linking: search dropdown + "Create Contact" with pre-filled address/coords
  - Activity timeline per stop showing last 5 activities, quick-add note input

#### Web Dashboard — Tracking Detail

- **TrackingDetail** (`apps/web/src/components/TrackingDetail.tsx`)
  - Annotation markers (amber pins) on Google Map
  - Nearby contacts overlay (green markers within 100m of route)
  - Click polyline to add new annotation
  - Edit/delete annotations in overlay panel, link contacts
  - Map legend overlay
- **TrackingList** (`apps/web/src/components/TrackingList.tsx`) — rows now clickable to navigate to detail view

#### Web Dashboard — Shims & Build Support

- **expo-modules-core shim** (`apps/web/src/shims/expo-modules-core.ts`) — `requireNativeModule`, `NativeModule`, `EventEmitter` stubs
- **react-native shim** — added `AppState` export and `AppStateStatus` type
- **expo-location shim** — added `LocationObject` and `LocationObjectCoords` interfaces
- **expo-task-manager shim** — added `TaskManagerTaskBody` interface

### Changed

- `apps/web/next.config.js` — added `expo-modules-core` to turbopack resolveAlias
- `apps/web/tsconfig.json` — added `downlevelIteration: true`
- `apps/web/src/shims/expo-constants.ts` — added `GOOGLE_MAPS_API_KEY` (UPPER_SNAKE_CASE)

### Fixed

- **MapView tag filter** — fixed to use `contact.tags` array instead of only `tag_id` for multi-tag filtering
- **MapView** — added `useSearchParams` for Stats → Map navigation
- **NewRoute coordinate check** — `lat == null || lng == null` instead of `!lat && !lng` (stops at 0,0 were incorrectly filtered)
- **RoutesTable** — added error handling to delete, fixed type cast
- **NotesView** — fixed `Map.entries()` iteration for es5 target with `Array.from()`

---

## [Unreleased] - 2026-02-15

### Added

#### Route Management (SOW #2)

- **Route creation screen** (`app/route/new.tsx`) — interactive map-based route builder
  - Tap contact markers to add/remove stops
  - Long-press on map to drop ad-hoc pins (reverse geocoded)
  - Address search bar (Google Places Autocomplete) for ad-hoc stops
  - Driving/walking mode toggle
  - One-tap route optimization via Google Routes API
  - Estimated duration display
  - Visual distinction between contact stops (green) and ad-hoc stops (blue)
- **Route detail screen** (`app/route/[id].tsx`) — active route navigation
  - Planned / in-progress / completed state management
  - Per-stop actions: Visited, Skip, Call, Note
  - Auto-completion when all stops are visited or skipped
- **Routes list tab** (`app/(tabs)/routes.tsx`) — route overview
  - FlatList with status chips (planned, in progress, completed)
  - FAB to create new route
  - Refreshes on tab focus via `useFocusEffect`
- **Route Zustand store** (`packages/hooks/src/useRouteStore.ts`)
  - Full CRUD: create, fetch, update status, reorder stops, delete
  - Team-scoped with `getTeamContext()` pattern
  - Demo mode support
- **Google Routes API v2 wrapper** (`packages/api/src/directions.ts`)
  - `fetchOptimizedRoute()` — optimized multi-stop routing via `computeRoutes`
  - `decodePolyline()` — encoded polyline decoder for map rendering
  - Waypoint optimization with `optimizeWaypointOrder`
- **Database migration** (`supabase/migrations/005_routes.sql`)
  - `routes` table with status, mode, polyline, timestamps
  - `route_stops` table with nullable `contact_id` for ad-hoc stops
  - Row Level Security policies using `get_user_team_ids(auth.uid())`
- **Types** — `Route`, `RouteStop`, `StopStatus`, `RouteMode` added to shared types package

#### Street Statistics

- **Stats list screen** (`app/(tabs)/stats.tsx`)
  - Per-street knock count, contact rate, last visit freshness
  - Sort toggle (most visited / best conversion)
  - Suburb filter
  - Color-coded freshness dots
- **Map stats overlay** (`app/(tabs)/map.tsx`)
  - Circle markers colored by visit frequency
  - Toggle FAB to show/hide stats layer
- **Stats hook** (`packages/hooks/src/useStreetStats.ts`)
  - Derived street-level statistics via `useMemo`

#### Navigation

- Routes and Stats tabs added to bottom tab bar (`app/(tabs)/_layout.tsx`)

### Changed

- `app.config.ts` — added `GOOGLE_MAPS_API_KEY` to `extra` section for runtime access via `expo-constants`
- `packages/api/src/index.ts` — exports for `fetchOptimizedRoute`, `decodePolyline`, `DirectionsResult`, `DirectionsLeg`
- `packages/hooks/src/index.ts` — exports for `useRouteStore`, `useStreetStats`
- `packages/types/src/entities.ts` — added route-related type definitions
- `packages/types/src/index.ts` — re-exports for new types

### Fixed

- Google Maps API key not loading at runtime (key name mismatch between `app.config.ts` and consumer code)
- Map view stuck on San Francisco when creating routes on simulator — now auto-centers on contacts via `fitToCoordinates`
- Route optimization failing when user location is in a different region (>500km) from contacts — falls back to first stop as origin
