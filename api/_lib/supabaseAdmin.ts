import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase client using the service-role key (bypasses row-level security).
 * Only ever call this AFTER `requireAdmin(req, res)` has succeeded.
 * Returns null when not configured, so callers fail closed.
 */
let cached: SupabaseClient | null = null;
export function adminDb(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  cached ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return cached;
}
