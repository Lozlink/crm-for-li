import { Platform } from 'react-native';

/**
 * Platform detection utilities
 */
export const isWeb = Platform.OS === 'web';
export const isIOS = Platform.OS === 'ios';
export const isAndroid = Platform.OS === 'android';
export const isMobile = isIOS || isAndroid;

/**
 * Feature detection based on platform
 */
export const features = {
  hasNativeContacts: isMobile, // expo-contacts only works on mobile
  hasNativeLocation: isMobile, // expo-location works best on mobile
  hasNativeMaps: isMobile, // react-native-maps only works on mobile
  hasKeyboard: true, // All platforms have keyboard
  hasTouchscreen: isMobile, // Assume mobile has touch, web may or may not
};

/**
 * Platform-specific value selector
 * Similar to Platform.select but with better TypeScript support
 */
export function platformSelect<T>(options: {
  web?: T;
  ios?: T;
  android?: T;
  mobile?: T;
  default?: T;
}): T | undefined {
  if (isWeb && options.web !== undefined) return options.web;
  if (isIOS && options.ios !== undefined) return options.ios;
  if (isAndroid && options.android !== undefined) return options.android;
  if (isMobile && options.mobile !== undefined) return options.mobile;
  return options.default;
}

/**
 * Get platform name for display
 */
export function getPlatformName(): string {
  return Platform.OS.charAt(0).toUpperCase() + Platform.OS.slice(1);
}
