const MONTH_NAMES = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
] as const;

export type ClientCategory = { id: string; name: string };

export function formatAttractionMonth(ymd: string | null | undefined): string {
  const parsed = parseAttractionMonth(ymd);
  if (!parsed) return '—';
  const monthLabel = MONTH_NAMES[parsed.month - 1] ?? String(parsed.month);
  return `${monthLabel} ${parsed.year}`;
}

export function parseAttractionMonth(ymd: string | null | undefined): { year: number; month: number } | null {
  const t = (ymd || '').trim();
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return { year, month };
}

export function attractionMonthFromParts(year: number, month1to12: number): string {
  const y = Math.floor(year);
  const mo = Math.max(1, Math.min(12, Math.floor(month1to12)));
  return `${y}-${String(mo).padStart(2, '0')}-01`;
}

export function currentAttractionParts(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function attractionYearOptions(): number[] {
  const now = new Date().getFullYear();
  const years: number[] = [];
  for (let y = 2020; y <= now + 2; y += 1) years.push(y);
  return years;
}

export const ATTRACTION_MONTH_OPTIONS = MONTH_NAMES.map((label, i) => ({
  value: i + 1,
  label,
}));

export const NEW_CATEGORY_VALUE = '__new__';

export type NewClientFormData = {
  name: string;
  bin: string;
  managerId: string;
  categoryId: string;
  newCategoryName: string;
  gzTurnoverPrevYear: string;
  attractionYear: number;
  attractionMonth: number;
  businessScale: 'smb' | 'enterprise';
};

export function emptyNewClientForm(managerId = ''): NewClientFormData {
  const { year, month } = currentAttractionParts();
  return {
    name: '',
    bin: '',
    managerId,
    categoryId: '',
    newCategoryName: '',
    gzTurnoverPrevYear: '',
    attractionYear: year,
    attractionMonth: month,
    businessScale: 'smb',
  };
}

export function newClientFormFromClient(c: {
  name: string;
  bin: string;
  managerId?: string | null;
  categoryId?: string | null;
  gzTurnoverPrevYear?: number | null;
  attractionMonth?: string | null;
  businessScale?: 'smb' | 'enterprise' | null;
}): NewClientFormData {
  const parsed = parseAttractionMonth(c.attractionMonth);
  const { year, month } = parsed ?? currentAttractionParts();
  return {
    name: c.name,
    bin: c.bin,
    managerId: c.managerId ?? '',
    categoryId: c.categoryId ?? '',
    newCategoryName: '',
    gzTurnoverPrevYear: c.gzTurnoverPrevYear != null ? String(c.gzTurnoverPrevYear) : '',
    attractionYear: year,
    attractionMonth: month,
    businessScale: c.businessScale === 'enterprise' ? 'enterprise' : 'smb',
  };
}
