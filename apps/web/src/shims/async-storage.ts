/**
 * AsyncStorage shim using localStorage for web.
 */
const AsyncStorage = {
  async getItem(key: string): Promise<string | null> {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (typeof window === 'undefined') return;
    localStorage.setItem(key, value);
  },
  async removeItem(key: string): Promise<void> {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(key);
  },
  async clear(): Promise<void> {
    if (typeof window === 'undefined') return;
    localStorage.clear();
  },
  async getAllKeys(): Promise<readonly string[]> {
    if (typeof window === 'undefined') return [];
    return Object.keys(localStorage);
  },
  async multiGet(
    keys: readonly string[]
  ): Promise<readonly [string, string | null][]> {
    if (typeof window === 'undefined') return keys.map((k) => [k, null]);
    return keys.map((key) => [key, localStorage.getItem(key)]);
  },
  async multiSet(keyValuePairs: [string, string][]): Promise<void> {
    if (typeof window === 'undefined') return;
    keyValuePairs.forEach(([key, value]) => localStorage.setItem(key, value));
  },
};

export default AsyncStorage;
