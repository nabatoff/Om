/** Должен совпадать с STAFF_EMAIL_DOMAIN в Edge Function `create-staff` (Supabase → Edge Functions → Secrets). */
export const STAFF_EMAIL_DOMAIN = import.meta.env.VITE_STAFF_AUTH_DOMAIN || 'om.staff';

export function normalizeStaffCode(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
}

export function isValidStaffCode(raw: string): boolean {
  const n = normalizeStaffCode(raw);
  return n.length >= 2 && n.length <= 32;
}

export function staffCodeToEmail(code: string): string {
  const n = normalizeStaffCode(code);
  if (!isValidStaffCode(code)) {
    throw new Error('Код: 2–32 символа, латиница, цифры, _');
  }
  return `${n}@${STAFF_EMAIL_DOMAIN}`;
}
