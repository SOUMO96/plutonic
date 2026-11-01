import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Browser Supabase client. Uses only the PUBLIC url + publishable key; everything it can read
 * or write is limited by row-level security (see the database policies). When the env vars are
 * absent the storefront falls back to the original browser-only demo store.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// VITE_FORCE_DEMO=1 runs the browser-only demo store even when keys are present (for testing).
const forceDemo = import.meta.env.VITE_FORCE_DEMO === '1';

export const supabase: SupabaseClient | null = url && key && !forceDemo
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;

export const isLive = supabase !== null;
