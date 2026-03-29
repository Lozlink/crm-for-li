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
} from './validation';

export type { DedupContact, ParsedContactName } from './validation';
