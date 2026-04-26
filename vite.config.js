import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
/** На Vercel env попадает в `process.env` на этапе build; Vite по умолчанию не вшивает NEXT_PUBLIC_. */
function resolveSupabaseEnv(mode) {
    const fromVite = loadEnv(mode, process.cwd(), 'VITE_');
    const fromNext = loadEnv(mode, process.cwd(), 'NEXT_PUBLIC_');
    const url = fromVite.VITE_SUPABASE_URL ||
        fromNext.NEXT_PUBLIC_SUPABASE_URL ||
        process.env.VITE_SUPABASE_URL ||
        process.env.NEXT_PUBLIC_SUPABASE_URL ||
        '';
    const key = fromVite.VITE_SUPABASE_ANON_KEY ||
        fromNext.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        process.env.VITE_SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        '';
    return { url, key };
}
export default defineConfig(({ mode }) => {
    const { url, key } = resolveSupabaseEnv(mode);
    /** Совпадать с secret STAFF_EMAIL_DOMAIN у Edge `create-staff`, иначе логин идёт на `login@X`, а в Auth создан `login@Y`. */
    const allEnv = loadEnv(mode, process.cwd(), '');
    const staffAuthDomain = allEnv.VITE_STAFF_AUTH_DOMAIN || allEnv.STAFF_EMAIL_DOMAIN || 'om.staff';
    return {
        plugins: [react()],
        // Явно вшиваем в client bundle (Vercel: переменные должны быть в Build Environment / All Environments)
        define: {
            'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(url),
            'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(key),
            'import.meta.env.VITE_STAFF_AUTH_DOMAIN': JSON.stringify(staffAuthDomain),
        },
    };
});
