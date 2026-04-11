import { useEffect, useRef, useCallback, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useCRMStore } from './useCRMStore';
import type { CallOutcome, Contact } from '@realestate-crm/types';
import type { RecentCall } from 'caller-id/src/CallerIdModule';
import { generateCallDedupKey, hasRecentCallActivity } from '@realestate-crm/utils';

// Lazy-import CallerIdModule to avoid crash when native module is not available
// (e.g. running in web or Expo Go where native modules aren't linked)
let CallerIdModule: ReturnType<typeof require> = null;
try {
  CallerIdModule = require('caller-id').default;
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
function buildCallContent(call: RecentCall): string {
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
 * Represents a call that matched a CRM contact and needs user input
 * on the outcome before being logged as an activity.
 */
export interface PendingCallOutcome {
  /** The matched CRM contact */
  contact: Contact;
  /** The raw call data from the native module */
  call: RecentCall;
  /** Display-friendly contact name */
  contactName: string;
  /** Pre-built content string for the activity */
  content: string;
  /** Dedup key to prevent double-logging */
  callKey: string;
}

/**
 * Hook that detects when the app returns to the foreground after a phone call
 * and exposes pending calls for user outcome input before logging activities.
 *
 * How it works:
 * 1. Listens for AppState transitions from background/inactive to active.
 * 2. On foreground return, queries the native CallerIdModule for recent calls
 *    that occurred since the last check.
 * 3. Matches call phone numbers against CRM contacts using last-8-digit comparison.
 * 4. Instead of immediately creating activities, stores matched calls as "pending"
 *    so the UI can prompt the user for a call outcome.
 * 5. Once the user selects an outcome (or skips), the activity is created.
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
  const activities = useCRMStore((state) => state.activities);
  const addActivity = useCRMStore((state) => state.addActivity);

  const [pendingCall, setPendingCall] = useState<PendingCallOutcome | null>(null);

  // Track the timestamp of the last check to avoid re-querying old calls
  const lastCheckTimestampRef = useRef<number>(Date.now());

  // Track logged call timestamps to avoid duplicate activity creation.
  // Uses a Set of "phone:timestamp" keys for O(1) dedup lookups.
  const loggedCallKeysRef = useRef<Set<string>>(new Set());

  // Queue of pending calls waiting to be shown to the user (one at a time)
  const pendingQueueRef = useRef<PendingCallOutcome[]>([]);

  // Keep refs to latest store data so AppState listener closures always
  // see the current values without needing to re-subscribe.
  const contactsRef = useRef(contacts);
  useEffect(() => {
    contactsRef.current = contacts;
  }, [contacts]);

  const activitiesRef = useRef(activities);
  useEffect(() => {
    activitiesRef.current = activities;
  }, [activities]);

  // Same for addActivity
  const addActivityRef = useRef(addActivity);
  useEffect(() => {
    addActivityRef.current = addActivity;
  }, [addActivity]);

  /**
   * Show the next pending call from the queue, or clear state if empty.
   */
  const showNextPending = useCallback(() => {
    if (pendingQueueRef.current.length > 0) {
      setPendingCall(pendingQueueRef.current.shift()!);
    } else {
      setPendingCall(null);
    }
  }, []);

  /**
   * Called by the UI when the user selects an outcome for the pending call.
   * Creates the activity with the chosen call_outcome and advances to the next pending call.
   */
  const resolveCallOutcome = useCallback(async (outcome: CallOutcome | null, notes?: string) => {
    const current = pendingCall;
    if (!current) return;

    // Mark as logged before async to prevent races
    loggedCallKeysRef.current.add(current.callKey);

    const content = notes
      ? `${current.content}\n\nNotes: ${notes}`
      : current.content;

    try {
      await addActivityRef.current({
        contact_id: current.contact.id,
        type: 'call',
        content,
        call_outcome: outcome,
      });
    } catch (err) {
      // Remove from logged set so it can be retried next time
      loggedCallKeysRef.current.delete(current.callKey);
      console.warn(
        '[useCallLogSync] Failed to log call activity for',
        current.contactName,
        ':',
        err
      );
    }

    showNextPending();
  }, [pendingCall, showNextPending]);

  /**
   * Dismiss the current pending call without logging an outcome.
   * This still creates the activity but with null call_outcome.
   */
  const skipCallOutcome = useCallback(async () => {
    await resolveCallOutcome(null);
  }, [resolveCallOutcome]);

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

    const newPending: PendingCallOutcome[] = [];

    const currentActivities = activitiesRef.current;

    for (const call of recentCalls) {
      // Dedup key derived from last-8-digits + 2-minute time bucket
      const callKey = generateCallDedupKey(call.phone, new Date(call.timestamp));

      // Skip if already logged in this session or queued
      if (loggedCallKeysRef.current.has(callKey)) continue;

      // Skip if a matching call activity already exists in the store (prevents
      // double-logging when auto-detection fires after a manual entry)
      if (hasRecentCallActivity(currentActivities, call.phone)) continue;

      // Find a matching CRM contact by phone number
      const matchedContact = currentContacts.find(
        (c) => c.phone && phonesMatch(c.phone, call.phone)
      );
      if (!matchedContact) continue;

      // Build the contact display name for the activity content
      const contactName = [matchedContact.first_name, matchedContact.last_name]
        .filter(Boolean)
        .join(' ');

      newPending.push({
        contact: matchedContact,
        call,
        contactName,
        content: buildCallContent(call),
        callKey,
      });
    }

    if (newPending.length === 0) return;

    // Add to queue and show the first one if nothing is currently shown
    pendingQueueRef.current.push(...newPending);
    if (!pendingCall) {
      showNextPending();
    }

    // Prevent the dedup set from growing unboundedly.
    // Keep only the last 500 entries (well beyond any realistic foreground cycle).
    if (loggedCallKeysRef.current.size > 500) {
      const entries = Array.from(loggedCallKeysRef.current);
      loggedCallKeysRef.current = new Set(entries.slice(entries.length - 200));
    }
  }, [pendingCall, showNextPending]);

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

  return {
    /** The current pending call awaiting user outcome selection, or null */
    pendingCall,
    /** Call with the user's selected outcome to log the activity and advance */
    resolveCallOutcome,
    /** Skip the current pending call (logs activity with null outcome) */
    skipCallOutcome,
  };
}
