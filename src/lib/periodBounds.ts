/** Пустые даты в админских фильтрах = текущий календарный месяц (локально). */
export function adminDateFilterBounds(
  filterDateFrom: string,
  filterDateTo: string,
): {
  from: string;
  to: string;
  isDefaultMonth: boolean;
} {
  const from = filterDateFrom.trim();
  const to = filterDateTo.trim();
  if (from || to) return { from, to, isDefaultMonth: false };
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth();
  const pad = (n: number) => String(n).padStart(2, '0');
  const mo = pad(m + 1);
  const last = String(new Date(y, m + 1, 0).getDate()).padStart(2, '0');
  return { from: `${y}-${mo}-01`, to: `${y}-${mo}-${last}`, isDefaultMonth: true };
}

export function reportDateMatchesAdminBounds(reportDate: string, bounds: { from: string; to: string }): boolean {
  if (bounds.from && reportDate < bounds.from) return false;
  if (bounds.to && reportDate > bounds.to) return false;
  return true;
}

export const ALL_TIME_FROM = '1000-01-01';
export const ALL_TIME_TO = '9999-12-31';

const pad2 = (n: number) => String(n).padStart(2, '0');

export function formatYmdLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayPeriodBounds(): { from: string; to: string } {
  const t = formatYmdLocal(new Date());
  return { from: t, to: t };
}

/** Последние `days` календарных дней, включая сегодня. */
export function rollingDaysPeriodBounds(days: number): { from: string; to: string } {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (days - 1));
  return { from: formatYmdLocal(start), to: formatYmdLocal(end) };
}

/** Понедельник–воскресенье недели, в которую попадает `d` (локальный календарь). */
export function calendarWeekPeriodBounds(d = new Date()): { from: string; to: string } {
  const day = d.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMon);
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
  return { from: formatYmdLocal(mon), to: formatYmdLocal(sun) };
}

export function calendarMonthFromYm(ym: string): { from: string; to: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(ym.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const monthIdx = Number(m[2]) - 1;
  if (monthIdx < 0 || monthIdx > 11) return null;
  const last = new Date(y, monthIdx + 1, 0).getDate();
  return { from: `${m[1]}-${m[2]}-01`, to: `${m[1]}-${m[2]}-${String(last).padStart(2, '0')}` };
}

export type PeriodFilterKind = 'today' | 'week' | 'month' | 'range' | 'all';

export function inferPeriodFilterKind(from: string, to: string): { kind: PeriodFilterKind; monthYm: string } {
  const f = from.trim();
  const t = to.trim();
  const def = adminDateFilterBounds('', '');
  const defaultYm = def.from.slice(0, 7);
  if (f === ALL_TIME_FROM && t === ALL_TIME_TO) return { kind: 'all', monthYm: defaultYm };
  if (!f && !t) return { kind: 'month', monthYm: defaultYm };

  const td = todayPeriodBounds();
  if (f === td.from && t === td.to) return { kind: 'today', monthYm: defaultYm };

  const wb = calendarWeekPeriodBounds();
  if (f === wb.from && t === wb.to) return { kind: 'week', monthYm: defaultYm };

  if (f.length >= 10 && t.length >= 10 && f.slice(0, 7) === t.slice(0, 7) && f.slice(8, 10) === '01') {
    const ym = f.slice(0, 7);
    const mb = calendarMonthFromYm(ym);
    if (mb && f === mb.from && t === mb.to) return { kind: 'month', monthYm: ym };
  }
  return { kind: 'range', monthYm: f.length >= 7 ? f.slice(0, 7) : defaultYm };
}

export function buildMonthSelectOptions(monthsBack: number, anchorYm?: string): { value: string; label: string }[] {
  const seen = new Set<string>();
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
    if (seen.has(ym)) continue;
    seen.add(ym);
    const raw = d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    const label = raw.charAt(0).toUpperCase() + raw.slice(1);
    out.push({ value: ym, label });
  }
  if (anchorYm && /^\d{4}-\d{2}$/.test(anchorYm) && !seen.has(anchorYm)) {
    const [yy, mm] = anchorYm.split('-').map(Number);
    const d = new Date(yy, mm - 1, 1);
    const raw = d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    const label = raw.charAt(0).toUpperCase() + raw.slice(1);
    out.push({ value: anchorYm, label });
  }
  out.sort((a, b) => b.value.localeCompare(a.value));
  return out;
}
