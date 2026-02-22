/**
 * Lightweight shim for react-native modules.
 * Only the subset used by shared packages.
 */
export const Platform = {
  OS: 'web' as string,
  select: <T>(options: { web?: T; ios?: T; android?: T; default?: T }): T | undefined =>
    options.web ?? options.default,
};

export type AppStateStatus = 'active' | 'background' | 'inactive';

export const AppState = {
  currentState: 'active' as AppStateStatus,
  addEventListener: (_type: string, _handler: (state: AppStateStatus) => void) => ({
    remove: () => {},
  }),
};

export default { Platform, AppState };
