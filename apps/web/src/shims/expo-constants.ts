/**
 * Expo Constants shim for web.
 * Reads environment variables from Next.js process.env (NEXT_PUBLIC_ prefix).
 */
const Constants = {
  expoConfig: {
    extra: {
      SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      GOOGLE_PLACES_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY || '',
    },
  },
};

export default Constants;
