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

interface DedupContact {
  first_name: string;
  last_name?: string;
  phone?: string;
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
