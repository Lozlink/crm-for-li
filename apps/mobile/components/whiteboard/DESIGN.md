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

---

## 12. Intelligence Layer — SuggestionCard + IntelligenceSidebar

_Phase 2 · May 2026_

> **CRITICAL copy rules** — enforced across ALL strings in this section:
> - NO "AI", "AI Suggestions", "AI Picks", "Intelligence Center", or similar.
> - Sidebar header: **"For your board"**
> - Sidebar subtitle: **"Smart picks based on your activity"**
> - Toolbar trigger accessibility label: **"Suggestions for your board"**
> - Add CTA: **"Add to board"** (not "Save" / "Add suggestion")
> - Empty state: **"No picks for now. Keep prospecting."**

---

### 12.1 Suggestion Kind Tokens

Four kinds — distinct from the sticky palette so agents immediately read them as
"this card came from the system, not from me." Text on kind chips is derived by
darkening the accent by 50% in light mode; always `#FFFFFF` in dark mode.
Same accent value used in light + dark (these are stripes/chips, not backgrounds).

| Kind | Accent (light & dark) | Icon | CTA label |
|---|---|---|---|
| `hot_prospects` | `#EF4444` | `fire` | "Call now" |
| `coverage_gap` | `#F59E0B` | `map-marker-alert-outline` | "Open map" |
| `today_play` | `#10B981` | `calendar-today` | "View inspection" |
| `route` | `#6366F1` | `map-marker-path` | "Open route" |

---

### 12.2 SuggestionCard (canvas widget)

Default size: **220 × 120pt**

Visual anatomy (left → right, top → bottom):
```
┌─────────────────────────────────────────────┐
│▍ [icon 13pt] Kind label (labelSmall, bold)   │  ← 4pt left stripe + tinted pill
│  Title text (titleSmall, 600 weight, 1 line) │
│  Body text (bodySmall, 2 lines max, 15pt lh) │  ← stored as content.body
│                                               │
│  Tap to view          [Call now →]           │  ← footer: hint + kind CTA Pressable
└─────────────────────────────────────────────┘
```

- Background: `theme.colors.surface` (neutral — not coloured like a sticky)
- Left stripe: 4pt `borderLeftWidth`, kind accent (BaseWidget convention §4)
- Kind badge: pill `borderRadius 6`, `accentColor + '22'` bg, `accentColor × 0.55` text (light), `#FFFFFF` (dark)
- Border: `hairlineWidth`, `theme.colors.outlineVariant`
- Corner radius: **12pt**
- Shadow: `shadowOpacity 0.07`, `shadowRadius 3`, `elevation 2` — softer than a sticky
- Footer CTA: `Pressable`, `accentColor + '22'` bg, deepens on press. Calls kind-specific route.
- Footer hint: "Tap to view" — `labelSmall`, 50% opacity, left-aligned
- Read-only: no inline editing. Tap in **Edit mode** activates footer CTA → deep link.
- Move mode tap: bring-to-front (consistent with all widgets). CTA not fired.
- Delete affordance: same as all widgets (× top-right, Edit mode only — §4)
- Drag/reposition: same as all widgets (Move mode pan gesture — §4)

**Content field names** (from `WhiteboardSuggestionContent` in `@realestate-crm/types`):
- `title` — card heading
- `body` — subtitle line (projected from `SmartSuggestion.subtitle` at "Add to board" time)
- `payload` — `Record<string, unknown>`, forwarded from `SmartSuggestion.payload` for deep links

---

### 12.3 IntelligenceSidebar (slide-in panel)

Width: `min(300, 84% screen width)` — fixed panel, not a bottom sheet.
Slides in from the **right edge** using `withSpring({ mass: 0.6, damping: 20, stiffness: 200 })`.
Backdrop behind panel: `backgroundColor: '#000'` at **40% opacity**, fades in 180ms.
Tap backdrop or press × to close.

```
┌─────────────────────────────┐
│ For your board      [close] │  ← titleMedium 700
│ Smart picks based on your   │  ← bodySmall, onSurfaceVariant
│ activity                    │
├─────────────────────────────┤
│ ┌─────────────────────────┐ │
│ │▍ [chip: Follow up]      │ │  ← 4pt left stripe, kind-coloured chip
│ │  Title text             │ │  ← titleSmall 600, 2 lines
│ │  Body text (3 lines)    │ │  ← bodySmall
│ │              [Add to board]  ← Button mode="text", compact, icon=plus-circle-outline
│ └─────────────────────────┘ │
│  ... more rows ...           │
│                              │
│  (empty state)               │
│  💡  No picks for now.      │  ← lightbulb-on-outline 44pt, opacity 45%
│     Keep prospecting.        │  ← bodyMedium 600 + bodySmall
└─────────────────────────────┘
```

**Header:**
- Title: `"For your board"` — `titleMedium`, `fontWeight: '700'`
- Subtitle: `"Smart picks based on your activity"` — `bodySmall`, `onSurfaceVariant`
- Close: `close` icon (22pt), 44×44pt touch target, top-right

**Suggestion row:**
- Kind chip: rounded pill, `borderRadius: 6`, accent bg at 33% opacity
- Title: `titleSmall`, `fontWeight: '600'`, 2 lines
- Body: `bodySmall`, `lineHeight: 16`, up to 3 lines, `onSurfaceVariant`
- "Add to board" button: `Button mode="text" compact`, right-aligned, icon `plus-circle-outline`
- Row container: `borderLeftWidth: 4` (kind accent), `borderRadius: 10`, `surfaceVariant` bg at 27%

**Empty state:**
- Icon: `lightbulb-on-outline`, 44pt, `onSurfaceVariant` at 45% opacity
- Primary: `"No picks for now."` — `bodyMedium`, `fontWeight: '600'`
- Secondary: `"Keep prospecting."` — `bodySmall`, 70% opacity
- Vertically centered in remaining space

---

### 12.4 Toolbar trigger

Position: **rightmost button** in the toolbar bar (right of the Add `plus-circle` button).
Icon: `lightbulb-on-outline`, 24pt, `onSurfaceVariant` color.
Always enabled (visible in both Move and Edit mode).
Accessibility label: **"Suggestions for your board"** (required — no "AI" language).

Toolbar layout (left → right):
```
[close 48pt] ─── [mode pill flex:1] ─── [+ add 48pt] [💡 suggestions 48pt]
```

---

### 12.5 Handoff notes for mobile-dev / ai-engineer

- **mobile-dev**: add `'suggestion'` to `WhiteboardItemType` in `@realestate-crm/types`; remove
  `as unknown as` casts in `whiteboard.tsx` and `WhiteboardItemView.tsx` once landed.
- **ai-engineer**: export real `SmartSuggestion` from `useSmartSuggestions`; replace the
  provisional type stub in `types.ts` + swap `suggestions={[]}` in `whiteboard.tsx`
  with the real hook call.
- `SuggestionCard` is already fully renderable — it reads from `WhiteboardSuggestionContent`
  which is populated at "Add to board" time. No further changes to the card needed
  after the hook lands.
