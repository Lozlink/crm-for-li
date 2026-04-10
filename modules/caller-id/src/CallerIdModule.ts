import { requireNativeModule } from 'expo-modules-core';

/**
 * Represents a contact to be synced for caller ID lookup.
 */
export interface CallerIdContact {
  /** Phone number in E.164 or local format */
  phone: string;
  /** Display label (e.g. contact name) */
  label: string;
}

/**
 * Represents a call log entry returned by getRecentCalls.
 */
export interface RecentCall {
  phone: string;
  timestamp: number;
  duration: number;
  type: 'incoming' | 'outgoing' | 'missed';
}

/**
 * Native module interface for caller ID functionality.
 *
 * On iOS, uses CallKit CXCallDirectoryManager to provide caller identification.
 * On Android, queries the system CallLog and uses SharedPreferences for contact storage.
 */
interface CallerIdModuleInterface {
  /**
   * Push CRM contacts to native shared storage for caller ID lookup.
   * On iOS, writes to App Group UserDefaults and reloads the Call Directory extension.
   * On Android, writes to SharedPreferences.
   */
  syncContacts(contacts: CallerIdContact[]): Promise<void>;

  /**
   * Check whether caller ID permissions/extension are currently enabled.
   * On iOS, queries CXCallDirectoryManager enabled status.
   * On Android, checks READ_PHONE_STATE permission.
   */
  isCallerIdEnabled(): Promise<boolean>;

  /**
   * Enable caller ID by triggering permission requests or extension reload.
   * On iOS, reloads the Call Directory extension.
   * On Android, requests READ_PHONE_STATE, READ_CALL_LOG, and POST_NOTIFICATIONS permissions.
   * @returns true if successfully enabled
   */
  enableCallerId(): Promise<boolean>;

  /**
   * Read recent calls from the system call log.
   * On Android, queries CallLog.Calls content provider.
   * On iOS, always returns an empty array (iOS does not expose call log to apps).
   * @param sinceTimestamp - Unix timestamp in milliseconds; only calls after this time are returned
   */
  getRecentCalls(sinceTimestamp: number): Promise<RecentCall[]>;

  /**
   * Check whether SEND_SMS permission is granted.
   * On iOS, always returns false (direct SMS not supported).
   */
  hasSmsPermission(): Promise<boolean>;

  /**
   * Request SEND_SMS permission from the user.
   * On iOS, always returns false.
   */
  requestSmsPermission(): Promise<boolean>;

  /**
   * Send an SMS directly without opening the native compose UI (Android only).
   * Uses Android SmsManager.sendTextMessage for seamless in-app sending.
   * On iOS, returns { success: false } — use expo-sms sendSMSAsync instead.
   * @param phone - Phone number to send to
   * @param message - Message body
   */
  sendDirectSms(phone: string, message: string): Promise<{ success: boolean; error: string | null }>;
}

export default requireNativeModule<CallerIdModuleInterface>('CallerId');
