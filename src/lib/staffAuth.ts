/**
 * Должен совпадать с secret STAFF_EMAIL_DOMAIN у Edge `create-staff`.
 * Пользователю показываем только «логин»; `@{домен}` — внутренняя привязка к Supabase Auth.
 */
export const STAFF_EMAIL_DOMAIN = import.meta.env.VITE_STAFF_AUTH_DOMAIN || 'om.staff';

/** Нормализация логина: нижний регистр, только a-z, 0-9, _ */
export function normalizeStaffLogin(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
}

export function isValidStaffLogin(raw: string): boolean {
  const n = normalizeStaffLogin(raw);
  return n.length >= 2 && n.length <= 32;
}

/** Преобразует логин в email для signInWithPassword (пользователю не раскрываем) */
export function staffLoginToServiceEmail(login: string): string {
  if (!isValidStaffLogin(login)) {
    throw new Error('Логин: 2–32 символа, латиница, цифры, подчёркивание _');
  }
  const n = normalizeStaffLogin(login);
  return `${n}@${STAFF_EMAIL_DOMAIN}`;
}

/** @deprecated используй алиасы *StaffLogin* */
export const normalizeStaffCode = normalizeStaffLogin;
export const isValidStaffCode = isValidStaffLogin;
export const staffCodeToEmail = staffLoginToServiceEmail;
