# Changelog

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
