# Changelog

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
