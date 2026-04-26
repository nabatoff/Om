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

/**
 * GoTrue 400 + grant_type=password: обычно неверные креды, бан, несовпадение @домена с create-staff.
 * Покажи `serviceEmail` в UI — по нему ищи пользователя в Auth.
 */
export function formatAuthSignInError(
  e: { message: string; code?: string; status?: number | undefined },
  serviceEmail: string
): string {
  const m = e.message;
  if (
    m === 'Invalid login credentials' ||
    m.toLowerCase().includes('invalid login credentials') ||
    e.code === 'invalid_credentials'
  ) {
    return `Неверный логин или пароль, либо в Auth нет пользователя с email ${serviceEmail} (создание: Edge create-staff, домен = STAFF_EMAIL_DOMAIN, сейчас в клиенте: @${STAFF_EMAIL_DOMAIN})`;
  }
  if (/\b(banned|ban)\b/i.test(m) || m.includes('banned') || m.includes('забанен')) {
    return 'Аккаунт заблокирован (ban в Auth). Нужен разбан админом + is_active в profiles.';
  }
  if (/email not confirmed|confirm your email|подтверд/i.test(m)) {
    return 'Email не подтверждён (редко: при создании вручную). Попроси админа подтвердить в Dashboard или пересоздать через create-staff.';
  }
  if (/too many requests|rate|429/i.test(m)) {
    return 'Слишком много попыток. Подожди минуту и попробуй снова.';
  }
  return m;
}

/** @deprecated используй алиасы *StaffLogin* */
export const normalizeStaffCode = normalizeStaffLogin;
export const isValidStaffCode = isValidStaffLogin;
export const staffCodeToEmail = staffLoginToServiceEmail;
