/**
 * Import ABS 2021 Census suburb statistics into Supabase.
 *
 * Usage:
 *   npx tsx scripts/import-abs-suburbs.ts data/abs/
 *
 * Expected directory structure:
 *   data/abs/
 *     Australian Bureau of Statistics.csv   (SAL code → suburb name lookup)
 *     2021 Census GCP Suburbs and Localities for NSW/
 *       2021Census_G01_NSW_SAL.csv   (population by age)
 *       2021Census_G02_NSW_SAL.csv   (medians: age, income, rent)
 *       2021Census_G34_NSW_SAL.csv   (total dwellings)
 *       2021Census_G36_NSW_SAL.csv   (dwelling structure: houses, units, etc.)
 *
 * Joins G01 (population) + G02 (medians) + G34 (dwelling count) + G36 (dwelling types)
 * using SAL_CODE_2021, then maps SAL code → suburb name via the lookup CSV.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '../packages/api/node_modules/@supabase/supabase-js';

// Load env
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

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase credentials. Check apps/mobile/.env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── CSV Parsing ──────────────────────────────────────────────────────

function parseCSV(filePath: string): Record<string, string>[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  return lines.slice(1).map(line => {
    const fields = line.split(',').map(f => f.replace(/"/g, '').trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = fields[idx] || ''; });
    return row;
  });
}

function toInt(val: string | undefined): number | null {
  if (!val) return null;
  const n = parseInt(val, 10);
  return isNaN(n) ? null : n;
}

function toFloat(val: string | undefined): number | null {
  if (!val) return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const absDir = process.argv[2];
  if (!absDir) {
    console.error('Usage: npx tsx scripts/import-abs-suburbs.ts data/abs/');
    process.exit(1);
  }

  const absPath = path.resolve(absDir);

  // 1. Load SAL code → suburb name lookup
  // Try the extracted lookup first, then fall back to the metadata Excel extraction
  const lookupPath = path.join(absPath, 'sal_code_lookup.csv');
  if (!fs.existsSync(lookupPath)) {
    console.error(`SAL lookup file not found: ${lookupPath}`);
    console.error('Generate it by running: python3 -c "... extract from 2021Census_geog_desc xlsx"');
    console.error('Or download SAL correspondence from ABS website.');
    process.exit(1);
  }

  const lookupRows = parseCSV(lookupPath);
  const salToSuburb = new Map<string, string>();
  for (const row of lookupRows) {
    const code = row['SAL_CODE_2021'] || '';
    let name = row['SAL_NAME_2021'] || '';
    if (code && name) {
      // Strip state suffix like "(NSW)" from name
      name = name.replace(/\s*\(NSW\)\s*$/i, '').trim();
      salToSuburb.set(code, name);
    }
  }
  console.log(`Loaded ${salToSuburb.size} SAL code mappings.`);

  // NSW SAL codes are SAL1xxxx (start with SAL1)
  const nswCodes = new Set<string>();
  for (const [code] of salToSuburb) {
    if (code.startsWith('SAL1')) nswCodes.add(code);
  }
  console.log(`${nswCodes.size} NSW suburb codes.`);

  // 2. Load census tables
  const censusDir = fs.readdirSync(absPath).find(d => d.includes('Suburbs and Localities'));
  if (!censusDir) {
    console.error('Census data directory not found. Expected "2021 Census GCP Suburbs and Localities for NSW/"');
    process.exit(1);
  }
  const dataDir = path.join(absPath, censusDir);

  // G01: Population
  const g01 = parseCSV(path.join(dataDir, '2021Census_G01_NSW_SAL.csv'));
  const popMap = new Map<string, number>();
  for (const row of g01) {
    const code = row['SAL_CODE_2021'];
    const pop = toInt(row['Tot_P_P']); // Total persons
    if (code && pop !== null) popMap.set(code, pop);
  }
  console.log(`G01: ${popMap.size} population records.`);

  // G02: Medians
  const g02 = parseCSV(path.join(dataDir, '2021Census_G02_NSW_SAL.csv'));
  const medianMap = new Map<string, { age: number | null; income: number | null; rent: number | null }>();
  for (const row of g02) {
    const code = row['SAL_CODE_2021'];
    if (!code) continue;
    medianMap.set(code, {
      age: toFloat(row['Median_age_persons']),
      income: toInt(row['Median_tot_hhd_inc_weekly']),
      rent: toInt(row['Median_rent_weekly']),
    });
  }
  console.log(`G02: ${medianMap.size} median records.`);

  // G34: Total dwellings
  const g34 = parseCSV(path.join(dataDir, '2021Census_G34_NSW_SAL.csv'));
  const dwellingCountMap = new Map<string, number>();
  for (const row of g34) {
    const code = row['SAL_CODE_2021'];
    const total = toInt(row['Total_dwelings']); // Note: ABS typo "dwelings"
    if (code && total !== null) dwellingCountMap.set(code, total);
  }
  console.log(`G34: ${dwellingCountMap.size} dwelling count records.`);

  // G36: Dwelling structure
  const g36 = parseCSV(path.join(dataDir, '2021Census_G36_NSW_SAL.csv'));
  const dwellingTypeMap = new Map<string, {
    separateHouses: number | null;
    semiDetached: number | null;
    flatsUnits: number | null;
    other: number | null;
  }>();
  for (const row of g36) {
    const code = row['SAL_CODE_2021'];
    if (!code) continue;
    dwellingTypeMap.set(code, {
      separateHouses: toInt(row['OPDs_Separate_house_Dwellings']),
      semiDetached: toInt(row['OPDs_SD_r_t_h_th_Tot_Dwgs']),
      flatsUnits: toInt(row['OPDs_Flt_apart_Tot_Dwgs']),
      other: toInt(row['OPDs_Other_dwelling_Tot_Dwgs']),
    });
  }
  console.log(`G36: ${dwellingTypeMap.size} dwelling structure records.`);

  // 3. Join and build records
  interface SuburbRecord {
    suburb: string;
    state: string;
    postcode: string | null;
    total_dwellings: number | null;
    separate_houses: number | null;
    semi_detached: number | null;
    flats_units: number | null;
    other_dwellings: number | null;
    population: number | null;
    median_household_income: number | null;
    median_age: number | null;
    median_rent_weekly: number | null;
    census_year: number;
    source: string;
  }

  const records: SuburbRecord[] = [];

  for (const code of nswCodes) {
    const rawName = salToSuburb.get(code);
    if (!rawName) continue;

    // Skip "Migratory", "No usual address", etc.
    if (rawName.includes('Migratory') || rawName.includes('No usual address')) continue;

    // Title case the suburb name
    const suburb = rawName.split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');

    const totalDwellings = dwellingCountMap.get(code) ?? null;
    if (totalDwellings === null || totalDwellings === 0) continue; // Skip empty suburbs

    const types = dwellingTypeMap.get(code);
    const medians = medianMap.get(code);
    const pop = popMap.get(code) ?? null;

    // Convert weekly income to annual for household income
    const weeklyIncome = medians?.income ?? null;
    const annualIncome = weeklyIncome ? weeklyIncome * 52 : null;

    records.push({
      suburb,
      state: 'NSW',
      postcode: null, // ABS doesn't include postcode in SAL data directly
      total_dwellings: totalDwellings,
      separate_houses: types?.separateHouses ?? null,
      semi_detached: types?.semiDetached ?? null,
      flats_units: types?.flatsUnits ?? null,
      other_dwellings: types?.other ?? null,
      population: pop,
      median_household_income: annualIncome,
      median_age: medians?.age ?? null,
      median_rent_weekly: medians?.rent ?? null,
      census_year: 2021,
      source: 'abs',
    });
  }

  console.log(`\nBuilt ${records.length} suburb records.`);

  if (records.length === 0) {
    console.log('Nothing to import.');
    return;
  }

  // 4. Upsert in batches
  const BATCH_SIZE = 200;
  let imported = 0;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from('suburb_stats')
      .upsert(batch, { onConflict: 'suburb,state' })
      .select('id');

    if (error) {
      console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, error.message);
    } else {
      imported += (data?.length || 0);
    }
    process.stdout.write(`\r  Imported ${imported} / ${records.length}`);
  }

  console.log(`\n\nDone. Imported ${imported} of ${records.length} suburb records.`);
}

main().catch(console.error);
