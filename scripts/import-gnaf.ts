/**
 * Import multi-dwelling buildings from Geoscape G-NAF into Supabase.
 *
 * Aggregates unit/flat addresses by their parent street address and loads
 * one row per building (>= min-units registered units) into gnaf_buildings.
 * This feeds the map's buildings layer with real unit counts, replacing the
 * OSM Overpass layer (flaky servers, guessed unit counts).
 *
 * Supports BOTH free Geoscape products from data.gov.au:
 *
 *  1. Full G-NAF (multi-table PSV) — pass the extract directory; the script
 *     finds <STATE>_ADDRESS_DETAIL_psv.psv etc. and joins:
 *       ADDRESS_DETAIL -> STREET_LOCALITY -> LOCALITY -> ADDRESS_DEFAULT_GEOCODE
 *  2. G-NAF Core (single PSV) — pass the GNAF_CORE.psv file directly.
 *
 * Usage:
 *   npx tsx scripts/import-gnaf.ts <dir-or-psv> [--state NSW] [--min-units 2] [--dry-run]
 *
 * Examples:
 *   npx tsx scripts/import-gnaf.ts data/g-naf_may26_allstates_gda2020_psv_1023   # full G-NAF
 *   npx tsx scripts/import-gnaf.ts data/gnaf/GNAF_CORE.psv                       # G-NAF Core
 *   npx tsx scripts/import-gnaf.ts data/g-naf_may26_allstates_gda2020_psv_1023 --dry-run
 *
 * Files are streamed line-by-line; only unit addresses and per-building
 * aggregates are held in memory (NSW ≈ 1.5M unit addresses — if node OOMs,
 * run with NODE_OPTIONS=--max-old-space-size=4096).
 * Columns are resolved by header name, so quarterly column reordering won't
 * silently corrupt the import — missing expected columns fail loudly.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { createHash } from 'crypto';
import { createClient } from '../packages/api/node_modules/@supabase/supabase-js';

// ── Env (same convention as import-nsw-vg.ts) ────────────────────────

const envPath = path.resolve(__dirname, '../apps/mobile/.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// ── CLI args ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const inputArg = args.find(a => !a.startsWith('--'));
const stateFilter = (readFlag('--state') || 'NSW').toUpperCase();
const minUnits = parseInt(readFlag('--min-units') || '2', 10);
const dryRun = args.includes('--dry-run');

function readFlag(name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : undefined;
}

if (!inputArg) {
  console.error('Usage: npx tsx scripts/import-gnaf.ts <gnaf-dir-or-GNAF_CORE.psv> [--state NSW] [--min-units 2] [--dry-run]');
  process.exit(1);
}
if (!dryRun && (!SUPABASE_URL || !SUPABASE_KEY)) {
  console.error('Missing Supabase credentials. Check apps/mobile/.env (or use --dry-run).');
  process.exit(1);
}

// ── Formatting helpers ───────────────────────────────────────────────

/** "HORNET" → "Hornet"; handles multi-word and hyphenated names. */
function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s-])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());
}

/** G-NAF street types are full uppercase words; contacts store Google-style
 *  abbreviations ("Hornet St"), so abbreviate the common ones to match. */
const STREET_TYPE_ABBREV: Record<string, string> = {
  STREET: 'St',
  ROAD: 'Rd',
  AVENUE: 'Ave',
  DRIVE: 'Dr',
  COURT: 'Ct',
  PLACE: 'Pl',
  CRESCENT: 'Cres',
  PARADE: 'Pde',
  BOULEVARD: 'Blvd',
  BOULEVARDE: 'Blvd',
  HIGHWAY: 'Hwy',
  TERRACE: 'Tce',
  CIRCUIT: 'Cct',
  LANE: 'Ln',
  GROVE: 'Gr',
  CLOSE: 'Cl',
  WAY: 'Way',
  ESPLANADE: 'Esp',
  SQUARE: 'Sq',
};

function formatStreetType(raw: string): string {
  if (!raw) return '';
  return STREET_TYPE_ABBREV[raw.toUpperCase()] ?? titleCase(raw);
}

/** Natural sort for unit numbers: 1, 2, 10, 10A, G01... */
function naturalUnitSort(a: string, b: string): number {
  const na = parseInt(a, 10);
  const nb = parseInt(b, 10);
  if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
  return a.localeCompare(b, undefined, { numeric: true });
}

// ── PSV streaming ────────────────────────────────────────────────────

/** Stream a PSV file, resolving columns by (uppercased) header name.
 *  Calls onRow with a field-getter. Fails loudly if required columns
 *  are missing — quarterly releases occasionally reorder columns. */
async function streamPsv(
  filePath: string,
  required: string[],
  onRow: (get: (col: string) => string) => void,
  label?: string,
): Promise<number> {
  const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let col: Record<string, number> | null = null;
  let lineNo = 0;

  for await (const line of rl) {
    lineNo++;
    if (!col) {
      const header = line.replace(/^﻿/, '').split('|').map(h => h.trim().toUpperCase());
      col = Object.fromEntries(header.map((h, i) => [h, i]));
      const missing = required.filter(r => col![r] === undefined);
      if (missing.length > 0) {
        console.error(`${path.basename(filePath)}: missing expected columns: ${missing.join(', ')}`);
        console.error(`Available columns: ${header.join(', ')}`);
        process.exit(1);
      }
      continue;
    }
    if (!line) continue;
    const f = line.split('|');
    const c = col;
    onRow((name: string) => (f[c[name]] ?? '').trim());

    if (label && lineNo % 1_000_000 === 0) {
      console.log(`  ...${label}: ${(lineNo / 1_000_000).toFixed(0)}M lines`);
    }
  }
  return lineNo;
}

// ── Aggregation (shared by both modes) ───────────────────────────────

interface BuildingAgg {
  units: Set<string>;
  latSum: number;
  lngSum: number;
  n: number;
  numberFirst: string;
  streetName: string;
  streetType: string;
  locality: string;
  postcode: string;
  state: string;
}

interface BuildingRow {
  id: string;
  address: string;
  street_name: string;
  street_type: string;
  number_first: string;
  locality: string;
  postcode: string;
  state: string;
  latitude: number;
  longitude: number;
  unit_count: number;
  unit_numbers: string[];
}

const buildings = new Map<string, BuildingAgg>();

function addUnit(entry: {
  flatNumber: string;
  numberFirst: string;
  streetName: string;
  streetType: string;
  locality: string;
  postcode: string;
  state: string;
  lat: number;
  lng: number;
}) {
  // A group key with an empty street number would lump every unnumbered unit
  // on the street into one phantom mega-building — require both.
  if (!entry.flatNumber || !entry.numberFirst || !entry.streetName || !entry.locality) return;
  if (isNaN(entry.lat) || isNaN(entry.lng)) return;

  const key = [entry.numberFirst, entry.streetName, entry.streetType, entry.locality, entry.postcode]
    .join('|')
    .toUpperCase();

  const existing = buildings.get(key);
  if (existing) {
    existing.units.add(entry.flatNumber);
    existing.latSum += entry.lat;
    existing.lngSum += entry.lng;
    existing.n++;
  } else {
    buildings.set(key, {
      units: new Set([entry.flatNumber]),
      latSum: entry.lat,
      lngSum: entry.lng,
      n: 1,
      numberFirst: entry.numberFirst,
      streetName: entry.streetName,
      streetType: entry.streetType,
      locality: entry.locality,
      postcode: entry.postcode,
      state: entry.state,
    });
  }
}

function toRows(): BuildingRow[] {
  const rows: BuildingRow[] = [];
  for (const [key, b] of buildings) {
    if (b.units.size < minUnits) continue;

    const streetDisplay = [titleCase(b.streetName), formatStreetType(b.streetType)]
      .filter(Boolean)
      .join(' ');
    const address = [b.numberFirst, streetDisplay].filter(Boolean).join(' ');

    rows.push({
      id: createHash('md5').update(key).digest('hex'),
      address,
      street_name: titleCase(b.streetName),
      street_type: formatStreetType(b.streetType),
      number_first: b.numberFirst,
      locality: titleCase(b.locality),
      postcode: b.postcode,
      state: b.state,
      latitude: b.latSum / b.n,
      longitude: b.lngSum / b.n,
      unit_count: b.units.size,
      unit_numbers: [...b.units].sort(naturalUnitSort),
    });
  }
  return rows;
}

// ── Mode 1: G-NAF Core (single denormalised PSV) ─────────────────────

async function parseCore(filePath: string) {
  console.log('Mode: G-NAF Core (single PSV)');
  const lines = await streamPsv(
    filePath,
    ['FLAT_NUMBER', 'NUMBER_FIRST', 'STREET_NAME', 'STREET_TYPE', 'LOCALITY_NAME', 'STATE', 'POSTCODE', 'LATITUDE', 'LONGITUDE'],
    (get) => {
      const state = get('STATE').toUpperCase();
      if (stateFilter !== 'ALL' && state !== stateFilter) return;
      addUnit({
        flatNumber: get('FLAT_NUMBER'),
        numberFirst: get('NUMBER_FIRST'),
        streetName: get('STREET_NAME'),
        streetType: get('STREET_TYPE'),
        locality: get('LOCALITY_NAME'),
        postcode: get('POSTCODE'),
        state,
        lat: parseFloat(get('LATITUDE')),
        lng: parseFloat(get('LONGITUDE')),
      });
    },
    'GNAF_CORE',
  );
  console.log(`Parsed ${lines.toLocaleString()} lines.`);
}

// ── Mode 2: Full G-NAF (multi-table PSV directory) ───────────────────

/** Find <STATE>_ADDRESS_DETAIL_psv.psv at any depth under root (the zip
 *  extracts to "G-NAF/G-NAF <MONTH> <YEAR>/Standard/"). */
function findStandardDir(root: string, state: string): string | null {
  const target = `${state}_ADDRESS_DETAIL_psv.psv`;
  const queue = [root];
  let depth = 0;
  while (queue.length > 0 && depth < 6) {
    const next: string[] = [];
    for (const dir of queue) {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      if (entries.some(e => e.isFile() && e.name === target)) return dir;
      for (const e of entries) {
        if (e.isDirectory()) next.push(path.join(dir, e.name));
      }
    }
    queue.length = 0;
    queue.push(...next);
    depth++;
  }
  return null;
}

interface UnitAddress {
  flat: string;
  numberFirst: string;
  streetLocalityPid: string;
  localityPid: string;
  postcode: string;
}

async function parseFullGnaf(rootDir: string) {
  console.log('Mode: full G-NAF (multi-table)');
  if (stateFilter === 'ALL') {
    console.error('Full G-NAF mode imports one state at a time — pass --state NSW (etc).');
    process.exit(1);
  }

  const std = findStandardDir(rootDir, stateFilter);
  if (!std) {
    console.error(`Could not find ${stateFilter}_ADDRESS_DETAIL_psv.psv under ${rootDir}`);
    process.exit(1);
  }
  console.log(`Standard dir: ${std}`);
  const file = (name: string) => path.join(std, `${stateFilter}_${name}_psv.psv`);

  // 1. LOCALITY: pid -> name (small)
  const localities = new Map<string, string>();
  await streamPsv(file('LOCALITY'), ['LOCALITY_PID', 'LOCALITY_NAME', 'DATE_RETIRED'], (get) => {
    if (get('DATE_RETIRED')) return;
    localities.set(get('LOCALITY_PID'), get('LOCALITY_NAME'));
  });
  console.log(`  localities: ${localities.size.toLocaleString()}`);

  // 2. STREET_LOCALITY: pid -> street name/type (small)
  const streets = new Map<string, { name: string; type: string }>();
  await streamPsv(
    file('STREET_LOCALITY'),
    ['STREET_LOCALITY_PID', 'STREET_NAME', 'STREET_TYPE_CODE', 'DATE_RETIRED'],
    (get) => {
      if (get('DATE_RETIRED')) return;
      streets.set(get('STREET_LOCALITY_PID'), {
        name: get('STREET_NAME'),
        type: get('STREET_TYPE_CODE'),
      });
    },
  );
  console.log(`  streets: ${streets.size.toLocaleString()}`);

  // 3. ADDRESS_DETAIL: keep only live, principal unit addresses (flat number
  //    present). NSW ≈ 1.5M entries held in memory.
  const unitAddresses = new Map<string, UnitAddress>();
  const detailLines = await streamPsv(
    file('ADDRESS_DETAIL'),
    [
      'ADDRESS_DETAIL_PID', 'DATE_RETIRED', 'FLAT_NUMBER_PREFIX', 'FLAT_NUMBER', 'FLAT_NUMBER_SUFFIX',
      'NUMBER_FIRST_PREFIX', 'NUMBER_FIRST', 'NUMBER_FIRST_SUFFIX', 'NUMBER_LAST',
      'STREET_LOCALITY_PID', 'LOCALITY_PID', 'POSTCODE', 'ALIAS_PRINCIPAL',
    ],
    (get) => {
      if (get('DATE_RETIRED')) return;
      // 'A' rows are alias spellings of another address — counting them
      // would double-count units.
      if (get('ALIAS_PRINCIPAL') === 'A') return;

      const flat = [get('FLAT_NUMBER_PREFIX'), get('FLAT_NUMBER'), get('FLAT_NUMBER_SUFFIX')]
        .filter(Boolean)
        .join('');
      if (!flat) return;

      const first = [get('NUMBER_FIRST_PREFIX'), get('NUMBER_FIRST'), get('NUMBER_FIRST_SUFFIX')]
        .filter(Boolean)
        .join('');
      const last = get('NUMBER_LAST');
      const numberFirst = last ? `${first}-${last}` : first;
      if (!numberFirst) return;

      unitAddresses.set(get('ADDRESS_DETAIL_PID'), {
        flat,
        numberFirst,
        streetLocalityPid: get('STREET_LOCALITY_PID'),
        localityPid: get('LOCALITY_PID'),
        postcode: get('POSTCODE'),
      });
    },
    'ADDRESS_DETAIL',
  );
  console.log(`  address detail: ${detailLines.toLocaleString()} lines, ${unitAddresses.size.toLocaleString()} live unit addresses`);

  // 4. ADDRESS_DEFAULT_GEOCODE: attach coords and aggregate. Entries are
  //    deleted as consumed so memory shrinks as we go.
  let joined = 0;
  await streamPsv(
    file('ADDRESS_DEFAULT_GEOCODE'),
    ['ADDRESS_DETAIL_PID', 'LATITUDE', 'LONGITUDE', 'DATE_RETIRED'],
    (get) => {
      if (get('DATE_RETIRED')) return;
      const pid = get('ADDRESS_DETAIL_PID');
      const unit = unitAddresses.get(pid);
      if (!unit) return;
      unitAddresses.delete(pid);

      const street = streets.get(unit.streetLocalityPid);
      const locality = localities.get(unit.localityPid);
      if (!street || !locality) return;

      joined++;
      addUnit({
        flatNumber: unit.flat,
        numberFirst: unit.numberFirst,
        streetName: street.name,
        streetType: street.type,
        locality,
        postcode: unit.postcode,
        state: stateFilter,
        lat: parseFloat(get('LATITUDE')),
        lng: parseFloat(get('LONGITUDE')),
      });
    },
    'ADDRESS_DEFAULT_GEOCODE',
  );
  console.log(`  geocoded + joined: ${joined.toLocaleString()} unit addresses (${unitAddresses.size.toLocaleString()} had no live geocode)`);
}

// ── Upload ───────────────────────────────────────────────────────────

async function upload(rows: BuildingRow[]) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const BATCH = 500;
  let uploaded = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase
      .from('gnaf_buildings')
      .upsert(batch, { onConflict: 'id' });

    if (error) {
      console.error(`Batch ${i / BATCH + 1} failed:`, error.message);
      process.exit(1);
    }
    uploaded += batch.length;
    if (uploaded % 10_000 < BATCH) {
      console.log(`  uploaded ${uploaded.toLocaleString()} / ${rows.length.toLocaleString()}`);
    }
  }
  console.log(`Done: ${uploaded.toLocaleString()} buildings upserted.`);
}

// ── Main ─────────────────────────────────────────────────────────────

(async () => {
  const inputPath = path.resolve(inputArg);
  if (!fs.existsSync(inputPath)) {
    console.error(`Not found: ${inputPath}`);
    process.exit(1);
  }

  console.log(`Importing G-NAF from ${inputPath}`);
  console.log(`  state=${stateFilter} min-units=${minUnits}${dryRun ? ' (dry run)' : ''}`);

  if (fs.statSync(inputPath).isDirectory()) {
    await parseFullGnaf(inputPath);
  } else {
    await parseCore(inputPath);
  }

  const rows = toRows();
  console.log(`${rows.length.toLocaleString()} buildings with >= ${minUnits} units.`);

  if (rows.length > 0) {
    const top = [...rows].sort((a, b) => b.unit_count - a.unit_count).slice(0, 5);
    console.log('Largest:');
    for (const r of top) {
      console.log(`  ${r.address}, ${r.locality} ${r.postcode} — ${r.unit_count} units`);
    }
  }

  if (dryRun) {
    console.log('Dry run — nothing written.');
    return;
  }

  await upload(rows);
})();
