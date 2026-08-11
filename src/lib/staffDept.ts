export type StaffDept = 'all' | 'managers' | 'diggers';

export const STAFF_DEPT_OPTIONS: Array<{ value: StaffDept; label: string }> = [
  { value: 'all', label: 'Все отделы' },
  { value: 'managers', label: 'Менеджеры' },
  { value: 'diggers', label: 'Лидорубы' },
];

type StaffProfile = { id: string; fullName: string; role: string };

type ReportLike = { managerId?: string | null; manager?: string };

export function resolveReportStaffDept(
  report: ReportLike,
  profiles: StaffProfile[],
): 'managers' | 'diggers' | 'unknown' {
  if (report.managerId) {
    const byId = profiles.find((p) => p.id === report.managerId);
    if (byId) return byId.role === 'lead_digger' ? 'diggers' : 'managers';
  }
  const name = (report.manager || '').trim().toLowerCase();
  if (name) {
    const byName = profiles.find((p) => p.fullName.trim().toLowerCase() === name);
    if (byName) return byName.role === 'lead_digger' ? 'diggers' : 'managers';
  }
  return 'unknown';
}

/** unknown (старые отчёты без роли) — в «Менеджеры» и «Все», не в «Лидорубы». */
export function reportMatchesStaffDept(
  report: ReportLike,
  dept: StaffDept,
  profiles: StaffProfile[],
): boolean {
  if (dept === 'all') return true;
  const resolved = resolveReportStaffDept(report, profiles);
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
    if (name) set.add(name);
  }
  return ['Все', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'))];
}
