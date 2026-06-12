-- G-NAF multi-dwelling buildings (reference data)
--
-- One row per parent street address that has >= 2 unit/flat addresses
-- registered against it, aggregated from Geoscape G-NAF Core (open licence,
-- quarterly via data.gov.au). Replaces the OSM Overpass building layer as
-- the source of truth for the map's buildings overlay — Overpass servers
-- were flaky and OSM unit counts were guesses (levels * 4); G-NAF unit
-- counts are the registered addresses.
--
-- Loaded by scripts/import-gnaf.ts. Reference data with no team scoping,
-- so no RLS — same precedent as sold history / suburb stats (021).

create table if not exists gnaf_buildings (
  -- md5 of the parent-address group key — stable across quarterly reloads
  id text primary key,
  -- Display-ready street address, e.g. "15 Hornet St"
  address text not null,
  street_name text,
  street_type text,
  number_first text,
  locality text not null,
  postcode text,
  state text not null default 'NSW',
  latitude double precision not null,
  longitude double precision not null,
  unit_count integer not null check (unit_count >= 2),
  unit_numbers text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create index if not exists gnaf_buildings_lat_lng_idx
  on gnaf_buildings (latitude, longitude);
create index if not exists gnaf_buildings_locality_idx
  on gnaf_buildings (lower(locality));

-- Bounding-box lookup for the map buildings layer. Caps rows so a zoomed-out
-- viewport can't pull tens of thousands of buildings; densest buildings first
-- so the cap keeps the most useful ones.
create or replace function gnaf_buildings_in_bbox(
  min_lat double precision,
  min_lng double precision,
  max_lat double precision,
  max_lng double precision,
  max_rows integer default 300
)
returns setof gnaf_buildings
language sql
stable
as $$
  select *
  from gnaf_buildings
  where latitude between min_lat and max_lat
    and longitude between min_lng and max_lng
  order by unit_count desc
  limit max_rows;
$$;
