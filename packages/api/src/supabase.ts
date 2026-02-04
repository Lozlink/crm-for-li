import 'react-native-url-polyfill/auto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { storage } from '@realestate-crm/utils';

// Lazy initialize Supabase client
let _supabase: SupabaseClient | null = null;

function getSupabaseClient() {
  if (_supabase) return _supabase;

  const supabaseUrl = Constants.expoConfig?.extra?.SUPABASE_URL || '';
  const supabaseAnonKey = Constants.expoConfig?.extra?.SUPABASE_ANON_KEY || '';

  // Allow empty values for demo mode
  _supabase = createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder-key',
    {
      auth: {
        storage: storage as any,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    }
  );

  return _supabase;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(target, prop) {
    return (getSupabaseClient() as any)[prop];
  },
});

// Demo mode - when Supabase is not configured, use local storage
export const isDemoMode =
  !Constants.expoConfig?.extra?.SUPABASE_URL ||
  !Constants.expoConfig?.extra?.SUPABASE_ANON_KEY;

// Helper to generate UUID for demo mode
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
