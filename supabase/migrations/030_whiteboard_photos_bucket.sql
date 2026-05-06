-- Migration 030: create Supabase Storage bucket for whiteboard photo widgets.
--
-- The `whiteboard-photos` bucket must be public-read so that
-- `getPublicUrl()` returns a URL that unauthenticated Image fetches
-- can load (the widget canvas renders without bearer tokens).
--
-- Without this migration the upload call returns a 404 (bucket not found),
-- `uploadPhoto()` returns null, and the photo widget shows "Upload failed".
--
-- APPLY: run via Supabase dashboard → SQL Editor, or `supabase db push`.

insert into storage.buckets (id, name, public)
values ('whiteboard-photos', 'whiteboard-photos', true)
on conflict (id) do nothing;

-- Allow authenticated users to upload to their own team's sub-path.
-- Path convention: `whiteboard-photos/<timestamp>-<random>.<ext>`
-- (no per-team sub-folder for now — teams are isolated by RLS on whiteboard_items).

create policy "Authenticated users can upload whiteboard photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'whiteboard-photos');

create policy "Public read for whiteboard photos"
  on storage.objects for select
  to public
  using (bucket_id = 'whiteboard-photos');

create policy "Owners can delete their whiteboard photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'whiteboard-photos' and auth.uid() = owner);
