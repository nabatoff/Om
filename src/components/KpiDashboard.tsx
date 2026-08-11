import { useEffect, useMemo, useState, type Dispatch, SetStateAction } from 'react';
import { Trash2 } from 'lucide-react';
import type { FullReport } from '../lib/crmApi';
import {
  leadTransferredDay,
  listEnterpriseLeadsApi,
  type EnterpriseLead,
} from '../lib/enterpriseLeadsApi';
import { countResolvedBlockersApi } from '../lib/managerBlockersApi';
import { listManagerWorkItemsPeriodApi } from '../lib/managerWorkItemsApi';
import { adminDateFilterBounds } from '../lib/periodBounds';
import type { StaffDept } from '../lib/staffDept';
import {
  buildKpiConversions,
  buildKpiRowMetrics,
  buildRnpPaceRows,
  dedupeReportsByDayManager,
  formatKpiPercent,
  groupBlockersByReportKey,
  groupWorkItemsByReportKey,
  kpiConversionPercent,
  sumKpiEightMetrics,
  type KpiEightMetrics,
} from '../lib/kpiMetrics';
import { reportDateMatchesAdminBounds } from '../lib/periodBounds';
import { AdminFilters } from './AdminFilters';
import { RnpPacePanel } from './RnpPacePanel';

type SetState<T> = Dispatch<SetStateAction<T>>;

function formatDisplayDate(raw: string): string {
  const t = (raw || '').trim();
  const ymd = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return `${ymd[3]}-${ymd[2]}-${ymd[1]}`;
  return t;
}

const METRIC_CARDS: { key: keyof KpiEightMetrics; label: string; short: string; className: string }[] = [
  { key: 'uniqueSuppliers', label: 'Уник. поставщики', short: 'Уник. поставщики', className: 'bg-gray-50 border-gray-100 text-gray-800' },
  { key: 'calls', label: 'Звонки', short: 'Звонки', className: 'bg-emerald-50/50 border-emerald-100/50 text-emerald-700' },
  { key: 'newMeetings', label: 'Новые встречи', short: 'Новые встречи', className: 'bg-indigo-50/50 border-indigo-100/50 text-indigo-700' },
  { key: 'repeatMeetings', label: 'Повт. встречи', short: 'Повт. встречи', className: 'bg-amber-50/50 border-amber-100/50 text-amber-700' },
  { key: 'nextActions', label: 'След. действия', short: 'След. действия', className: 'bg-cyan-50/50 border-cyan-100/50 text-cyan-700' },
  { key: 'tasks', label: 'Задачи', short: 'Задачи', className: 'bg-blue-50/50 border-blue-100/50 text-blue-700' },
  { key: 'transitions', label: 'Переходы этапа', short: 'Переходы', className: 'bg-purple-50/50 border-purple-100/50 text-purple-700' },
  { key: 'blockersResolved', label: 'Блокеры (снято)', short: 'Блокеры', className: 'bg-rose-50/50 border-rose-100/50 text-rose-700' },
];

type Props = {
  allReports: FullReport[];
  reports: FullReport[];
  filterManager: string;
  setFilterManager: SetState<string>;
  filterDateFrom: string;
  setFilterDateFrom: SetState<string>;
  filterDateTo: string;
  setFilterDateTo: SetState<string>;
  managerOptions: string[];
  staffDept: StaffDept;
  setStaffDept: (dept: StaffDept) => void;
  onDeleteReport?: (reportId: string) => void;
};

export function KpiDashboard({
  allReports,
  reports,
  filterManager,
  setFilterManager,
  filterDateFrom,
  setFilterDateFrom,
  filterDateTo,
  setFilterDateTo,
  managerOptions,
  staffDept,
  setStaffDept,
  onDeleteReport,
}: Props) {
  const isDiggerKpi = staffDept === 'diggers';
  const kpiTablePeriod = useMemo(
    () => adminDateFilterBounds(filterDateFrom, filterDateTo),
    [filterDateFrom, filterDateTo],
  );
  const kpiTablePeriodLabel = `${formatDisplayDate(kpiTablePeriod.from)} — ${formatDisplayDate(kpiTablePeriod.to)}${
    kpiTablePeriod.isDefaultMonth ? ' · текущий месяц по умолчанию' : ''
  }`;

  const [enterpriseLeads, setEnterpriseLeads] = useState<EnterpriseLead[]>([]);
  const [workItemRows, setWorkItemRows] = useState<
    Awaited<ReturnType<typeof listManagerWorkItemsPeriodApi>>
  >([]);
  const [blockerCounts, setBlockerCounts] = useState<Awaited<ReturnType<typeof countResolvedBlockersApi>>>([]);

  useEffect(() => {
    if (isDiggerKpi) {
      setEnterpriseLeads([]);
      return;
    }
    let cancelled = false;
    void listEnterpriseLeadsApi('all')
      .then((rows) => {
        if (!cancelled) setEnterpriseLeads(rows);
      })
      .catch(() => {
        if (!cancelled) setEnterpriseLeads([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isDiggerKpi]);

  useEffect(() => {
    if (isDiggerKpi) {
      setWorkItemRows([]);
      setBlockerCounts([]);
      return;
    }
    let cancelled = false;
    const bounds = adminDateFilterBounds(filterDateFrom, filterDateTo);
    void Promise.all([
      listManagerWorkItemsPeriodApi(bounds.from, bounds.to),
      countResolvedBlockersApi(bounds.from, bounds.to),
    ])
      .then(([wi, bl]) => {
        if (!cancelled) {
          setWorkItemRows(wi);
          setBlockerCounts(bl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setWorkItemRows([]);
          setBlockerCounts([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isDiggerKpi, filterDateFrom, filterDateTo]);

  const kpiRows = useMemo(
    () =>
      dedupeReportsByDayManager(reports).sort(
        (a, b) => b.date.localeCompare(a.date) || a.manager.localeCompare(b.manager, 'ru'),
      ),
    [reports],
  );

  const workItemsByKey = useMemo(
    () =>
      groupWorkItemsByReportKey(
        workItemRows.map((w) => ({
          reportDate: w.reportDate,
          managerName: w.managerName,
          nextStep: w.nextStep,
          status: w.status,
        })),
      ),
    [workItemRows],
  );

  const blockersByKey = useMemo(
    () =>
      groupBlockersByReportKey(
        blockerCounts.map((b) => ({
          managerName: b.managerName,
          reportDate: b.reportDate,
          resolvedCount: b.resolvedCount,
        })),
      ),
    [blockerCounts],
  );

  const diggerLeadsInPeriod = useMemo(() => {
    const bounds = adminDateFilterBounds(filterDateFrom, filterDateTo);
    return enterpriseLeads.filter((l) => {
      if (l.routingStatus === 'returned_to_smb') return false;
      const day = leadTransferredDay(l);
      if (!reportDateMatchesAdminBounds(day, bounds)) return false;
      if (filterManager !== 'Все' && l.creatorName !== filterManager) return false;
      return true;
    });
  }, [enterpriseLeads, filterDateFrom, filterDateTo, filterManager]);

  const diggerStats = useMemo(() => {
    let processed = 0;
    let newInWork = 0;
    let calls = 0;
    let validated = 0;
    for (const r of kpiRows) {
      processed += r.stats.processedTotal;
      newInWork += r.stats.newInWork;
      calls += r.stats.callsTotal;
      validated += r.stats.validatedTotal;
    }
    return { processed, newInWork, calls, validated };
  }, [kpiRows]);

  const diggerTransferTotals = useMemo(() => {
    const transferred = diggerLeadsInPeriod.length;
    const completed = diggerLeadsInPeriod.filter((l) => l.meetingStatus === 'completed').length;
    return {
      transferred,
      completed,
      conversion: kpiConversionPercent(completed, transferred),
    };
  }, [diggerLeadsInPeriod]);

  const transferredByManagerDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of diggerLeadsInPeriod) {
      const day = leadTransferredDay(l);
      const key = `${l.creatorName}||${day}`;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [diggerLeadsInPeriod]);

  const managerKpiSummary = useMemo(() => {
    const bounds = adminDateFilterBounds(filterDateFrom, filterDateTo);
    const periodLabel = `${formatDisplayDate(bounds.from)} — ${formatDisplayDate(bounds.to)}`;
    const monthPrefix = bounds.from.slice(0, 7);
    const rowMetrics = kpiRows.map((r) => {
      const wi = workItemsByKey.get(`${r.date}|${r.manager}`) || { nextActions: 0, tasks: 0 };
      const bl = blockersByKey.get(`${r.date}|${r.manager}`) || 0;
      return buildKpiRowMetrics(r, allReports, wi, bl);
    });
    const metrics = sumKpiEightMetrics(rowMetrics);
    return {
      monthPrefix,
      periodLabel,
      isDefaultMonth: bounds.isDefaultMonth,
      reportsCount: kpiRows.length,
      metrics,
      conversions: buildKpiConversions(metrics),
    };
  }, [kpiRows, allReports, workItemsByKey, blockersByKey, filterDateFrom, filterDateTo]);

  const rnpRows = useMemo(() => {
    if (isDiggerKpi) return [];
    const names = managerOptions.filter((m) => m !== 'Все');
    return buildRnpPaceRows(allReports, names);
  }, [allReports, managerOptions, isDiggerKpi]);

  const rowMetricsMap = useMemo(() => {
    const map = new Map<string, KpiEightMetrics>();
    for (const r of kpiRows) {
      const wi = workItemsByKey.get(`${r.date}|${r.manager}`) || { nextActions: 0, tasks: 0 };
      const bl = blockersByKey.get(`${r.date}|${r.manager}`) || 0;
      map.set(r.id, buildKpiRowMetrics(r, allReports, wi, bl));
    }
    return map;
  }, [kpiRows, allReports, workItemsByKey, blockersByKey]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
      <AdminFilters
        manager={filterManager}
        setManager={setFilterManager}
        from={filterDateFrom}
        setFrom={setFilterDateFrom}
        to={filterDateTo}
        setTo={setFilterDateTo}
        managerOptions={managerOptions}
        staffDept={staffDept}
        setStaffDept={setStaffDept}
        onReset={() => {
          setStaffDept('all');
          setFilterManager('Все');
          const b = adminDateFilterBounds('', '');
          setFilterDateFrom(b.from);
          setFilterDateTo(b.to);
        }}
      />

      <section className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 shadow-sm">
        <div className="mb-3 text-left">
          <h3 className="text-[11px] font-bold text-gray-700 uppercase tracking-widest">
            {isDiggerKpi
              ? managerKpiSummary.isDefaultMonth
                ? `KPI лидорубов за месяц (${managerKpiSummary.monthPrefix})`
                : 'KPI лидорубов за период'
              : managerKpiSummary.isDefaultMonth
                ? `Общая сводка за месяц (${managerKpiSummary.monthPrefix})`
                : 'Общая сводка за период'}
          </h3>
          <p className="text-[10px] text-gray-500 mt-1">
            {managerKpiSummary.periodLabel}
            {' · '}
            {isDiggerKpi ? 'лидоруб' : 'менеджер'}: {filterManager === 'Все' ? 'все' : filterManager}
            {staffDept === 'diggers' ? ' · отдел: лидорубы' : staffDept === 'managers' ? ' · отдел: менеджеры' : ''}
            . Отчётов: {managerKpiSummary.reportsCount}
          </p>
        </div>

        {isDiggerKpi ? (
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
            <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-left">
              <p className="text-[10px] text-gray-500 font-bold uppercase">Отработано</p>
              <p className="text-lg font-black text-gray-900">{diggerStats.processed}</p>
            </div>
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-left">
              <p className="text-[10px] text-emerald-700 font-bold uppercase">Взято новых</p>
              <p className="text-lg font-black text-emerald-800">{diggerStats.newInWork}</p>
            </div>
            <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-3 text-left">
              <p className="text-[10px] text-indigo-700 font-bold uppercase">Звонки</p>
              <p className="text-lg font-black text-indigo-800">{diggerStats.calls}</p>
            </div>
            <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-left">
              <p className="text-[10px] text-amber-700 font-bold uppercase">Квалификация</p>
              <p className="text-lg font-black text-amber-800">{diggerStats.validated}</p>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-left">
              <p className="text-[10px] text-slate-700 font-bold uppercase">Передано</p>
              <p className="text-lg font-black text-slate-900">{diggerTransferTotals.transferred}</p>
            </div>
            <div className="rounded-xl bg-teal-50 border border-teal-100 p-3 text-left">
              <p className="text-[10px] text-teal-700 font-bold uppercase">Проведено по крупным</p>
              <p className="text-lg font-black text-teal-800">{diggerTransferTotals.completed}</p>
            </div>
            <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-left">
              <p className="text-[10px] text-blue-700 font-bold uppercase">Конверсия</p>
              <p className="text-lg font-black text-blue-800">{formatKpiPercent(diggerTransferTotals.conversion)}</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            {METRIC_CARDS.map((card) => (
              <div key={card.key} className={`p-4 rounded-xl border text-left ${card.className.split(' ').slice(0, 2).join(' ')}`}>
                <div className={`text-[10px] font-bold uppercase mb-2 ${card.className.split(' ').slice(2).join(' ')}`}>
                  {card.label}
                </div>
                <div className={`text-2xl font-bold ${card.className.includes('text-gray') ? 'text-slate-800' : ''}`}>
                  {managerKpiSummary.metrics[card.key]}
                </div>
              </div>
            ))}
          </div>
        )}

        {isDiggerKpi ? (
          <div className="mt-4 pt-4 border-t border-gray-100 text-left">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Конверсия по крупным</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="rounded-xl bg-slate-50/80 border border-slate-200 p-3">
                <p className="text-[10px] text-slate-700 font-bold uppercase leading-snug">Доходимость круп</p>
                <p className="text-xl font-black text-slate-900 mt-1">
                  {formatKpiPercent(diggerTransferTotals.conversion)}
                </p>
                <p className="text-[9px] text-slate-600 mt-1 leading-snug">
                  Проведено ÷ Передано × 100% (без возвратов на СМБ)
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 pt-4 border-t border-gray-100 text-left">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Конверсия</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border border-orange-100 bg-orange-50/30 p-5 rounded-xl">
                <div className="text-[11px] font-bold text-orange-700 uppercase mb-1">Интерес</div>
                <div className="text-3xl font-extrabold text-slate-800 mb-2">
                  {formatKpiPercent(managerKpiSummary.conversions.interestRate)}
                </div>
                <div className="text-[10px] text-slate-400">Звонки ÷ Уник. поставщики × 100%</div>
              </div>
              <div className="border border-slate-200 p-5 rounded-xl">
                <div className="text-[11px] font-bold text-slate-700 uppercase mb-1">Встречи</div>
                <div className="text-3xl font-extrabold text-slate-800 mb-2">
                  {formatKpiPercent(managerKpiSummary.conversions.meetingsRate)}
                </div>
                <div className="text-[10px] text-slate-400">Новые встречи ÷ Звонки × 100%</div>
              </div>
              <div className="border border-emerald-100 bg-emerald-50/30 p-5 rounded-xl">
                <div className="text-[11px] font-bold text-emerald-700 uppercase mb-1">Успех (переходы)</div>
                <div className="text-3xl font-extrabold text-slate-800 mb-2">
                  {formatKpiPercent(managerKpiSummary.conversions.successRate)}
                </div>
                <div className="text-[10px] text-slate-400">Переходы этапа ÷ Новые встречи × 100%</div>
              </div>
            </div>
          </div>
        )}
      </section>

      {!isDiggerKpi && rnpRows.length > 0 ? <RnpPacePanel rows={rnpRows} /> : null}

      <section className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-x-auto text-left">
        <div className="px-6 pt-5 pb-2 space-y-1">
          <h3 className="text-xs font-bold text-gray-700 uppercase tracking-widest">
            {isDiggerKpi ? 'Отдельный отчёт по KPI лидорубов' : 'Отдельный отчёт по KPI менеджеров (детализация по дням)'}
          </h3>
          <p className="text-[10px] text-gray-500">{kpiTablePeriodLabel}</p>
        </div>

        {isDiggerKpi ? (
          <table className="w-full text-left border-collapse min-w-[980px]">
            <thead>
              <tr className="bg-gray-50/50 text-[10px] font-bold text-gray-400 uppercase border-y border-gray-100">
                <th className="py-4 px-6">Дата отчета</th>
                <th className="py-4 px-4">Лидоруб</th>
                <th className="py-4 px-4 text-center">Отработано</th>
                <th className="py-4 px-4 text-center">Звонки</th>
                <th className="py-4 px-4 text-center">Передано</th>
                {onDeleteReport ? <th className="py-4 px-4 text-right">Действия</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {kpiRows.map((report) => (
                <tr key={`kpi-digger-${report.id}`} className="hover:bg-gray-50/50">
                  <td className="py-3.5 px-6 text-gray-600 whitespace-nowrap">{formatDisplayDate(report.date)}</td>
                  <td className="py-3.5 px-4 font-bold text-gray-800 whitespace-nowrap">{report.manager}</td>
                  <td className="py-3.5 px-4 text-center font-black text-gray-800">{report.stats.processedTotal}</td>
                  <td className="py-3.5 px-4 text-center font-black text-indigo-700">{report.stats.callsTotal}</td>
                  <td className="py-3.5 px-4 text-center font-black text-slate-800">
                    {transferredByManagerDate.get(`${report.manager}||${report.date}`) || 0}
                  </td>
                  {onDeleteReport ? (
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => onDeleteReport(report.id)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase text-red-600 border border-red-100 hover:bg-red-50"
                      >
                        <Trash2 size={12} /> Удалить
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-left border-collapse min-w-[1280px]">
            <thead>
              <tr className="bg-gray-50/50 text-[9px] font-bold text-gray-400 uppercase border-y border-gray-100">
                <th className="py-4 px-4">Дата отчета</th>
                <th className="py-4 px-4">Менеджер</th>
                {METRIC_CARDS.map((c) => (
                  <th key={c.key} className="py-4 px-4 text-center whitespace-nowrap">
                    {c.short.toUpperCase()}
                  </th>
                ))}
                {onDeleteReport ? <th className="py-4 px-4 text-right">Действия</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-sm">
              {kpiRows.map((report) => {
                const m = rowMetricsMap.get(report.id);
                if (!m) return null;
                return (
                  <tr key={`kpi-${report.id}`} className="hover:bg-gray-50/50">
                    <td className="py-3.5 px-4 text-gray-500 text-xs whitespace-nowrap">{formatDisplayDate(report.date)}</td>
                    <td className="py-3.5 px-4 font-bold text-gray-800 whitespace-nowrap">{report.manager}</td>
                    <td className="py-3.5 px-4 text-center font-bold text-gray-700">{m.uniqueSuppliers}</td>
                    <td className="py-3.5 px-4 text-center font-bold text-emerald-600">{m.calls}</td>
                    <td className="py-3.5 px-4 text-center font-bold text-indigo-600">{m.newMeetings}</td>
                    <td className="py-3.5 px-4 text-center font-bold text-amber-600">{m.repeatMeetings}</td>
                    <td className="py-3.5 px-4 text-center font-bold text-cyan-600">{m.nextActions}</td>
                    <td className="py-3.5 px-4 text-center font-bold text-blue-600">{m.tasks}</td>
                    <td className="py-3.5 px-4 text-center font-bold text-purple-600">{m.transitions}</td>
                    <td className="py-3.5 px-4 text-center font-bold text-rose-600">{m.blockersResolved}</td>
                    {onDeleteReport ? (
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => onDeleteReport(report.id)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase text-red-600 border border-red-100 hover:bg-red-50"
                        >
                          <Trash2 size={12} /> Удалить
                        </button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
