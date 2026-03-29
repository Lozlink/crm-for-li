/**
 * Import NSW Valuer General Property Sales DAT files into Supabase.
 *
 * Usage:
 *   npx tsx scripts/import-nsw-vg.ts <directory-or-dat-file>
 *
 * Examples:
 *   npx tsx scripts/import-nsw-vg.ts data/nsw-vg/20250707/          # one week
 *   npx tsx scripts/import-nsw-vg.ts data/nsw-vg/                   # all weeks
 *   npx tsx scripts/import-nsw-vg.ts data/nsw-vg/20250707/010_SALES_DATA_NNME_07072025.DAT  # one file
 *
 * VG DAT format (semicolon-delimited):
 *   A-record: header
 *   B-record: sale data (the one we want)1
 *   C-record: strata info
 *   D-record: property description
 *
 * B-record fields (semicolon separated):
 *   0:  RecordType (B)
 *   1:  DistrictCode
 *   2:  PropertyId
 *   3:  SaleCounter
 *   4:  DownloadDateTime
 *   5:  PropertyName
 *   6:  UnitNumber
 *   7:  HouseNumber
 *   8:  StreetName
 *   9:  Suburb
 *   10: PostCode
 *   11: Area
 *   12: AreaType (M=sqm, H=hectares)
 *   13: ContractDate (YYYYMMDD)
 *   14: SettlementDate (YYYYMMDD)
 *   15: PurchasePrice
 *   16: ZoneCode
 *   17: NatureOfProperty (R=Residential, V=Vacant, C=Commercial, etc.)
 *   18: PrimaryPurpose
 *   19: StrataLotNumber
 *   20: ComponentCode
 *   21: SaleCode
 *   22: PercentInterest
 *   23: DealingNumber
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '../packages/api/node_modules/@supabase/supabase-js';

// Load env from mobile app's .env
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

// ── Parsing ──────────────────────────────────────────────────────────

interface SoldRecord {
  address: string;
  suburb: string;
  postcode: string;
  state: string;
  property_type: string;
  sale_price: number | null;
  sale_date: string | null;
  settlement_date: string | null;
  area_sqm: number | null;
  source: string;
  raw_data: Record<string, string>;
}

function parseDate(yyyymmdd: string): string | null {
  if (!yyyymmdd || yyyymmdd.length !== 8) return null;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function guessPropertyType(nature: string, purpose: string, strataLot: string, unitNum: string): string {
  if (strataLot || unitNum) return 'unit';
  const p = purpose.toLowerCase();
  if (p.includes('vacant') || nature === 'V') return 'land';
  if (p.includes('commercial') || nature === 'C') return 'commercial';
  if (p.includes('residence') || nature === 'R') return 'house';
  return 'other';
}

function parseBRecord(line: string): SoldRecord | null {
  const fields = line.split(';');
  if (fields[0] !== 'B') return null;

  const unitNum = (fields[6] || '').trim();
  const houseNum = (fields[7] || '').trim();
  const street = (fields[8] || '').trim();
  const suburb = (fields[9] || '').trim();
  const postcode = (fields[10] || '').trim();
  const area = (fields[11] || '').trim();
  const areaType = (fields[12] || '').trim();
  const contractDate = (fields[13] || '').trim();
  const settlementDate = (fields[14] || '').trim();
  const priceStr = (fields[15] || '').trim();
  const nature = (fields[17] || '').trim();
  const purpose = (fields[18] || '').trim();
  const strataLot = (fields[19] || '').trim();

  if (!suburb || !street) return null;

  const price = priceStr ? parseInt(priceStr, 10) : null;
  if (price !== null && price < 10000) return null; // Skip non-market transfers

  // Build address
  const addrParts: string[] = [];
  if (unitNum) addrParts.push(`${unitNum}/`);
  if (houseNum) addrParts.push(houseNum);
  addrParts.push(street);
  const address = addrParts.join(' ').replace(/\/ /, '/');

  // Convert area to sqm
  let areaSqm: number | null = null;
  if (area) {
    const areaNum = parseFloat(area);
    if (!isNaN(areaNum)) {
      areaSqm = areaType === 'H' ? areaNum * 10000 : areaNum;
    }
  }

  // Title case suburb
  const suburbFormatted = suburb.split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  return {
    address,
    suburb: suburbFormatted,
    postcode,
    state: 'NSW',
    property_type: guessPropertyType(nature, purpose, strataLot, unitNum),
    sale_price: price,
    sale_date: parseDate(contractDate),
    settlement_date: parseDate(settlementDate),
    area_sqm: areaSqm,
    source: 'nsw_vg',
    raw_data: {
      district: fields[1] || '',
      property_id: fields[2] || '',
      nature,
      purpose,
      zone: (fields[16] || '').trim(),
      strata_lot: strataLot,
      dealing: (fields[23] || '').trim(),
    },
  };
}

function parseDATFile(filePath: string): SoldRecord[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const records: SoldRecord[] = [];

  for (const line of content.split('\n')) {
    if (!line.startsWith('B;')) continue;
    const record = parseBRecord(line);
    if (record) records.push(record);
  }

  return records;
}

// ── File discovery ───────────────────────────────────────────────────

function findDATFiles(inputPath: string): string[] {
  const stat = fs.statSync(inputPath);

  if (stat.isFile() && inputPath.endsWith('.DAT')) {
    return [inputPath];
  }

  if (stat.isDirectory()) {
    const files: string[] = [];
    const entries = fs.readdirSync(inputPath, { withFileTypes: true });

    for (const entry of entries) {
      const full = path.join(inputPath, entry.name);
      if (entry.isFile() && entry.name.endsWith('.DAT')) {
        files.push(full);
      } else if (entry.isDirectory()) {
        files.push(...findDATFiles(full));
      }
    }
    return files;
  }

  return [];
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Usage: npx tsx scripts/import-nsw-vg.ts <directory-or-dat-file>');
    process.exit(1);
  }

  const absPath = path.resolve(inputPath);
  if (!fs.existsSync(absPath)) {
    console.error(`Not found: ${absPath}`);
    process.exit(1);
  }

  const datFiles = findDATFiles(absPath);
  console.log(`Found ${datFiles.length} DAT files.`);

  let allRecords: SoldRecord[] = [];
  for (const file of datFiles) {
    const records = parseDATFile(file);
    allRecords.push(...records);
  }

  // Deduplicate by property_id + sale_date
  const seen = new Set<string>();
  allRecords = allRecords.filter(r => {
    const key = `${r.address}|${r.suburb}|${r.sale_date}|${r.sale_price}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`${allRecords.length} unique sale records after dedup.`);

  if (allRecords.length === 0) {
    console.log('Nothing to import.');
    return;
  }

  // Insert in batches
  const BATCH_SIZE = 500;
  let imported = 0;

  for (let i = 0; i < allRecords.length; i += BATCH_SIZE) {
    const batch = allRecords.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from('sold_history')
      .insert(batch)
      .select('id');

    if (error) {
      console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, error.message);
    } else {
      imported += (data?.length || 0);
    }
    process.stdout.write(`\r  Imported ${imported} / ${allRecords.length}`);
  }

  console.log(`\n\nDone. Imported ${imported} of ${allRecords.length} records.`);
}

main().catch(console.error);
