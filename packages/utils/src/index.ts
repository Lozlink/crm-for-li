export {
  isWeb,
  isIOS,
  isAndroid,
  isMobile,
  features,
  platformSelect,
  getPlatformName,
} from './platform';

export { storage, default as storageDefault } from './storage';

export {
  isValidEmail,
  isValidPhone,
  isValidUrl,
  isNonEmptyString,
  formatPhone,
  normalizePhone,
  isDuplicateContact,
  findDuplicates,
  findSingleDuplicate,
  parseContactNameField,
  normalizeAddress,
} from './validation';

export type { DedupContact, ParsedContactName } from './validation';

export { geocodeAddress, batchGeocodeAddresses, haversineDistance } from './geocode';

export { generateCallDedupKey, hasRecentCallActivity } from './callActivity';
export type { PendingCallOutcome } from './callActivity';

export { optimizeRoute } from './routeOptimizer';
export type { RouteCandidate, OptimizedRoute } from './routeOptimizer';
