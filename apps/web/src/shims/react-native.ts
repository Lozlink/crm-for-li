/**
 * Lightweight shim for react-native Platform module.
 * Only the subset used by shared packages.
 */
export const Platform = {
  OS: 'web' as string,
  select: <T>(options: { web?: T; ios?: T; android?: T; default?: T }): T | undefined =>
    options.web ?? options.default,
};

export default { Platform };
