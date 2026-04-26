import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.warn('CRM: задай VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env');
}

export const supabase = createClient(url || '', key || '');
