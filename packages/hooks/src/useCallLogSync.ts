import { useEffect, useRef, useCallback } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useCRMStore } from './useCRMStore';
import type { RecentCall } from '../../../modules/caller-id/src/CallerIdModule';

// Lazy-import CallerIdModule to avoid crash when native module is not available
// (e.g. running in web or Expo Go where native modules aren't linked)
let CallerIdModule: any = null;
try {
  CallerIdModule = require('../../../modules/caller-id/src').default;
} catch {}

/**
 * Strip a phone string down to digits only.
 */
function toDigitsOnly(phone: string): string {
  return phone.replace(/\D/g, '');
}

/**
 * Compare two phone numbers by their last 8 digits.
 * This handles international prefixes, formatting differences, etc.
 */
function phonesMatch(a: string, b: string): boolean {
  const digitsA = toDigitsOnly(a);
  const digitsB = toDigitsOnly(b);
  if (digitsA.length < 8 || digitsB.length < 8) return false;
  return digitsA.slice(-8) === digitsB.slice(-8);
}

/**
 * Format a call duration in seconds to a human-readable string.
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

/**
 * Build a human-readable content string for an auto-logged call activity.
 */
function buildCallContent(call: RecentCall, contactName: string): string {
  const directionLabel =
    call.type === 'incoming'
      ? 'Incoming call'
      : call.type === 'outgoing'
        ? 'Outgoing call'
        : 'Missed call';

  const durationPart =
    call.type === 'missed' || call.duration === 0
      ? ''
      : ` (${formatDuration(call.duration)})`;

  return `${directionLabel}${durationPart} - auto-logged`;
}

/**
 * Hook that detects when the app returns to the foreground after a phone call
 * and automatically logs matched calls as CRM activities.
 *
 * How it works:
 * 1. Listens for AppState transitions from background/inactive to active.
 * 2. On foreground return, queries the native CallerIdModule for recent calls
 *    that occurred since the last check.
 * 3. Matches call phone numbers against CRM contacts using last-8-digit comparison.
 * 4. Creates a 'call' activity for each matched call.
 *
 * Platform notes:
 * - Android: Fully functional, reads from the system CallLog content provider.
 * - iOS: getRecentCalls always returns an empty array (iOS does not expose the
 *   call log to third-party apps without special entitlements), so this hook
 *   is effectively a no-op on iOS.
 *
 * Mount once at the app root level. The hook is a safe no-op when
 * CallerIdModule is not available (e.g. web or Expo Go).
 */
export function useCallLogSync() {
  const contacts = useCRMStore((state) => state.contacts);
  const addActivity = useCRMStore((state) => state.addActivity);

  // Track the timestamp of the last check to avoid re-querying old calls
  const lastCheckTimestampRef = useRef<number>(Date.now());

  // Track logged call timestamps to avoid duplicate activity creation.
  // Uses a Set of "phone:timestamp" keys for O(1) dedup lookups.
  const loggedCallKeysRef = useRef<Set<string>>(new Set());

  // Keep a ref to the latest contacts so the AppState listener closure
  // always sees the current list without needing to re-subscribe.
  const contactsRef = useRef(contacts);
  useEffect(() => {
    contactsRef.current = contacts;
  }, [contacts]);

  // Same for addActivity
  const addActivityRef = useRef(addActivity);
  useEffect(() => {
    addActivityRef.current = addActivity;
  }, [addActivity]);

  const processRecentCalls = useCallback(async () => {
    if (!CallerIdModule) return;

    const sinceTimestamp = lastCheckTimestampRef.current;
    lastCheckTimestampRef.current = Date.now();

    let recentCalls: RecentCall[];
    try {
      recentCalls = await CallerIdModule.getRecentCalls(sinceTimestamp);
    } catch (err) {
      console.warn('[useCallLogSync] Failed to get recent calls:', err);
      return;
    }

    if (!recentCalls || recentCalls.length === 0) return;

    const currentContacts = contactsRef.current;
    if (currentContacts.length === 0) return;

    for (const call of recentCalls) {
      // Dedup: skip calls we have already logged
      const callKey = `${toDigitsOnly(call.phone)}:${call.timestamp}`;
      if (loggedCallKeysRef.current.has(callKey)) continue;

      // Find a matching CRM contact by phone number
      const matchedContact = currentContacts.find(
        (c) => c.phone && phonesMatch(c.phone, call.phone)
      );
      if (!matchedContact) continue;

      // Build the contact display name for the activity content
      const contactName = [matchedContact.first_name, matchedContact.last_name]
        .filter(Boolean)
        .join(' ');

      // Mark as logged before the async call to prevent races
      loggedCallKeysRef.current.add(callKey);

      try {
        await addActivityRef.current({
          contact_id: matchedContact.id,
          type: 'call',
          content: buildCallContent(call, contactName),
        });
      } catch (err) {
        // Remove from logged set so it can be retried next time
        loggedCallKeysRef.current.delete(callKey);
        console.warn(
          '[useCallLogSync] Failed to log call activity for',
          contactName,
          ':',
          err
        );
      }
    }

    // Prevent the dedup set from growing unboundedly.
    // Keep only the last 500 entries (well beyond any realistic foreground cycle).
    if (loggedCallKeysRef.current.size > 500) {
      const entries = Array.from(loggedCallKeysRef.current);
      loggedCallKeysRef.current = new Set(entries.slice(entries.length - 200));
    }
  }, []);

  useEffect(() => {
    if (!CallerIdModule) return;

    let previousState: AppStateStatus = AppState.currentState;

    const subscription = AppState.addEventListener(
      'change',
      (nextAppState: AppStateStatus) => {
        // Detect background/inactive -> active transition
        if (
          (previousState === 'background' || previousState === 'inactive') &&
          nextAppState === 'active'
        ) {
          processRecentCalls();
        }
        previousState = nextAppState;
      }
    );

    return () => {
      subscription.remove();
    };
  }, [processRecentCalls]);
}
