import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const configured = Boolean(url && key && !url.includes('your-project'));
export const supabase: SupabaseClient | null = configured
  ? createClient(url, key, { auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true } })
  : null;
