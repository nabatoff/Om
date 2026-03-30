/** Локальная дата YYYY-MM-DD (для сравнения с полями date из БД). */
export function localISODate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDaysISO(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return localISODate(dt);
}

/** Понедельник–воскресенье текущей календарной недели (локально). */
export function currentWeekRangeISO(anchor = new Date()): {
  start: string;
  end: string;
} {
  const d = new Date(anchor);
  const day = d.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + mondayOffset);
  const start = localISODate(monday);
  const end = addDaysISO(start, 6);
  return { start, end };
}

export function needsCallToday(next: string | null, today = localISODate()): boolean {
  if (!next) return false;
  return next <= today;
}

export function isContactToday(next: string | null, today = localISODate()): boolean {
  return next === today;
}
