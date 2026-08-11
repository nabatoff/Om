import { useEffect, useMemo, useState, type Dispatch, SetStateAction } from 'react';
import { Trash2 } from 'lucide-react';
import type { FullReport } from '../lib/crmApi';
import {
  leadTransferredDay,
  listEnterpriseLeadsApi,
  type EnterpriseLead,
} from '../lib/enterpriseLeadsApi';
import { adminDateFilterBounds, reportDateMatchesAdminBounds } from '../lib/periodBounds';
import type { StaffDept } from '../lib/staffDept';
import {
  buildRnpPaceRows,
  countAssignedNewMeetings,
  countConductedNewMeetings,
  countConductedRepeatMeetings,
  countCounterpartiesConductedNewWithOrder,
  dedupeReportsByDayManager,
  formatKpiPercent,
  kpiConversionPercent,
} from '../lib/kpiMetrics';
import { AdminFilters } from './AdminFilters';
import { RnpPacePanel } from './RnpPacePanel';

type SetState<T> = Dispatch<SetStateAction<T>>;

function formatDisplayDate(raw: string): string {
  const t = (raw || '').trim();
  const ymd = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return `${ymd[3]}-${ymd[2]}-${ymd[1]}`;
  return t;
}

type ManagerDayMetrics = {
  uniqueSuppliers: number;
  newInWork: number;
  calls: number;
  validated: number;
  assignedNew: number;
  conductedNew: number;
  conductedRepeat: number;
  transitions: number;
};

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

  useEffect(() => {
    if (!isDiggerKpi) {
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

  const kpiRows = useMemo(
    () =>
      dedupeReportsByDayManager(reports).sort(
        (a, b) => b.date.localeCompare(a.date) || a.manager.localeCompare(b.manager, 'ru'),
      ),
    [reports],
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

  const meetingTotals = useMemo(() => {
    let assignedNew = 0;
    let conductedNew = 0;
    let conductedRepeat = 0;
    let transitions = 0;
    for (const r of kpiRows) {
      assignedNew += countAssignedNewMeetings(r);
      conductedNew += countConductedNewMeetings(r, allReports);
      conductedRepeat += countConductedRepeatMeetings(r);
      transitions += r.stats.stageTransitions ?? 0;
    }
    return { assignedNew, conductedNew, conductedRepeat, transitions };
  }, [kpiRows, allReports]);

  const managerKpiSummary = useMemo(() => {
    const bounds = adminDateFilterBounds(filterDateFrom, filterDateTo);
    const periodLabel = `${formatDisplayDate(bounds.from)} — ${formatDisplayDate(bounds.to)}`;
    const monthPrefix = bounds.from.slice(0, 7);

    let uniqueSuppliers = 0;
    let newInWork = 0;
    let calls = 0;
    let validated = 0;
    let assignedNew = 0;
    let conductedNew = 0;
    let conductedRepeat = 0;
    let transitions = 0;

    for (const r of kpiRows) {
      uniqueSuppliers += r.stats.processedTotal;
      newInWork += r.stats.newInWork;
      calls += r.stats.callsTotal;
      validated += r.stats.validatedTotal;
      assignedNew += countAssignedNewMeetings(r);
      conductedNew += countConductedNewMeetings(r, allReports);
      conductedRepeat += countConductedRepeatMeetings(r);
      transitions += r.stats.stageTransitions ?? 0;
    }

    const confirmedOrderConvNumerator = countCounterpartiesConductedNewWithOrder(kpiRows, allReports);

    return {
      monthPrefix,
      periodLabel,
      isDefaultMonth: bounds.isDefaultMonth,
      reportsCount: kpiRows.length,
      uniqueSuppliers,
      newInWork,
      calls,
      validated,
      assignedNew,
      conductedNew,
      conductedRepeat,
      transitions,
      /** 1: Новые встречи ÷ Звонки */
      meetingsFromCallsPct: kpiConversionPercent(conductedNew, calls),
      /** 2: Переходы ÷ Новые встречи */
      transitionsPct: kpiConversionPercent(transitions, conductedNew),
      /** без изменений: Проведен ГЭП */
      conductedGepPct: kpiConversionPercent(conductedNew, assignedNew),
      /** без изменений: Подтвержден заказ */
      confirmedOrderConvNumerator,
      confirmedOrderConvPct: kpiConversionPercent(confirmedOrderConvNumerator, conductedNew),
    };
  }, [kpiRows, allReports, filterDateFrom, filterDateTo]);

  const rnpRows = useMemo(() => {
    if (isDiggerKpi) return [];
    const names = managerOptions.filter((m) => m !== 'Все');
    return buildRnpPaceRows(allReports, names);
  }, [allReports, managerOptions, isDiggerKpi]);

  const rowMetricsMap = useMemo(() => {
    const map = new Map<string, ManagerDayMetrics>();
    for (const r of kpiRows) {
      map.set(r.id, {
        uniqueSuppliers: r.stats.processedTotal,
        newInWork: r.stats.newInWork,
        calls: r.stats.callsTotal,
        validated: r.stats.validatedTotal,
        assignedNew: countAssignedNewMeetings(r),
        conductedNew: countConductedNewMeetings(r, allReports),
        conductedRepeat: countConductedRepeatMeetings(r),
        transitions: r.stats.stageTransitions ?? 0,
      });
    }
    return map;
  }, [kpiRows, allReports]);

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
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
            <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-left">
              <p className="text-[10px] text-gray-500 font-bold uppercase leading-snug">Уник. поставщики в работе</p>
              <p className="text-lg font-black text-gray-900">{managerKpiSummary.uniqueSuppliers}</p>
            </div>
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-left">
              <p className="text-[10px] text-emerald-700 font-bold uppercase">Взято новых</p>
              <p className="text-lg font-black text-emerald-800">{managerKpiSummary.newInWork}</p>
            </div>
            <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-3 text-left">
              <p className="text-[10px] text-indigo-700 font-bold uppercase">Звонки</p>
              <p className="text-lg font-black text-indigo-800">{managerKpiSummary.calls}</p>
            </div>
            <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-left">
              <p className="text-[10px] text-amber-700 font-bold uppercase">Прошли квал</p>
              <p className="text-lg font-black text-amber-800">{managerKpiSummary.validated}</p>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-left">
              <p className="text-[10px] text-slate-700 font-bold uppercase">Назначено встреч</p>
              <p className="text-lg font-black text-slate-900">{managerKpiSummary.assignedNew}</p>
            </div>
            <div className="rounded-xl bg-teal-50 border border-teal-100 p-3 text-left">
              <p className="text-[10px] text-teal-700 font-bold uppercase">Проведено новых</p>
              <p className="text-lg font-black text-teal-800">{managerKpiSummary.conductedNew}</p>
            </div>
            <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-left">
              <p className="text-[10px] text-blue-700 font-bold uppercase">Проведено повторных</p>
              <p className="text-lg font-black text-blue-800">{managerKpiSummary.conductedRepeat}</p>
            </div>
            <div className="rounded-xl bg-purple-50 border border-purple-100 p-3 text-left">
              <p className="text-[10px] text-purple-700 font-bold uppercase">Переходы на след. этап</p>
              <p className="text-lg font-black text-purple-800">{managerKpiSummary.transitions}</p>
            </div>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-xl bg-amber-50/60 border border-amber-100 p-3">
                <p className="text-[10px] text-amber-800 font-bold uppercase leading-snug">Встречи из звонков</p>
                <p className="text-xl font-black text-amber-950 mt-1">
                  {formatKpiPercent(managerKpiSummary.meetingsFromCallsPct)}
                </p>
                <p className="text-[9px] text-amber-700/80 mt-1 leading-snug">
                  Новые встречи ÷ Звонки × 100%
                </p>
              </div>
              <div className="rounded-xl bg-teal-50/60 border border-teal-100 p-3">
                <p className="text-[10px] text-teal-800 font-bold uppercase leading-snug">Проведен ГЭП</p>
                <p className="text-xl font-black text-teal-950 mt-1">
                  {formatKpiPercent(managerKpiSummary.conductedGepPct)}
                </p>
                <p className="text-[9px] text-teal-800/80 mt-1 leading-snug">
                  Проведено новых ÷ Назначено встреч × 100%
                </p>
              </div>
              <div className="rounded-xl bg-purple-50/60 border border-purple-100 p-3">
                <p className="text-[10px] text-purple-800 font-bold uppercase leading-snug">
                  Проведен ГЭП → переход на след. этап
                </p>
                <p className="text-xl font-black text-purple-950 mt-1">
                  {formatKpiPercent(managerKpiSummary.transitionsPct)}
                </p>
                <p className="text-[9px] text-purple-800/80 mt-1 leading-snug">
                  Переходы на след. этап ÷ Проведено новых × 100%
                </p>
              </div>
              <div className="rounded-xl bg-orange-50/70 border border-orange-100 p-3">
                <p className="text-[10px] text-orange-900 font-bold uppercase leading-snug">Подтвержден заказ</p>
                <p className="text-xl font-black text-orange-950 mt-1">
                  {formatKpiPercent(managerKpiSummary.confirmedOrderConvPct)}
                </p>
                <p className="text-[9px] text-orange-900/80 mt-1 leading-snug">
                  Уникальные контрагенты с «проведено новых» (KPI) и заказом в периоде ÷ Проведено новых × 100%
                </p>
                <p className="text-[9px] text-orange-800/70 mt-1 font-mono">
                  {managerKpiSummary.confirmedOrderConvNumerator} / {managerKpiSummary.conductedNew}
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      {!isDiggerKpi && rnpRows.length > 0 ? <RnpPacePanel rows={rnpRows} /> : null}

      <section className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-x-auto text-left">
        <div className="px-6 pt-5 pb-2 space-y-1">
          <h3 className="text-xs font-bold text-gray-700 uppercase tracking-widest">
            {isDiggerKpi ? 'Отдельный отчёт по KPI лидорубов' : 'Отдельный отчёт по KPI менеджеров'}
          </h3>
          <p className="text-[10px] text-gray-500">{kpiTablePeriodLabel}</p>
          {!isDiggerKpi ? (
            <p className="text-[10px] text-gray-500 leading-relaxed">
              Столбцы встреч считаются автоматически из назначенных и проведённых встреч отчёта (тип «Новая» /
              «Повторная»). Переходы — ручной ввод менеджера.
            </p>
          ) : null}
        </div>

        {isDiggerKpi ? (
          <table className="w-full text-left border-collapse min-w-[980px]">
            <thead>
              <tr className="bg-gray-50/50 text-[10px] font-bold text-gray-400 uppercase border-y border-gray-100">
                <th className="py-4 px-6">Дата отчета</th>
                <th className="py-4 px-4">Лидоруб</th>
                <th className="py-4 px-4 text-center">Отработано</th>
                <th className="py-4 px-4 text-center">Взято новых</th>
                <th className="py-4 px-4 text-center">Звонки</th>
                <th className="py-4 px-4 text-center">Квалификация</th>
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
                  <td className="py-3.5 px-4 text-center font-black text-emerald-700">{report.stats.newInWork}</td>
                  <td className="py-3.5 px-4 text-center font-black text-indigo-700">{report.stats.callsTotal}</td>
                  <td className="py-3.5 px-4 text-center font-black text-amber-700">{report.stats.validatedTotal}</td>
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
                <th className="py-4 px-4 text-center">Уник. поставщики</th>
                <th className="py-4 px-4 text-center">Взято новых</th>
                <th className="py-4 px-4 text-center">Звонки</th>
                <th className="py-4 px-4 text-center">Прошли квал</th>
                <th className="py-4 px-4 text-center">Назначено встреч</th>
                <th className="py-4 px-4 text-center">Проведено новых</th>
                <th className="py-4 px-4 text-center">Проведено повторных</th>
                <th className="py-4 px-4 text-center">Переходы</th>
                {onDeleteReport ? <th className="py-4 px-4 text-right">Действия</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-sm">
              {kpiRows.map((report) => {
                const m = rowMetricsMap.get(report.id);
                if (!m) return null;
                return (
                  <tr key={`kpi-${report.id}`} className="hover:bg-gray-50/50">
                    <td className="py-3.5 px-4 text-gray-500 text-xs whitespace-nowrap">
                      {formatDisplayDate(report.date)}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-gray-800 whitespace-nowrap">{report.manager}</td>
                    <td className="py-3.5 px-4 text-center font-black text-gray-800">{m.uniqueSuppliers}</td>
                    <td className="py-3.5 px-4 text-center font-black text-emerald-700">{m.newInWork}</td>
                    <td className="py-3.5 px-4 text-center font-black text-indigo-700">{m.calls}</td>
                    <td className="py-3.5 px-4 text-center font-black text-amber-700">{m.validated}</td>
                    <td className="py-3.5 px-4 text-center font-black text-slate-800">{m.assignedNew}</td>
                    <td className="py-3.5 px-4 text-center font-black text-teal-700">{m.conductedNew}</td>
                    <td className="py-3.5 px-4 text-center font-black text-blue-700">{m.conductedRepeat}</td>
                    <td className="py-3.5 px-4 text-center font-black text-purple-700">{m.transitions}</td>
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
              {kpiRows.length > 0 ? (
                <tr className="bg-gray-50/80 font-black text-[11px] text-gray-700">
                  <td className="py-3 px-4" colSpan={2}>
                    Итого по таблице
                  </td>
                  <td className="py-3 px-4 text-center text-gray-500">—</td>
                  <td className="py-3 px-4 text-center text-gray-500">—</td>
                  <td className="py-3 px-4 text-center text-gray-500">—</td>
                  <td className="py-3 px-4 text-center text-gray-500">—</td>
                  <td className="py-3 px-4 text-center text-slate-900">{meetingTotals.assignedNew}</td>
                  <td className="py-3 px-4 text-center text-teal-900">{meetingTotals.conductedNew}</td>
                  <td className="py-3 px-4 text-center text-blue-900">{meetingTotals.conductedRepeat}</td>
                  <td className="py-3 px-4 text-center text-purple-900">{meetingTotals.transitions}</td>
                  {onDeleteReport ? <td className="py-3 px-4" /> : null}
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
