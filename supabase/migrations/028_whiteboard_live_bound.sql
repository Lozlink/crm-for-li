-- Whiteboard Phase 2 — Live-bound widgets + Intelligence suggestions.
--
-- Phase 1 (migration 027) shipped sticky / checklist / photo. Phase 2 adds:
--   - contact, property, map, goal  → live-bound widgets that render from
--     source-of-truth stores via `ref_id` instead of caching content locally.
--   - suggestion                    → Intelligence-surfaced cards (separate
--     hook owns the lifecycle; whiteboard just renders + persists state).
--
-- Design notes:
--   * `ref_id` is intentionally not a foreign key. A single column has to
--     point at multiple parent tables (contacts, properties, suburb_stats,
--     goal records, etc.) and the row-level `type` discriminator picks the
--     target table at read time. Orphaned rows are pruned by app-level
--     reconciliation, not DB cascade.
--   * The CHECK constraint is dropped + re-added by name so existing
--     'sticky' | 'checklist' | 'photo' rows pass through unchanged.
--   * Index on (team_id, ref_id) is partial — only live-bound widgets
--     populate ref_id, and ~90% of rows will be plain notes that never
--     hit this lookup path.

-- 1. Drop the existing CHECK so we can extend the type enum.
alter table whiteboard_items
  drop constraint if exists whiteboard_items_type_check;

-- 2. Re-add with the Phase 2 set.
alter table whiteboard_items
  add constraint whiteboard_items_type_check
  check (type in (
    'sticky',
    'checklist',
    'photo',
    'contact',
    'property',
    'map',
    'goal',
    'suggestion'
  ));

-- 3. Optional pointer for live-bound widgets.
--    For 'contact' → contacts.id, 'property' → properties.id,
--    'goal' → (future goals table) or null for inline goals,
--    'map' → properties.id when pinned to a property, otherwise null,
--    'suggestion' → the entity the suggestion is about (any of the above).
alter table whiteboard_items
  add column if not exists ref_id uuid;

-- 4. Partial index — only live-bound rows ever query by ref_id.
create index if not exists whiteboard_items_team_ref_idx
  on whiteboard_items (team_id, ref_id)
  where ref_id is not null;

-- RLS policies from 027 already cover the new rows (team_id-based).
-- No additional grants required.
