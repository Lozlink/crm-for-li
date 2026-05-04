-- Whiteboard Phase 2 Migration
-- Extends whiteboard_items to support live-bound and Intelligence-derived widgets:
--   contact, property, map, goal, suggestion
-- Adds ref_id for live-bound widgets pointing at a contact / property.

-- Drop the existing CHECK constraint and re-add with the extended type set.
-- Postgres auto-names CHECKs as <table>_<column>_check, so we drop by that name.
alter table whiteboard_items
  drop constraint if exists whiteboard_items_type_check;

alter table whiteboard_items
  add constraint whiteboard_items_type_check
  check (type in ('sticky', 'checklist', 'photo', 'contact', 'property', 'map', 'goal', 'suggestion'));

-- Live-bound widgets reference a row in another table (contacts, properties, ...).
-- No FK so the widget survives if the referenced row is deleted — the widget body
-- renders a tombstone in that case rather than the row being cascade-deleted.
alter table whiteboard_items
  add column if not exists ref_id uuid;

create index if not exists whiteboard_items_ref_id_idx
  on whiteboard_items(ref_id)
  where ref_id is not null;
