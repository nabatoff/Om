import type { FullReport } from './crmApi';
import { calendarMonthFromYm, reportDateMatchesAdminBounds } from './periodBounds';

export function normalizeKpiMeetingType(value: string): string {
  return value.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
}

export function isNewMeetingType(type: string): boolean {
  return normalizeKpiMeetingType(type).startsWith('нов');
}

export function isRepeatMeetingType(type: string): boolean {
  return normalizeKpiMeetingType(type).startsWith('повтор');
}

function normalizeKpiText(value: string): string {
  return value.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
}

function normalizeKpiBin(value: string): string {
  return value.replace(/\D/g, '');
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
