import type { FullReport } from './crmApi';

export type ClientCpMeeting = {
  meetingId: string;
  cpSent: boolean;
  cpQuantity: number;
  reportDate: string;
  meetingDate: string;
  manager: string;
};

export type ClientListRow = {
  name: string;
  bin: string;
  totalCp: number;
  cpMeetings: ClientCpMeeting[];
};

export function reportBelongsToManager(
  report: FullReport,
  managerId: string | null | undefined,
  managerName: string,
): boolean {
  const name = managerName.trim();
  if (managerId && report.managerId === managerId) return true;
  if (managerId && !report.managerId && report.manager.trim() === name) return true;
  if (!managerId && report.manager.trim() === name) return true;
  return false;
}

export function filterReportsForManager(
  reports: FullReport[],
  managerId: string | null | undefined,
  managerName: string,
): FullReport[] {
  return reports.filter((r) => reportBelongsToManager(r, managerId, managerName));
}

/** Уникальные БИН клиента из отчётов менеджера (назначенные / проведённые / заказы). */
export function collectClientBinsFromReports(reports: FullReport[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of reports) {
    const lists = [r.assignedMeetings, r.conductedMeetings, r.confirmedOrders] as const;
    for (const list of lists) {
      for (const e of list) {
        const bin = String(e.bin).trim();
        if (!bin) continue;
        const prev = map.get(bin) ?? '';
        const name = String(e.entityName ?? '').trim();
        if (!prev && name) map.set(bin, name);
        else if (!map.has(bin)) map.set(bin, name || '');
      }
    }
  }
  return map;
}

export function clientCpStatsForBin(reports: FullReport[], bin: string): { totalCp: number; cpMeetings: ClientCpMeeting[] } {
  const key = bin.trim();
  const cpMeetings: ClientCpMeeting[] = [];
  let totalCp = 0;
  for (const r of reports) {
    for (const m of r.conductedMeetings) {
      if (String(m.bin).trim() !== key) continue;
      const qty = m.cpSent && (m.cpQuantity ?? 0) >= 1 ? Math.max(0, m.cpQuantity) : 0;
      totalCp += qty;
      const meetingId = m.id?.trim();
      if (meetingId) {
        cpMeetings.push({
          meetingId,
          cpSent: Boolean(m.cpSent),
          cpQuantity: m.cpQuantity ?? 0,
          reportDate: r.date,
          meetingDate: m.date,
          manager: r.manager,
        });
      }
    }
  }
  cpMeetings.sort((a, b) => b.reportDate.localeCompare(a.reportDate) || b.meetingDate.localeCompare(a.meetingDate));
  return { totalCp, cpMeetings };
}

export function buildClientListRows(
  reports: FullReport[],
  catalog: { name: string; bin: string }[],
  options?: { managerId?: string | null; managerName?: string; allCatalog?: boolean },
): ClientListRow[] {
  const scoped =
    options?.managerId != null || options?.managerName
      ? filterReportsForManager(reports, options.managerId, options.managerName ?? '')
      : reports;

  const binMap = collectClientBinsFromReports(scoped);
  const rows: ClientListRow[] = [];

  if (options?.allCatalog) {
    for (const c of catalog) {
      const bin = c.bin.trim();
      if (!bin) continue;
      const { totalCp, cpMeetings } = clientCpStatsForBin(reports, bin);
      rows.push({
        name: c.name.trim() || binMap.get(bin) || '—',
        bin,
        totalCp,
        cpMeetings,
      });
    }
    for (const [bin, name] of binMap) {
      if (rows.some((r) => r.bin === bin)) continue;
      const { totalCp, cpMeetings } = clientCpStatsForBin(reports, bin);
      rows.push({ name: name || '—', bin, totalCp, cpMeetings });
    }
  } else {
    for (const [bin, name] of binMap) {
      const cat = catalog.find((c) => c.bin.trim() === bin);
      const { totalCp, cpMeetings } = clientCpStatsForBin(scoped, bin);
      rows.push({
        name: (cat?.name ?? name).trim() || '—',
        bin,
        totalCp,
        cpMeetings,
      });
    }
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name, 'ru') || a.bin.localeCompare(b.bin, 'ru'));
}
