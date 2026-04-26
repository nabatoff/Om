import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

if (!url || !key) {
  console.warn(
    'Supabase: нет VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (или NEXT_PUBLIC_*). Локально — .env.local; Vercel — Environment Variables + Redeploy.',
  );
}

const client: SupabaseClient | null = url && key ? createClient(url, key) : null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    throw new Error(
      'Supabase не настроен. Укажи VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY (дублируй из NEXT_PUBLIC_* если так задано в Vercel) и сделай Redeploy.',
    );
  }
  return client;
}

export function isSupabaseConfigured(): boolean {
  return client != null;
}
