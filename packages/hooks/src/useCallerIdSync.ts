import { useEffect, useRef } from 'react';
import { useCRMStore } from './useCRMStore';

// Lazy-import CallerIdModule to avoid crash when native module is not available
// (e.g. running in web or Expo Go where native modules aren't linked)
let CallerIdModule: any = null;
try {
  CallerIdModule = require('../../../modules/caller-id/src').default;
} catch {}

/**
 * Normalize an Australian phone number to E.164 format.
 * Returns null if the input cannot be normalised.
 */
export function toE164(phone: string): string | null {
  // Strip whitespace, dashes, parentheses
  const cleaned = phone.replace(/[\s\-()]/g, '');

  if (!cleaned) return null;

  // Already in international format
  if (cleaned.startsWith('+')) return cleaned;

  // Australian local format: replace leading 0 with +61
  if (cleaned.startsWith('0')) return '+61' + cleaned.slice(1);

  // Raw digits without prefix: assume Australian if 8+ digits
  if (/^\d{8,}$/.test(cleaned)) return '+61' + cleaned;

  return null;
}

/**
 * Hook that watches CRM contacts and syncs their phone numbers
 * to the native caller ID layer whenever they change.
 *
 * Mount once at the app root level. The hook is a no-op when
 * CallerIdModule is not available (e.g. web or Expo Go).
 */
export function useCallerIdSync() {
  const contacts = useCRMStore((state) => state.contacts);
  const lastFingerprintRef = useRef<string>('');

  useEffect(() => {
    if (!CallerIdModule) return;

    const syncable = contacts
      .filter((c) => !!c.phone)
      .map((c) => {
        const phone = toE164(c.phone!);
        if (!phone) return null;
        const label = [c.first_name, c.last_name].filter(Boolean).join(' ');
        return { phone, label };
      })
      .filter((entry): entry is { phone: string; label: string } => entry !== null);

    const fingerprint = JSON.stringify(syncable);
    if (fingerprint === lastFingerprintRef.current) return;
    lastFingerprintRef.current = fingerprint;

    CallerIdModule.syncContacts(syncable).catch((err: unknown) => {
      console.warn('[useCallerIdSync] Failed to sync contacts:', err);
    });
  }, [contacts]);
}
