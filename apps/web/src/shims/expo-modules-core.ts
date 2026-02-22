/**
 * Expo Modules Core shim for web.
 * Provides no-op stubs so turbopack can resolve this transitive dependency.
 */
export function requireNativeModule<T = Record<string, unknown>>(_name: string): T {
  return {} as T;
}

export function requireOptionalNativeModule<T = Record<string, unknown>>(_name: string): T | null {
  return null;
}

export class NativeModule {}
export class EventEmitter {
  addListener() { return { remove: () => {} }; }
  removeAllListeners() {}
  emit() {}
}

export default {};
