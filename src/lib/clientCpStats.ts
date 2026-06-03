import type { ClientStandaloneCp, FullReport } from './crmApi';

export type ClientCpMeeting = {
  meetingId: string;
  cpSent: boolean;
  cpQuantity: number;
  cpPaid: boolean;
  reportDate: string;
  meetingDate: string;
  manager: string;
};

export type ClientStandaloneCpView = ClientStandaloneCp & {
  managerName?: string;
};

export type ClientListRow = {
  name: string;
  bin: string;
  managerId: string | null;
  managerName: string | null;
  isKtp?: boolean;
  cpPaid: boolean;
  cpPaidAt: string | null;
  managerNames: string[];
  managerIds: string[];
  meetingCp: number;
  extraCp: number;
  totalCp: number;
  cpMeetings: ClientCpMeeting[];
  /** Записи «ЦП без встречи» по менеджерам (для этого БИН). */
  standaloneByManager: ClientStandaloneCpView[];
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

export function clientCpStatsForBin(
  reports: FullReport[],
  bin: string,
): { meetingCp: number; cpMeetings: ClientCpMeeting[] } {
  const key = bin.trim();
  const cpMeetings: ClientCpMeeting[] = [];
  let meetingCp = 0;
  for (const r of reports) {
    for (const m of r.conductedMeetings) {
      if (String(m.bin).trim() !== key) continue;
      const qty = m.cpSent && (m.cpQuantity ?? 0) >= 1 ? Math.max(0, m.cpQuantity) : 0;
      meetingCp += qty;
      const meetingId = m.id?.trim();
      if (meetingId) {
        cpMeetings.push({
          meetingId,
          cpSent: Boolean(m.cpSent),
          cpQuantity: m.cpQuantity ?? 0,
          cpPaid: Boolean(m.cpPaid),
          reportDate: r.date,
          meetingDate: m.date,
          manager: r.manager,
        });
      }
    }
  }
  cpMeetings.sort((a, b) => b.reportDate.localeCompare(a.reportDate) || b.meetingDate.localeCompare(a.meetingDate));
  return { meetingCp, cpMeetings };
}

function standaloneForBin(
  standaloneRows: ClientStandaloneCp[],
  bin: string,
  managerIdFilter?: string | null,
  managerNameById?: Map<string, string>,
): { extraCp: number; standaloneByManager: ClientStandaloneCpView[] } {
  const key = bin.trim();
  const list: ClientStandaloneCpView[] = [];
  let extraCp = 0;
  for (const row of standaloneRows) {
    if (row.bin.trim() !== key) continue;
    if (managerIdFilter && row.managerId !== managerIdFilter) continue;
    extraCp += row.cpQuantity;
    list.push({
      ...row,
      managerName: managerNameById?.get(row.managerId) ?? undefined,
    });
  }
  list.sort((a, b) => (a.managerName ?? '').localeCompare(b.managerName ?? '', 'ru'));
  return { extraCp, standaloneByManager: list };
}

export function buildClientListRows(
  reports: FullReport[],
  catalog: {
    name: string;
    bin: string;
    managerId?: string | null;
    managerName?: string | null;
    cpPaid?: boolean;
    cpPaidAt?: string | null;
    isKtp?: boolean;
  }[],
  standaloneRows: ClientStandaloneCp[],
  options?: {
    managerId?: string | null;
    managerName?: string;
    allCatalog?: boolean;
    managerNameById?: Map<string, string>;
  },
): ClientListRow[] {
  const scoped =
    options?.managerId != null || options?.managerName
      ? filterReportsForManager(reports, options.managerId, options.managerName ?? '')
      : reports;

  const binMap = collectClientBinsFromReports(scoped);
  const rows: ClientListRow[] = [];
  const managerFilter = options?.managerId;

  const pushRow = (bin: string, name: string, reportScope: FullReport[]) => {
    const cat = catalog.find((c) => c.bin.trim() === bin);
    const { meetingCp, cpMeetings } = clientCpStatsForBin(reportScope, bin);
    const { extraCp, standaloneByManager } = standaloneForBin(
      standaloneRows,
      bin,
      managerFilter,
      options?.managerNameById,
    );
    const managers = new Set<string>();
    const managerIds = new Set<string>();
    for (const r of reportScope) {
      const hasBin =
        r.assignedMeetings.some((m) => m.bin.trim() === bin) ||
        r.conductedMeetings.some((m) => m.bin.trim() === bin) ||
        r.confirmedOrders.some((o) => o.bin.trim() === bin);
      if (hasBin && r.manager.trim()) managers.add(r.manager.trim());
      if (hasBin && r.managerId) managerIds.add(r.managerId);
    }
    for (const s of standaloneByManager) {
      const n = (s.managerName ?? '').trim();
      if (n) managers.add(n);
      if (s.managerId) managerIds.add(s.managerId);
    }
    const assignedName = (cat?.managerName ?? '').trim();
    if (assignedName) managers.add(assignedName);
    if (cat?.managerId) managerIds.add(cat.managerId);
    rows.push({
      name,
      bin,
      managerId: cat?.managerId ?? null,
      managerName: cat?.managerName ?? null,
      ...(cat?.isKtp !== undefined ? { isKtp: Boolean(cat.isKtp) } : {}),
      cpPaid: Boolean(cat?.cpPaid),
      cpPaidAt: cat?.cpPaidAt ?? null,
      managerNames: Array.from(managers),
      managerIds: Array.from(managerIds),
      meetingCp,
      extraCp,
      totalCp: meetingCp + extraCp,
      cpMeetings,
      standaloneByManager,
    });
  };

  if (options?.allCatalog) {
    // Админ: весь справочник, даже без движений.
    for (const c of catalog) {
      const bin = c.bin.trim();
      if (!bin || rows.some((r) => r.bin === bin)) continue;
      pushRow(bin, c.name.trim() || binMap.get(bin) || '—', scoped);
    }
  } else {
    // Менеджер: только клиенты, связанные с его движениями/ЦП без встречи.
    for (const [bin, name] of binMap) {
      if (rows.some((r) => r.bin === bin)) continue;
      const cat = catalog.find((c) => c.bin.trim() === bin);
      pushRow(bin, (cat?.name ?? name).trim() || '—', scoped);
    }
    // Плюс клиенты, явно закреплённые за менеджером в справочнике (даже без движений).
    if (managerFilter) {
      for (const c of catalog) {
        if (c.managerId !== managerFilter) continue;
        const bin = c.bin.trim();
        if (!bin || rows.some((r) => r.bin === bin)) continue;
        pushRow(bin, c.name.trim() || '—', scoped);
      }
    }
  }

  // Добавляем "сироты" из ЦП без встречи в рамках текущего скоупа.
  for (const row of standaloneRows) {
    if (managerFilter && row.managerId !== managerFilter) continue;
    const bin = row.bin.trim();
    if (!bin || rows.some((r) => r.bin === bin)) continue;
    const cat = catalog.find((c) => c.bin.trim() === bin);
    pushRow(bin, cat?.name.trim() || '—', scoped);
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name, 'ru') || a.bin.localeCompare(b.bin, 'ru'));
}
