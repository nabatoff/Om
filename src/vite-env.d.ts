/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Служебный домен привязки к Auth (см. STAFF_EMAIL_DOMAIN в Edge). По умолчанию om.staff */
  readonly VITE_STAFF_AUTH_DOMAIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
