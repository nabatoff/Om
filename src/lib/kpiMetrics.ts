import type { FullReport } from './crmApi';
import { calendarMonthFromYm, reportDateMatchesAdminBounds } from './periodBounds';

export function normalizeKpiMeetingType(value: string): string {
  return value.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
}

export function isEnterpriseLeadMeetingType(type: string): boolean {
  return normalizeKpiMeetingType(type).includes('крупн');
}

export function isNewMeetingType(type: string): boolean {
  const n = normalizeKpiMeetingType(type);
  if (n.includes('крупн')) return false;
  return n.startsWith('нов');
}

export function isRepeatMeetingType(type: string): boolean {
  const n = normalizeKpiMeetingType(type);
  if (n.includes('крупн')) return false;
  return n.startsWith('повтор');
}

function normalizeKpiText(value: string): string {
  return value.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
}

export function normalizeKpiBin(value: string): string {
  return value.replace(/\D/g, '');
}

/** План «Крупный лид» скрываем, если по БИН уже есть факт того же типа. */
export function shouldHidePlannedEnterpriseLead(
  assigned: { bin: string; type: string },
  conductedPool: Array<{ bin: string; type: string }>,
): boolean {
  if (!isEnterpriseLeadMeetingType(assigned.type)) return false;
  const digits = normalizeKpiBin(assigned.bin);
  if (!digits) return false;
  return conductedPool.some(
    (c) => isEnterpriseLeadMeetingType(c.type) && normalizeKpiBin(c.bin) === digits,
  );
}

export function countAssignedNewMeetings(report: FullReport): number {
  return report.assignedMeetings.filter((m) => isNewMeetingType(m.type)).length;
}

export function countConductedNewMeetings(report: FullReport, allReports: FullReport[]): number {
  const managerNorm = normalizeKpiText(report.manager);
  const targetReports = allReports.filter((r) => normalizeKpiText(r.manager) === managerNorm && r.date >= report.date);
  if (targetReports.length === 0) return 0;
  let count = 0;
  for (const assigned of report.assignedMeetings) {
    if (!isNewMeetingType(assigned.type)) continue;
    const plannedName = normalizeKpiText(assigned.entityName);
    const plannedBin = normalizeKpiBin(assigned.bin);
    const plannedType = normalizeKpiMeetingType(assigned.type);
    const hasEvidence = targetReports.some((lr) =>
      lr.conductedMeetings.some(
        (cm) =>
          normalizeKpiBin(cm.bin) === plannedBin &&
          normalizeKpiText(cm.entityName) === plannedName &&
          normalizeKpiMeetingType(cm.type) === plannedType &&
          cm.date >= assigned.date,
      ),
    );
    if (hasEvidence) count += 1;
  }
  return count;
}

function collectCounterpartyKeysWithKpiConductedNew(summaryReports: FullReport[], allReports: FullReport[]): Set<string> {
  const keys = new Set<string>();
  for (const report of summaryReports) {
    const managerNorm = normalizeKpiText(report.manager);
    const targetReports = allReports.filter((r) => normalizeKpiText(r.manager) === managerNorm && r.date >= report.date);
    for (const assigned of report.assignedMeetings) {
      if (!isNewMeetingType(assigned.type)) continue;
      const plannedName = normalizeKpiText(assigned.entityName);
      const plannedBin = normalizeKpiBin(assigned.bin);
      const plannedType = normalizeKpiMeetingType(assigned.type);
      const hasEvidence = targetReports.some((lr) =>
        lr.conductedMeetings.some(
          (cm) =>
            normalizeKpiBin(cm.bin) === plannedBin &&
            normalizeKpiText(cm.entityName) === plannedName &&
            normalizeKpiMeetingType(cm.type) === plannedType &&
            cm.date >= assigned.date,
        ),
      );
      if (hasEvidence) keys.add(`${plannedBin}|${plannedName}`);
    }
  }
  return keys;
}

function collectCounterpartyKeysWithConfirmedOrder(summaryReports: FullReport[]): Set<string> {
  const keys = new Set<string>();
  for (const report of summaryReports) {
    for (const o of report.confirmedOrders) {
      keys.add(`${normalizeKpiBin(o.bin)}|${normalizeKpiText(o.entityName)}`);
    }
  }
  return keys;
}

export function countCounterpartiesConductedNewWithOrder(summaryReports: FullReport[], allReports: FullReport[]): number {
  const withNew = collectCounterpartyKeysWithKpiConductedNew(summaryReports, allReports);
  const withOrder = collectCounterpartyKeysWithConfirmedOrder(summaryReports);
  let n = 0;
  for (const k of withNew) {
    if (withOrder.has(k)) n += 1;
  }
  return n;
}

export function countConductedRepeatMeetings(report: FullReport): number {
  return report.conductedMeetings.filter((m) => isRepeatMeetingType(m.type)).length;
}

export function kpiConversionPercent(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return (numerator / denominator) * 100;
}

export function formatKpiPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1, minimumFractionDigits: 0 }).format(value)}%`;
}

export function dedupeReportsByDayManager(reports: FullReport[]): FullReport[] {
  const byKey = new Map<string, FullReport>();
  for (const r of reports) {
    const key = `${r.date}|${r.manager}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, r);
      continue;
    }
    const prevScore =
      prev.stats.processedTotal + prev.stats.newInWork + prev.stats.callsTotal + prev.stats.validatedTotal;
    const curScore = r.stats.processedTotal + r.stats.newInWork + r.stats.callsTotal + r.stats.validatedTotal;
    if (curScore >= prevScore) byKey.set(key, r);
  }
  return Array.from(byKey.values());
}

export type SalesDashboardPeriod = {
  ym: string;
  name: string;
  metrics: {
    worked: number;
    newTaken: number;
    calls: number;
    qualification: number;
    newScheduled: number;
    newConducted: number;
    repeatConducted: number;
    confirmedOrders: number;
  };
  conversions: {
    qualificationRate: number | null;
    scheduledGepRate: number | null;
    conductedGepRate: number | null;
    confirmedOrderRate: number | null;
  };
};

function formatMonthName(ym: string): string {
  const [yy, mm] = ym.split('-').map(Number);
  const d = new Date(yy, mm - 1, 1);
  const raw = d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function buildSalesDashboardPeriod(
  allReports: FullReport[],
  monthYm: string,
  filterManager: string,
): SalesDashboardPeriod | null {
  const bounds = calendarMonthFromYm(monthYm);
  if (!bounds) return null;

  const source = allReports.filter((r) => {
    const matchManager = filterManager === 'Все' || r.manager === filterManager;
    return matchManager && reportDateMatchesAdminBounds(r.date, bounds);
  });

  const summaryReports = dedupeReportsByDayManager(source);

  let worked = 0;
  let newTaken = 0;
  let calls = 0;
  let qualification = 0;
  let newScheduled = 0;
  let newConducted = 0;
  let repeatConducted = 0;

  for (const r of summaryReports) {
    worked += r.stats.processedTotal;
    newTaken += r.stats.newInWork;
    calls += r.stats.callsTotal;
    qualification += r.stats.validatedTotal;
    newScheduled += countAssignedNewMeetings(r);
    newConducted += countConductedNewMeetings(r, allReports);
    repeatConducted += countConductedRepeatMeetings(r);
  }

  const confirmedOrders = countCounterpartiesConductedNewWithOrder(summaryReports, allReports);

  return {
    ym: monthYm,
    name: formatMonthName(monthYm),
    metrics: {
      worked,
      newTaken,
      calls,
      qualification,
      newScheduled,
      newConducted,
      repeatConducted,
      confirmedOrders,
    },
    conversions: {
      qualificationRate: kpiConversionPercent(qualification, calls),
      scheduledGepRate: kpiConversionPercent(newScheduled, qualification),
      conductedGepRate: kpiConversionPercent(newConducted, newScheduled),
      confirmedOrderRate: kpiConversionPercent(confirmedOrders, newConducted),
    },
  };
}

export function collectReportMonthYms(allReports: FullReport[]): string[] {
  const seen = new Set<string>();
  for (const r of allReports) {
    if (r.date.length >= 7) seen.add(r.date.slice(0, 7));
  }
  return Array.from(seen).sort((a, b) => b.localeCompare(a));
}

export const DAILY_CALL_GOAL = 22;
export const DAILY_NEW_MEETINGS_GOAL = 2;

export type KpiEightMetrics = {
  uniqueSuppliers: number;
  calls: number;
  newMeetings: number;
  repeatMeetings: number;
  nextActions: number;
  tasks: number;
  transitions: number;
  blockersResolved: number;
};

export type WorkItemKpiSlice = {
  nextActions: number;
  tasks: number;
};

export type KpiPeriodSummary = {
  periodLabel: string;
  isDefaultMonth: boolean;
  reportsCount: number;
  metrics: KpiEightMetrics;
  conversions: {
    /** Новые встречи ÷ Звонки */
    meetingsFromCallsRate: number | null;
    /** Переходы ÷ Новые встречи */
    transitionsRate: number | null;
    /** Проведено новых ÷ Назначено (без изменений) */
    conductedGepRate: number | null;
    /** Подтвержден заказ (без изменений) */
    confirmedOrderRate: number | null;
  };
};

export type RnpPaceRow = {
  manager: string;
  callsFact: number;
  callsPlan: number;
  callsDelta: number;
  newMeetingsFact: number;
  newMeetingsPlan: number;
  newMeetingsDelta: number;
  transitionsFact: number;
};

export type WorkItemRowLike = {
  reportDate: string;
  managerName: string;
  nextStep: string;
  status: string;
};

export type BlockerCountRow = {
  managerName: string;
  reportDate: string;
  resolvedCount: number;
};

export function aggregateWorkItemKpi(items: WorkItemRowLike[]): WorkItemKpiSlice {
  let nextActions = 0;
  let tasks = 0;
  for (const it of items) {
    if (it.nextStep.trim()) nextActions += 1;
    if (it.status === 'done') tasks += 1;
  }
  return { nextActions, tasks };
}

export function buildKpiRowMetrics(
  report: FullReport,
  allReports: FullReport[],
  workItemSlice: WorkItemKpiSlice,
  blockersResolved: number,
): KpiEightMetrics {
  return {
    uniqueSuppliers: report.stats.processedTotal,
    calls: report.stats.callsTotal,
    newMeetings: countConductedNewMeetings(report, allReports),
    repeatMeetings: countConductedRepeatMeetings(report),
    nextActions: workItemSlice.nextActions,
    tasks: workItemSlice.tasks,
    transitions: report.stats.stageTransitions ?? 0,
    blockersResolved,
  };
}

export function sumKpiEightMetrics(rows: KpiEightMetrics[]): KpiEightMetrics {
  const init: KpiEightMetrics = {
    uniqueSuppliers: 0,
    calls: 0,
    newMeetings: 0,
    repeatMeetings: 0,
    nextActions: 0,
    tasks: 0,
    transitions: 0,
    blockersResolved: 0,
  };
  for (const r of rows) {
    init.uniqueSuppliers += r.uniqueSuppliers;
    init.calls += r.calls;
    init.newMeetings += r.newMeetings;
    init.repeatMeetings += r.repeatMeetings;
    init.nextActions += r.nextActions;
    init.tasks += r.tasks;
    init.transitions += r.transitions;
    init.blockersResolved += r.blockersResolved;
  }
  return init;
}

export function buildKpiConversions(
  metrics: KpiEightMetrics,
  assignedNew = 0,
  confirmedOrders = 0,
): KpiPeriodSummary['conversions'] {
  return {
    meetingsFromCallsRate: kpiConversionPercent(metrics.newMeetings, metrics.calls),
    transitionsRate: kpiConversionPercent(metrics.transitions, metrics.newMeetings),
    conductedGepRate: kpiConversionPercent(metrics.newMeetings, assignedNew),
    confirmedOrderRate: kpiConversionPercent(confirmedOrders, metrics.newMeetings),
  };
}

export function groupWorkItemsByReportKey(
  items: WorkItemRowLike[],
): Map<string, WorkItemKpiSlice> {
  const map = new Map<string, WorkItemKpiSlice>();
  const buckets = new Map<string, WorkItemRowLike[]>();
  for (const it of items) {
    const key = `${it.reportDate}|${it.managerName}`;
    const list = buckets.get(key) || [];
    list.push(it);
    buckets.set(key, list);
  }
  for (const [key, list] of buckets) {
    map.set(key, aggregateWorkItemKpi(list));
  }
  return map;
}

export function groupBlockersByReportKey(rows: BlockerCountRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.reportDate}|${r.managerName}`;
    map.set(key, (map.get(key) || 0) + r.resolvedCount);
  }
  return map;
}

export function monthElapsedPercent(now = new Date()): {
  percent: number;
  label: string;
  daysInMonth: number;
  dayOfMonth: number;
} {
  const y = now.getFullYear();
  const m = now.getMonth();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const percent = daysInMonth > 0 ? (dayOfMonth / daysInMonth) * 100 : 0;
  const label = now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  return { percent, label, daysInMonth, dayOfMonth };
}

export function currentMonthBounds(now = new Date()): { from: string; to: string; ym: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  const pad = (n: number) => String(n).padStart(2, '0');
  const mo = pad(m + 1);
  const day = pad(now.getDate());
  return { from: `${y}-${mo}-01`, to: `${y}-${mo}-${day}`, ym: `${y}-${mo}` };
}

export function buildRnpPaceRows(allReports: FullReport[], managerNames: string[]): RnpPaceRow[] {
  const { from, to } = currentMonthBounds();
  const elapsed = monthElapsedPercent();
  const callsPlanMonth = DAILY_CALL_GOAL * elapsed.daysInMonth;
  const meetingsPlanMonth = DAILY_NEW_MEETINGS_GOAL * elapsed.daysInMonth;
  const expectedCalls = Math.round(callsPlanMonth * (elapsed.percent / 100));
  const expectedMeetings = Math.round(meetingsPlanMonth * (elapsed.percent / 100));

  const source = allReports.filter((r) => r.date >= from && r.date <= to);
  const summaryReports = dedupeReportsByDayManager(source);

  const byManager = new Map<string, { calls: number; newMeetings: number; transitions: number }>();
  for (const name of managerNames) {
    if (name !== 'Все') byManager.set(name, { calls: 0, newMeetings: 0, transitions: 0 });
  }

  for (const r of summaryReports) {
    const cur = byManager.get(r.manager) || { calls: 0, newMeetings: 0, transitions: 0 };
    cur.calls += r.stats.callsTotal;
    cur.newMeetings += countConductedNewMeetings(r, allReports);
    cur.transitions += r.stats.stageTransitions ?? 0;
    byManager.set(r.manager, cur);
  }

  return Array.from(byManager.entries())
    .sort((a, b) => a[0].localeCompare(b[0], 'ru'))
    .map(([manager, fact]) => ({
      manager,
      callsFact: fact.calls,
      callsPlan: callsPlanMonth,
      callsDelta: fact.calls - expectedCalls,
      newMeetingsFact: fact.newMeetings,
      newMeetingsPlan: meetingsPlanMonth,
      newMeetingsDelta: fact.newMeetings - expectedMeetings,
      transitionsFact: fact.transitions,
    }));
}

export function formatKpiDeltaBadge(delta: number): { text: string; tone: 'good' | 'bad' | 'neutral' } {
  if (delta < 0) {
    return { text: `▼ ${delta} (Отстает)`, tone: 'bad' };
  }
  if (delta > 0) {
    return { text: `▲ +${delta} (Опережает)`, tone: 'good' };
  }
  return { text: '▲ В темпе', tone: 'good' };
}
