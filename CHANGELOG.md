# Changelog

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
- **`useDataEnrichmentStore`** — sold history queries (by suburb, address, nearby with suburb fallback), suburb stats, CSV import methods, demo data for 5 Western Sydney suburbs
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
