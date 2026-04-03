import type { Activity, Contact } from '@realestate-crm/types';

/**
 * Represents a call that matched a CRM contact and needs user input on the
 * outcome before being logged as an activity. Stored in useCRMStore so all
 * three entry paths (auto-detection, CallOutcomeModal, AddActivityDialog)
 * share the same pending state and can deduplicate.
 */
export interface PendingCallOutcome {
  /** The matched CRM contact */
  contact: Contact;
  /** Raw phone number from the call log */
  phone: string;
  /** Call direction and timestamp metadata */
  callTimestamp: number;
  callType: 'incoming' | 'outgoing' | 'missed';
  callDuration: number;
  /** Display-friendly contact name */
  contactName: string;
  /** Pre-built content string for the activity */
  content: string;
  /** Dedup key to prevent double-logging */
  callKey: string;
}

/**
 * Normalize a phone number to its last 8 digits (digits only).
 * Handles international prefixes, spaces, dashes, parentheses, etc.
 */
function normalizePhoneLast8(phone: string): string {
  return phone.replace(/\D/g, '').slice(-8);
}

/**
 * Round a timestamp down to the nearest window boundary.
 * e.g. windowMs=120000 rounds to 2-minute buckets.
 */
function roundToWindow(ts: number, windowMs: number): number {
  return Math.floor(ts / windowMs) * windowMs;
}

/**
 * Generate a dedup key for a call activity.
 *
 * Two calls to the same number within the same time window produce the same key,
 * preventing auto-detection and manual entry from creating duplicate activities.
 *
 * @param phoneNumber - The phone number involved in the call (any format)
 * @param timestamp   - When the call occurred
 * @param windowMs    - Window size in milliseconds (default: 2 minutes)
 */
export function generateCallDedupKey(
  phoneNumber: string,
  timestamp: Date,
  windowMs = 2 * 60 * 1000
): string {
  const digits = normalizePhoneLast8(phoneNumber);
  const bucket = roundToWindow(timestamp.getTime(), windowMs);
  return `call:${digits}:${bucket}`;
}

/**
 * Check whether a COMPLETED call activity for the given phone number already
 * exists within the specified lookback window. Activities without a call_outcome
 * are considered "pending" (pre-created by contact detail before the call
 * finishes) and are NOT treated as duplicates — the post-call modal should
 * still appear so the user can record the outcome.
 *
 * @param activities - The list of activities to search through
 * @param phone      - Phone number to match (last-8-digit comparison)
 * @param withinMs   - Lookback window in milliseconds (default: 2 minutes)
 */
export function hasRecentCallActivity(
  activities: Activity[],
  phone: string,
  withinMs = 2 * 60 * 1000
): boolean {
  if (!phone) return false;
  const normalizedPhone = normalizePhoneLast8(phone);
  if (normalizedPhone.length < 8) return false;

  const cutoff = Date.now() - withinMs;

  return activities.some((a) => {
    if (a.type !== 'call') return false;
    const ts = a.created_at ? new Date(a.created_at).getTime() : 0;
    if (ts < cutoff) return false;

    // Skip activities that don't have an outcome yet — these are pre-created
    // by contact/[id].tsx before the call completes and still need the modal.
    if (!a.call_outcome) return false;

    const dedupKey = (a as Activity & { call_dedup_key?: string }).call_dedup_key;
    if (dedupKey) {
      const keyPhone = dedupKey.split(':')[1] ?? '';
      return keyPhone === normalizedPhone;
    }

    return false;
  });
}
