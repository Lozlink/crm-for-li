/**
 * Caller-id module shim for web.
 * The caller-id workspace package is a native (iOS/Android) module — it has no web runtime.
 * This shim provides type-only declarations so that shared hooks (e.g. useCallLogSync)
 * which `import type { RecentCall } from 'caller-id/src/CallerIdModule'` type-check on web.
 *
 * Runtime imports of `caller-id` should be wrapped in a try/catch in shared code
 * (see useCallLogSync.ts:11-13).
 */

export interface CallerIdContact {
  phone: string;
  label: string;
}

export interface RecentCall {
  phone: string;
  timestamp: number;
  duration: number;
  type: 'incoming' | 'outgoing' | 'missed';
}

export default {} as Record<string, never>;
