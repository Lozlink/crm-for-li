/**
 * Validation utilities for forms
 */

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isValidPhone(phone: string): boolean {
  // Basic phone validation - at least 10 digits
  const phoneRegex = /\d{10,}/;
  return phoneRegex.test(phone.replace(/\D/g, ''));
}

export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function isNonEmptyString(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function formatPhone(phone: string): string {
  // Simple phone formatting - remove non-digits and add spacing
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
}

/**
 * Normalize a phone number: strip non-digits, take last 10 digits.
 * Handles country codes (e.g., +61 or +1).
 */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.slice(-10);
}

export interface DedupContact {
  first_name: string;
  last_name?: string;
  phone?: string;
  email?: string;
}

/**
 * Check if an incoming contact is a duplicate of an existing one.
 * Matches on normalized phone OR exact lowercase first+last name.
 */
export function isDuplicateContact(incoming: DedupContact, existing: DedupContact): boolean {
  // Match on normalized phone
  if (incoming.phone && existing.phone) {
    const inPhone = normalizePhone(incoming.phone);
    const exPhone = normalizePhone(existing.phone);
    if (inPhone.length >= 10 && inPhone === exPhone) return true;
  }

  // Match on case-insensitive email
  if (incoming.email && existing.email) {
    if (incoming.email.toLowerCase().trim() === existing.email.toLowerCase().trim()) return true;
  }

  // Match on exact lowercase first+last name
  const inFirst = incoming.first_name.toLowerCase().trim();
  const exFirst = existing.first_name.toLowerCase().trim();
  const inLast = (incoming.last_name || '').toLowerCase().trim();
  const exLast = (existing.last_name || '').toLowerCase().trim();

  if (inFirst && inFirst === exFirst && inLast === exLast) return true;

  return false;
}

/**
 * Find duplicates between a list of incoming contacts and existing contacts.
 * Returns a Map where key = incoming index, value = matching existing contact.
 */
export function findDuplicates<T extends DedupContact>(
  incoming: DedupContact[],
  existing: T[],
): Map<number, T> {
  const dupes = new Map<number, T>();
  for (let i = 0; i < incoming.length; i++) {
    for (const ex of existing) {
      if (isDuplicateContact(incoming[i], ex)) {
        dupes.set(i, ex);
        break;
      }
    }
  }
  return dupes;
}

/**
 * Find a single duplicate for an incoming contact from a list of existing contacts.
 * Returns the first match or null.
 */
export function findSingleDuplicate<T extends DedupContact>(
  incoming: DedupContact,
  existing: T[],
): T | null {
  for (const ex of existing) {
    if (isDuplicateContact(incoming, ex)) return ex;
  }
  return null;
}

// --- Address Normalization ---

const STREET_TYPE_MAP: Record<string, string> = {
  st: 'st',
  street: 'st',
  rd: 'rd',
  road: 'rd',
  dr: 'dr',
  drive: 'dr',
  ave: 'ave',
  avenue: 'ave',
  ln: 'ln',
  lane: 'ln',
  way: 'way',
  ct: 'ct',
  court: 'ct',
  cres: 'cres',
  crescent: 'cres',
  pl: 'pl',
  place: 'pl',
  blvd: 'blvd',
  boulevard: 'blvd',
  pde: 'pde',
  parade: 'pde',
  cct: 'cct',
  circuit: 'cct',
  cl: 'cl',
  close: 'cl',
  tce: 'tce',
  terrace: 'tce',
  hwy: 'hwy',
  highway: 'hwy',
  gr: 'gr',
  grove: 'gr',
  sq: 'sq',
  square: 'sq',
  pkwy: 'pkwy',
  parkway: 'pkwy',
  esp: 'esp',
  esplanade: 'esp',
};

/**
 * Normalize an address string for fuzzy matching.
 * Lowercases, removes unit prefixes (Unit/Apt/Suite/#), normalizes street type abbreviations.
 */
export function normalizeAddress(address: string): string {
  let s = address.toLowerCase().trim();

  // Strip unit prefixes: "unit 3 ", "apt 2b ", "suite 4 ", "#5 "
  s = s.replace(/^(unit|apt|apartment|suite|#)\s*[\w/]+[,\s]+/i, '');
  // Strip inline unit prefixes like "3/45" -> "45"
  s = s.replace(/^\d+\s*\/\s*/, '');

  // Normalize extra whitespace and commas
  s = s.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();

  // Normalize street type tokens
  s = s.replace(/\b(\w+)\b/g, (token) => STREET_TYPE_MAP[token] ?? token);

  return s;
}

// --- Smart Contact Name Parsing ---

export interface ParsedContactName {
  first_name: string;
  last_name: string;
  address: string;
  unit_number?: string;
}

// Australian street types (full + abbreviated)
const STREET_TYPES = [
  'Street', 'St',
  'Road', 'Rd',
  'Drive', 'Dr',
  'Avenue', 'Ave',
  'Lane', 'Ln',
  'Way',
  'Court', 'Ct',
  'Crescent', 'Cres',
  'Place', 'Pl',
  'Boulevard', 'Blvd',
  'Parade', 'Pde',
  'Circuit', 'Cct',
  'Close', 'Cl',
  'Terrace', 'Tce',
  'Highway', 'Hwy',
  'Grove', 'Gr',
  'Square', 'Sq',
  'Rise',
  'Track',
  'Trail',
  'Circle', 'Cir',
  'Parkway', 'Pkwy',
  'Esplanade', 'Esp',
].join('|');

// Matches an Australian street address: optional unit prefix, street number, street name, street type
// e.g. "713/45 Macquarie Street" or "12 George St" or "3/15-17 Smith Road"
const ADDRESS_REGEX = new RegExp(
  `(\\d+\\s*/\\s*)?` +           // optional unit prefix: "713/" or "3 /"
  `(\\d+(?:\\s*[-–]\\s*\\d+)?)` + // street number, optionally range: "45" or "15-17"
  `\\s+` +                        // space
  `([A-Z][a-zA-Z'\\s-]+?)` +     // street name: "Macquarie" or "George"
  `\\s+` +                        // space
  `(${STREET_TYPES})` +           // street type: "Street" or "St"
  `\\b`,                          // word boundary
  'i'
);

// AU state codes + postcode pattern
const AU_STATE_POSTCODE = /\b(NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\s*\d{4}\b/i;
const AU_POSTCODE = /\b\d{4}\b/;

/**
 * Parse a messy contact name field that may contain an embedded address.
 * Common in real estate agent contact lists, e.g.:
 *   "Data: Jason Li – 713/45 Macquarie Street, Parramatta"
 *   "John Smith 45 George St Sydney NSW 2000"
 *
 * Returns parsed components, or null if no address pattern detected.
 */
export function parseContactNameField(rawName: string): ParsedContactName | null {
  if (!rawName || rawName.trim().length === 0) return null;

  let input = rawName.trim();

  // Step 1: Strip common prefixes like "Data:", "Info:", "Note:", "Contact:"
  input = input.replace(/^(data|info|note|contact|ref|record)\s*:\s*/i, '').trim();

  // Step 2: Try to find an address pattern
  const addressMatch = input.match(ADDRESS_REGEX);
  if (!addressMatch) return null;

  const matchStart = addressMatch.index!;
  const matchEnd = matchStart + addressMatch[0].length;

  // Extract everything from the address match to end of string as the full address
  let addressPart = input.slice(matchStart).trim();

  // Extract the name part (everything before the address)
  let namePart = input.slice(0, matchStart).trim();

  // Step 3: Clean delimiters between name and address
  // Remove trailing delimiters: "–", "—", "-", ","
  namePart = namePart.replace(/[\s]*[–—\-,]+[\s]*$/, '').trim();

  // If name part is empty, address was the whole string — can't extract a name
  if (!namePart) return null;

  // Step 4: Extract unit number from address if present (e.g., "713/45 Macquarie Street")
  let unitNumber: string | undefined;
  const unitMatch = addressPart.match(/^(\d+)\s*\/\s*/);
  if (unitMatch) {
    unitNumber = unitMatch[1];
    // Don't strip the unit from the address — keep full format for geocoding
  }

  // Step 5: Clean up address — capture suburb after street type
  // The address might continue with ", Parramatta NSW 2150" or just "Parramatta"
  // Keep it all as the address string
  addressPart = addressPart
    .replace(/,\s*$/, '')    // trailing comma
    .replace(/\s+/g, ' ')   // normalize whitespace
    .trim();

  // Step 6: Split name into first/last
  const nameParts = namePart.split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ');

  if (!firstName) return null;

  return {
    first_name: firstName,
    last_name: lastName,
    address: addressPart,
    unit_number: unitNumber,
  };
}
