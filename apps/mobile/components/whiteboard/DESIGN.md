# Smart Whiteboard — Visual Design Spec

_Version 1.0 · Phase 1 · May 2026_
_Icon lib: `react-native-vector-icons/MaterialCommunityIcons` (already in project)_
_Animation: `react-native-reanimated` ~4.1.1_

---

## 1. Canvas Surface

| Token | Light | Dark |
|---|---|---|
| `wb.canvas.bg` | `#F5F0E8` | `#1E1C1A` |
| `wb.canvas.dot` | `rgba(0,0,0,0.09)` | `rgba(255,255,255,0.09)` |

- Dot grid visible **Edit mode only**. Dot size: 2pt, spacing: 16pt.
- Warm tones are intentional — feels like a physical cork board, not a CRM screen.

---

## 2. Mode Pill (top-center, floating)

| State | Background | Text | Icon |
|---|---|---|---|
| **Move** | `surfaceVariant` (Paper token) | `onSurfaceVariant` | `cursor-move` |
| **Edit** | `#023c69` (primary) | `#FFFFFF` | `pencil-outline` |

- Size: 44pt tall × auto-width, min 100pt wide. Border radius: 22pt (full pill).
- Padding: 0 16pt.
- Transition: **200ms** `Easing.bezier(0.4, 0, 0.2, 1)` between states.
- Shared value for `backgroundColor` animated via `useAnimatedStyle`.
- Dark mode: Edit background uses MD3 dark `primary` → `#7CAED4` (Paper computes this); rely on `theme.colors.primary` + `theme.colors.onPrimary`.

---

## 3. Sticky Note Colors

Six colors, two palettes. Text is always `#1A1A1A` (near-black) for contrast.

| Slot | Name | Light bg | Dark bg | Icon for picker |
|---|---|---|---|---|
| 1 | Sunshine | `#FEF3AC` | `#D4A017` | `weather-sunny` |
| 2 | Coral | `#FFCDD0` | `#D94F57` | `heart-outline` |
| 3 | Sky | `#BFE0FD` | `#2E86C1` | `weather-partly-cloudy` |
| 4 | Mint | `#BBFAD0` | `#1A9C5B` | `leaf-maple` |
| 5 | Peach | `#FFE0C4` | `#D46A1E` | `fruit-pineapple` |
| 6 | Lavender | `#E2D9FC` | `#7C5CBF` | `flower-tulip-outline` |

- **Sunshine** is the default.
- In dark mode, use the Dark bg column for sticky background.
- Detect via `useColorScheme()` and swap — keep the token map in `whiteboardColors.ts`.

---

## 4. BaseWidget

- Corner radius: **12pt**
- Elevation: 3 (rest), 8 (dragging) — use Paper `Surface elevation` prop.
- Border: none at rest in Move mode.
- **Edit mode focus ring**: `2pt solid theme.colors.primary`, border radius: 14pt.
- Color stripe: 4pt wide left border using `borderLeftColor = stickyColor`, `borderLeftWidth: 4`. All widget types get it; only sticky/checklist use the color-coded stripe.
- Delete affordance: `×` button, top-right, 36pt hit area (wraps a 20pt icon). Only visible in Edit mode. Icon: `close-circle`, color: `#EF4444`.
- Drag handle: tap-and-hold visual — subtle grip dots (`drag` icon, 16pt, `onSurfaceVariant`). Place top-left inside Edit mode. Hit area: 44×44pt.
- Resize handle: bottom-right corner triangle, 28×28pt, `onSurfaceVariant` chevron (`chevron-down-right` or custom 2-line corner SVG).

### Widget lift animation (drag start)
```
scale: withSpring(1.04, { mass: 0.4, damping: 14, stiffness: 220 })
shadow: elevation 3 → 8 over 150ms
```

### Widget drop + snap animation
```
x/y → snapped value via withSpring({ mass: 0.5, damping: 12, stiffness: 180 })
scale: withSpring(1.0, { mass: 0.4, damping: 14, stiffness: 220 })
```
Brief overshoot (2-4pt) is desired — it should *feel* like the note landed.

---

## 5. Sticky Note Widget (StickyNoteWidget)

- Default size: **160 × 160pt**
- Background: sticky color (see §3). No card elevation — sticky notes are flat with a soft drop shadow.
  - Shadow: `shadowColor: '#000', shadowOpacity: 0.10, shadowRadius: 4, shadowOffset: {width:0, height:2}` + `elevation:2` for Android.
- Font: 15pt, `lineHeight: 22`, `fontWeight: '400'`, color `#1A1A1A`.
- Placeholder text: `"Quick note…"` — `color: rgba(26,26,26,0.4)`.
- Padding: 12pt all sides. Top 8pt reserved for drag handle area.
- Color picker trigger: bottom-right, icon `palette-outline`, 36pt touch target. Opens a mini inline row of 6 color swatches (24pt circles, 8pt gap, 4pt border on selected). Appears in **Edit mode only**.

---

## 6. Checklist Widget (ChecklistWidget)

- Default size: **200 × 240pt**
- Surface `elevation: 2`, corner 12pt, background `theme.colors.surface`.
- Title: `titleSmall` (Paper), editable TextInput, 1 line, with bottom border only.
- Row height: **44pt** (touch target). Checkbox left, text right, delete swipe.
- Checkbox: 22pt, `primary` color when checked.
- Add row: `+ Add item` text button at bottom, `14pt`, `primary` color, 44pt tap target.
- Item text: `bodyMedium` (Paper).

---

## 7. Photo Widget (PhotoWidget)

- Default size: **200 × 200pt**
- Empty state: dashed 2pt border (`onSurfaceVariant`, `#AA`), corner 12pt, icon `image-plus` centered (32pt), label `"Tap to add a photo"` (`bodySmall`, `onSurfaceVariant`).
- Filled state: image fills widget (cover), corner radius 12pt. Edit mode shows replace icon (`camera-retake-outline`) overlay at 40% opacity centre.

---

## 8. Add-Widget Bottom Sheet

Grid: 3 columns, 24pt gap, 16pt outer padding.
Each cell: 80pt wide, icon (28pt) + label (12pt, center-aligned).

| Widget | Icon | Label | State |
|---|---|---|---|
| Sticky note | `note-text-outline` | Quick note | Active |
| Checklist | `format-list-checkbox` | To-do | Active |
| Photo | `image-outline` | Photo | Active |
| Contact | `account-card-outline` | Contact | Coming soon (greyed) |
| Property | `home-outline` | Property | Coming soon (greyed) |
| Map pin | `map-marker-outline` | Map | Coming soon (greyed) |
| Goal | `bullseye-arrow` | Goal | Coming soon (greyed) |

- "Coming soon" cells: icon + label at 40% opacity, `bodySmall` "Coming soon" subtitle below in `onSurfaceVariant`.
- Sheet handle bar: standard Paper `BottomSheet` handle or a 36×4pt rounded bar.
- Header: `"Add to your board"` — `titleMedium`, bold. No "Insert widget" language.

---

## 9. Empty Board State

- Center of canvas, no widgets.
- Icon: `draw` (MaterialCommunityIcons), 64pt, `onSurfaceVariant` at 60% opacity.
- Primary text: `"Your board is blank"` — `headlineSmall`, `onSurfaceVariant`.
- Secondary text: `"Tap + to drop a quick note, photo, or to-do."` — `bodyMedium`, `onSurfaceVariant` at 70%.
- Do NOT use the word "widget" in user-facing strings.

---

## 10. Spacing & Touch Targets (summary)

- All interactive elements: **min 44 × 44pt** hit area.
- Base grid: 8pt.
- Sheet/modal inner padding: 16pt sides.
- FAB: 56pt diameter, bottom-right, 16pt margin from safe area bottom + 16pt from right.

---

## 11. Typography (Paper MD3 variants used)

| Use | Paper variant | Notes |
|---|---|---|
| Board name | `titleLarge` | Top bar, truncate 1 line |
| Widget title | `titleSmall` | Checklist only |
| Sticky body | Custom 15/22 | Not a Paper variant |
| Mode pill label | `labelMedium` | + `fontWeight: '700'` |
| Sheet header | `titleMedium` | "Add to your board" |
| Empty state heading | `headlineSmall` | — |
| Empty state sub | `bodyMedium` | — |
| Coming soon label | `bodySmall` | Greyed cells |
