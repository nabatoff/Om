export type StaffDept = 'all' | 'managers' | 'diggers';

export const STAFF_DEPT_OPTIONS: Array<{ value: StaffDept; label: string }> = [
  { value: 'all', label: 'Все отделы' },
  { value: 'managers', label: 'Менеджеры' },
  { value: 'diggers', label: 'Лидорубы' },
];

export type StaffProfile = { id: string; fullName: string; role: string };

type ReportLike = { managerId?: string | null; manager?: string };

export type StaffDeptKind = 'managers' | 'diggers' | 'admin' | 'unknown';

export function isAdminStaffRole(role: string | null | undefined): boolean {
  return (role || '').trim().toLowerCase() === 'admin';
}

/** Имена админов в отчётах, даже без profiles (старые строки вроде Administrator). */
export function isAdminStaffName(name: string): boolean {
  const n = name.trim().toLowerCase().replace(/ё/g, 'е');
  if (!n) return false;
  if (n === 'administrator' || n === 'admin' || n === 'админ' || n === 'администратор') return true;
  return n.includes('администратор');
}

export function isHiddenFromManagerSelect(name: string): boolean {
  const n = name.trim().toLowerCase().replace(/ё/g, 'е');
  if (!n) return false;
  if (isAdminStaffName(n)) return true;
  return n === 'вюсал' || n === 'vusal' || n === 'visal' || n.startsWith('вюсал ');
}

function profileByName(profiles: StaffProfile[], name: string): StaffProfile | undefined {
  const n = name.trim().toLowerCase();
  if (!n) return undefined;
  return profiles.find((p) => p.fullName.trim().toLowerCase() === n);
}

export function isAdminStaff(report: ReportLike, profiles: StaffProfile[]): boolean {
  return resolveReportStaffDept(report, profiles) === 'admin';
}

export function resolveReportStaffDept(report: ReportLike, profiles: StaffProfile[]): StaffDeptKind {
  if (report.managerId) {
    const byId = profiles.find((p) => p.id === report.managerId);
    if (byId) {
      if (isAdminStaffRole(byId.role)) return 'admin';
      return byId.role === 'lead_digger' ? 'diggers' : 'managers';
    }
  }
  const rawName = (report.manager || '').trim();
  if (isAdminStaffName(rawName)) return 'admin';
  if (rawName) {
    const byName = profileByName(profiles, rawName);
    if (byName) {
      if (isAdminStaffRole(byName.role)) return 'admin';
      return byName.role === 'lead_digger' ? 'diggers' : 'managers';
    }
  }
  return 'unknown';
}

/** unknown (старые отчёты без роли) — в «Менеджеры» и «Все», не в «Лидорубы». Админы никуда. */
export function reportMatchesStaffDept(
  report: ReportLike,
  dept: StaffDept,
  profiles: StaffProfile[],
): boolean {
  const resolved = resolveReportStaffDept(report, profiles);
  if (resolved === 'admin') return false;
  if (dept === 'all') return true;
  if (dept === 'diggers') return resolved === 'diggers';
  return resolved === 'managers' || resolved === 'unknown';
}

export function managerOptionsForDept(
  reports: Array<ReportLike & { manager?: string }>,
  dept: StaffDept,
  profiles: StaffProfile[],
): string[] {
  const set = new Set<string>();
  for (const r of reports) {
    if (!reportMatchesStaffDept(r, dept, profiles)) continue;
    const name = (r.manager || '').trim();
    if (!name || isHiddenFromManagerSelect(name)) continue;
    const byName = profileByName(profiles, name);
    if (byName && isAdminStaffRole(byName.role)) continue;
    set.add(name);
  }
  return ['Все', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'))];
}
