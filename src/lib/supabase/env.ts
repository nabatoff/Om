/**
 * Публичные ключи Next (NEXT_PUBLIC_*) — нужны на клиенте и на сервере.
 * Создай файл .env.local в корне проекта (см. .env.example).
 */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return !!url && !!anonKey;
}

export function getSupabasePublicEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    throw new Error(
      "Задай NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY: скопируй .env.example → .env.local и вставь URL и anon key из Supabase → Project Settings → API (https://supabase.com/dashboard/project/_/settings/api).",
    );
  }
  return { url, anonKey };
}
