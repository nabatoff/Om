import type { FullReport } from './crmApi';
import { calendarMonthFromYm, reportDateMatchesAdminBounds } from './periodBounds';
import { isAdminStaffName } from './staffDept';

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

/**
 * Считаем план (assigned) и факт (conducted) одной и той же встречей, даже если тип отличается:
 * «Новая»/«Повторная» — это одна и та же физическая встреча, тип которой мог автоматически
 * пересчитаться на сохранении (см. resolveEnterpriseMeetingType). «Крупный лид» — отдельная
 * категория и должна совпадать точно, чтобы не путать её с обычной встречей.
 */
export function meetingTypesLinkable(a: string, b: string): boolean {
  if (normalizeKpiMeetingType(a) === normalizeKpiMeetingType(b)) return true;
  const aOrdinary = isNewMeetingType(a) || isRepeatMeetingType(a);
  const bOrdinary = isNewMeetingType(b) || isRepeatMeetingType(b);
  return aOrdinary && bOrdinary;
}

/** Крупный клиент: первую встречу нельзя ставить «Новая» — только «Крупный лид», дальше «Повторная». */
export function resolveEnterpriseMeetingType(opts: {
  type: string;
  isEnterprise: boolean;
  hasPriorKrup: boolean;
  hasPriorNew: boolean;
}): string {
  if (opts.hasPriorNew && isNewMeetingType(opts.type)) return 'Повторная';
  if (!opts.isEnterprise) return opts.type;
  if (isNewMeetingType(opts.type)) return opts.hasPriorKrup ? 'Повторная' : 'Крупный лид';
  return opts.type;
}

/** Уже проведённые «Новая» / «Крупный лид» по БИН (план назначенной не считаем). */
export function collectConductedMeetingBins(
  reports: Array<{ id?: string; conductedMeetings: Array<{ bin: string; type: string }> }>,
  excludeReportId?: string,
): { newBins: Set<string>; krupBins: Set<string> } {
  const newBins = new Set<string>();
  const krupBins = new Set<string>();
  for (const r of reports) {
    if (excludeReportId && r.id === excludeReportId) continue;
    for (const m of r.conductedMeetings) {
      const b = normalizeKpiBin(m.bin);
      if (!b) continue;
      if (isEnterpriseLeadMeetingType(m.type)) krupBins.add(b);
      if (isNewMeetingType(m.type)) newBins.add(b);
    }
  }
  return { newBins, krupBins };
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

/** «Назначено встреч» = обычные назначенные «Новая» + назначенные «Крупный лид». */
export function countAssignedNewOrKrupMeetings(report: FullReport): number {
  return report.assignedMeetings.filter((m) => isNewMeetingType(m.type) || isEnterpriseLeadMeetingType(m.type)).length;
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
    const hasEvidence = targetReports.some((lr) =>
      lr.conductedMeetings.some(
        (cm) =>
          normalizeKpiBin(cm.bin) === plannedBin &&
          normalizeKpiText(cm.entityName) === plannedName &&
          meetingTypesLinkable(cm.type, assigned.type) &&
          cm.date >= assigned.date,
      ),
    );
    if (hasEvidence) count += 1;
  }
  return count;
}

/** Проведённые «Крупный лид» — сами по себе первая встреча, привязки к плану не требуют. */
export function countConductedKrupMeetings(report: FullReport): number {
  return report.conductedMeetings.filter((m) => isEnterpriseLeadMeetingType(m.type)).length;
}

/** «Проведено новых» = обычные первые встречи + первые встречи с крупными («Крупный лид»). */
export function countConductedNewOrKrupMeetings(report: FullReport, allReports: FullReport[]): number {
  return countConductedNewMeetings(report, allReports) + countConductedKrupMeetings(report);
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

/** Все проведённые встречи в отчёте (новые + повторные + крупные). */
export function countConductedFactMeetings(report: FullReport): number {
  return report.conductedMeetings.length;
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
/** В дневной карточке РНП: >2 встреч = зелёный, 0 = красный */
export const DAILY_MEETINGS_GREEN = 3;
/** План новых встреч на календарный месяц (не дневная норма). */
export const MONTHLY_NEW_MEETINGS_GOAL = 25;
/** @deprecated используй MONTHLY_NEW_MEETINGS_GOAL */
export const DAILY_NEW_MEETINGS_GOAL = MONTHLY_NEW_MEETINGS_GOAL;

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
    /** Назначено ÷ Квал (из квала в назначенные) */
    assignedFromQualRate: number | null;
    /** Переходы ÷ Новые встречи */
    transitionsRate: number | null;
    /** Проведено новых ÷ Назначено (без изменений) */
    conductedGepRate: number | null;
    /** Подтвержден заказ (без изменений) */
    confirmedOrderRate: number | null;
  };
};

export type RnpDayFact = {
  date: string;
  /** null — нет отчёта за день */
  calls: number | null;
  meetings: number | null;
};

export type RnpPaceRow = {
  manager: string;
  callsFact: number;
  /** План на «сегодня» внутри периода (рабочие дни с from по asOf × дневная норма) */
  callsPlan: number;
  /** План на весь выбранный период (только рабочие дни) */
  callsPlanMonth: number;
  callsDelta: number;
  newMeetingsFact: number;
  newMeetingsPlan: number;
  newMeetingsPlanMonth: number;
  newMeetingsDelta: number;
  transitionsFact: number;
  days: RnpDayFact[];
};

export type RnpPaceMeta = {
  from: string;
  to: string;
  asOf: string;
  workingDaysInPeriod: number;
  workingDaysElapsed: number;
  percent: number;
  label: string;
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
  validated = 0,
): KpiPeriodSummary['conversions'] {
  return {
    assignedFromQualRate: kpiConversionPercent(assignedNew, validated),
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

/** Пн–Пт считаем рабочими (без учёта праздников). */
export function isWorkingDay(d: Date): boolean {
  const day = d.getDay();
  return day !== 0 && day !== 6;
}

export function countWorkingDaysInRange(from: Date, to: Date): number {
  if (to < from) return 0;
  let n = 0;
  const cur = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  while (cur <= end) {
    if (isWorkingDay(cur)) n += 1;
    cur.setDate(cur.getDate() + 1);
  }
  return n;
}

export function monthWorkingDayStats(now = new Date()): {
  workingDaysInMonth: number;
  workingDaysElapsed: number;
  percent: number;
  label: string;
  daysInMonth: number;
  dayOfMonth: number;
} {
  const y = now.getFullYear();
  const m = now.getMonth();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const monthStart = new Date(y, m, 1);
  const monthEnd = new Date(y, m, daysInMonth);
  const today = new Date(y, m, dayOfMonth);
  const workingDaysInMonth = countWorkingDaysInRange(monthStart, monthEnd);
  const workingDaysElapsed = countWorkingDaysInRange(monthStart, today);
  const percent = workingDaysInMonth > 0 ? (workingDaysElapsed / workingDaysInMonth) * 100 : 0;
  const label = now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  return { workingDaysInMonth, workingDaysElapsed, percent, label, daysInMonth, dayOfMonth };
}

export function parseYmdLocal(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((ymd || '').trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  if (!Number.isFinite(y) || mo < 0 || mo > 11 || d < 1 || d > 31) return null;
  return new Date(y, mo, d);
}

export function formatYmdLocalDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function periodWorkingDayStats(
  periodFrom: string,
  periodTo: string,
  now = new Date(),
): RnpPaceMeta {
  const from = parseYmdLocal(periodFrom);
  const to = parseYmdLocal(periodTo);
  if (!from || !to || to < from) {
    return {
      from: periodFrom,
      to: periodTo,
      asOf: periodFrom,
      workingDaysInPeriod: 0,
      workingDaysElapsed: 0,
      percent: 0,
      label: '—',
    };
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let asOf: Date;
  if (today < from) asOf = new Date(from.getTime());
  else if (today > to) asOf = new Date(to.getTime());
  else asOf = today;

  const workingDaysInPeriod = countWorkingDaysInRange(from, to);
  const workingDaysElapsed =
    today < from ? 0 : countWorkingDaysInRange(from, asOf);
  const percent = workingDaysInPeriod > 0 ? (workingDaysElapsed / workingDaysInPeriod) * 100 : 0;
  const label = asOf.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

  return {
    from: formatYmdLocalDate(from),
    to: formatYmdLocalDate(to),
    asOf: formatYmdLocalDate(asOf),
    workingDaysInPeriod,
    workingDaysElapsed,
    percent,
    label,
  };
}

/** @deprecated use monthWorkingDayStats — оставлено для совместимости */
export function monthElapsedPercent(now = new Date()): {
  percent: number;
  label: string;
  daysInMonth: number;
  dayOfMonth: number;
} {
  const s = monthWorkingDayStats(now);
  return {
    percent: s.percent,
    label: s.label,
    daysInMonth: s.daysInMonth,
    dayOfMonth: s.dayOfMonth,
  };
}

export function currentMonthBounds(now = new Date()): { from: string; to: string; ym: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  const pad = (n: number) => String(n).padStart(2, '0');
  const mo = pad(m + 1);
  const day = pad(now.getDate());
  return { from: `${y}-${mo}-01`, to: `${y}-${mo}-${day}`, ym: `${y}-${mo}` };
}

export function enumerateYmdRange(fromYmd: string, toYmd: string): string[] {
  const from = parseYmdLocal(fromYmd);
  const to = parseYmdLocal(toYmd);
  if (!from || !to || to < from) return [];
  const out: string[] = [];
  const cur = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  while (cur <= end) {
    out.push(formatYmdLocalDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function buildRnpPaceRows(
  allReports: FullReport[],
  managerNames: string[],
  periodFrom: string,
  periodTo: string,
): { rows: RnpPaceRow[]; meta: RnpPaceMeta; days: string[] } {
  const meta = periodWorkingDayStats(periodFrom, periodTo);
  const callsPlanPeriod = DAILY_CALL_GOAL * meta.workingDaysInPeriod;
  const callsPlanToDate = DAILY_CALL_GOAL * meta.workingDaysElapsed;

  const fromDate = parseYmdLocal(meta.from);
  let workingDaysInRefMonth = meta.workingDaysInPeriod;
  if (fromDate) {
    const monthStart = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
    const monthEnd = new Date(fromDate.getFullYear(), fromDate.getMonth() + 1, 0);
    workingDaysInRefMonth = Math.max(1, countWorkingDaysInRange(monthStart, monthEnd));
  }
  const meetingsPlanPeriod = Math.round(
    MONTHLY_NEW_MEETINGS_GOAL * (meta.workingDaysInPeriod / workingDaysInRefMonth),
  );
  const meetingsPlanToDate = Math.round(
    MONTHLY_NEW_MEETINGS_GOAL * (meta.workingDaysElapsed / workingDaysInRefMonth),
  );

  const days = enumerateYmdRange(meta.from, meta.asOf);
  const source = allReports.filter((r) => r.date >= meta.from && r.date <= meta.asOf);
  const summaryReports = dedupeReportsByDayManager(source);

  const byManager = new Map<string, { calls: number; conductedMeetings: number; transitions: number }>();
  const dayMap = new Map<string, { calls: number; meetings: number }>();
  for (const name of managerNames) {
    if (!name || name === 'Все' || isAdminStaffName(name)) continue;
    byManager.set(name, { calls: 0, conductedMeetings: 0, transitions: 0 });
  }

  for (const r of summaryReports) {
    if (!byManager.has(r.manager)) continue;
    const cur = byManager.get(r.manager)!;
    const meetings = countConductedFactMeetings(r);
    cur.calls += r.stats.callsTotal;
    cur.conductedMeetings += meetings;
    cur.transitions += r.stats.stageTransitions ?? 0;
    dayMap.set(`${r.manager}|${r.date}`, { calls: r.stats.callsTotal, meetings });
  }

  const rows = Array.from(byManager.entries())
    .sort((a, b) => a[0].localeCompare(b[0], 'ru'))
    .map(([manager, fact]) => ({
      manager,
      callsFact: fact.calls,
      callsPlan: callsPlanToDate,
      callsPlanMonth: callsPlanPeriod,
      callsDelta: fact.calls - callsPlanToDate,
      newMeetingsFact: fact.conductedMeetings,
      newMeetingsPlan: meetingsPlanToDate,
      newMeetingsPlanMonth: meetingsPlanPeriod,
      newMeetingsDelta: fact.conductedMeetings - meetingsPlanToDate,
      transitionsFact: fact.transitions,
      days: days.map((date) => {
        const cell = dayMap.get(`${manager}|${date}`);
        return cell
          ? { date, calls: cell.calls, meetings: cell.meetings }
          : { date, calls: null, meetings: null };
      }),
    }));

  return { rows, meta, days };
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
