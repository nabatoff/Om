import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  listManagerWorkItemsPeriodApi,
  workItemStatusLabel,
  type ManagerWorkItemPeriodRow,
  type WorkItemStatus,
} from '../lib/managerWorkItemsApi';

type Props = {
  dateFrom: string;
  dateTo: string;
  filterManager: string;
  callsTotal: number;
  assignedNew: number;
  conductedNew: number;
  conductedRepeat: number;
};

type FocusRow = {
  bin: string;
  entityName: string;
  managerName: string;
  status: WorkItemStatus;
  nextStep: string;
  deadline: string;
  blockers: string;
  reportDate: string;
};

type BlockerHist = {
  bin: string;
  entityName: string;
  managerName: string;
  days: Array<{ reportDate: string; status: WorkItemStatus; blockers: string; lifted: boolean }>;
  lifted: boolean;
};

function digits(bin: string): string {
  return bin.replace(/\D/g, '');
}

function binKey(row: ManagerWorkItemPeriodRow): string {
  const d = digits(row.bin);
  return d || `name:${row.entityName.trim().toLowerCase()}`;
}

export function AdminWorkItemsPeriodPanel({
  dateFrom,
  dateTo,
  filterManager,
  callsTotal,
  assignedNew,
  conductedNew,
  conductedRepeat,
}: Props) {
  const [rows, setRows] = useState<ManagerWorkItemPeriodRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [openBins, setOpenBins] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    void listManagerWorkItemsPeriodApi(dateFrom, dateTo)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Ошибка');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dateFrom, dateTo]);

  const scoped = useMemo(() => {
    if (filterManager === 'Все') return rows;
    const n = filterManager.trim().toLowerCase();
    return rows.filter((r) => r.managerName.trim().toLowerCase() === n);
  }, [rows, filterManager]);

  const metrics = useMemo(() => {
    const unique = new Set<string>();
    const doneBins = new Set<string>();
    for (const r of scoped) {
      const k = binKey(r);
      if (digits(r.bin) || r.entityName.trim()) unique.add(k);
      if (r.status === 'done') doneBins.add(k);
    }

    const byBinDay = new Map<string, Map<string, WorkItemStatus>>();
    for (const r of scoped) {
      const k = binKey(r);
      if (!byBinDay.has(k)) byBinDay.set(k, new Map());
      byBinDay.get(k)!.set(r.reportDate, r.status);
    }
    let transitions = 0;
    for (const days of byBinDay.values()) {
      const dates = Array.from(days.keys()).sort();
      for (let i = 1; i < dates.length; i++) {
        if (days.get(dates[i]) !== days.get(dates[i - 1])) transitions += 1;
      }
    }

    return {
      uniqueSuppliers: unique.size,
      doneTasks: doneBins.size,
      transitions,
    };
  }, [scoped]);

  const focuses = useMemo((): FocusRow[] => {
    const latest = new Map<string, ManagerWorkItemPeriodRow>();
    for (const r of scoped) {
      const k = binKey(r);
      const prev = latest.get(k);
      if (!prev || r.reportDate > prev.reportDate || (r.reportDate === prev.reportDate && r.updatedAt > prev.updatedAt)) {
        latest.set(k, r);
      }
    }
    return Array.from(latest.values())
      .filter((r) => r.status !== 'done' || r.blockers.trim())
      .sort((a, b) => a.entityName.localeCompare(b.entityName, 'ru'))
      .map((r) => ({
        bin: r.bin,
        entityName: r.entityName,
        managerName: r.managerName,
        status: r.status,
        nextStep: r.nextStep,
        deadline: r.deadline,
        blockers: r.blockers,
        reportDate: r.reportDate,
      }));
  }, [scoped]);

  const blockerHistory = useMemo((): BlockerHist[] => {
    const byBin = new Map<string, ManagerWorkItemPeriodRow[]>();
    for (const r of scoped) {
      const k = binKey(r);
      if (!byBin.has(k)) byBin.set(k, []);
      byBin.get(k)!.push(r);
    }
    const out: BlockerHist[] = [];
    for (const [, list] of byBin) {
      const sorted = [...list].sort((a, b) => a.reportDate.localeCompare(b.reportDate) || a.updatedAt.localeCompare(b.updatedAt));
      const blockerDays = sorted.filter((r) => r.blockers.trim());
      if (blockerDays.length === 0) continue;
      const last = sorted[sorted.length - 1]!;
      const lifted = !last.blockers.trim() || last.status === 'done';
      out.push({
        bin: last.bin,
        entityName: last.entityName,
        managerName: last.managerName,
        lifted,
        days: blockerDays.map((d) => ({
          reportDate: d.reportDate,
          status: d.status,
          blockers: d.blockers,
          lifted: false,
        })),
      });
    }
    return out.sort((a, b) => Number(a.lifted) - Number(b.lifted) || a.entityName.localeCompare(b.entityName, 'ru'));
  }, [scoped]);

  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4 text-left">
      <div>
        <h3 className="text-[11px] font-bold text-gray-700 uppercase tracking-widest">KPI крупного привлечения за период</h3>
        <p className="text-[10px] text-gray-500 mt-1">
          Уникальные поставщики / задачи / переходы — по карточкам работы. Звонки и встречи — из отчётов периода.
        </p>
      </div>

      {err ? <p className="text-sm font-bold text-red-600">{err}</p> : null}
      {loading ? <p className="text-sm text-gray-400">Загрузка карточек…</p> : null}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
        <div className="rounded-xl bg-violet-50 border border-violet-100 p-3">
          <p className="text-[10px] text-violet-700 font-bold uppercase">Уникальные поставщики в работе</p>
          <p className="text-lg font-black text-violet-900">{metrics.uniqueSuppliers}</p>
        </div>
        <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-3">
          <p className="text-[10px] text-indigo-700 font-bold uppercase">Содержательные звонки</p>
          <p className="text-lg font-black text-indigo-900">{callsTotal}</p>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
          <p className="text-[10px] text-slate-700 font-bold uppercase">Новые встречи</p>
          <p className="text-lg font-black text-slate-900">{assignedNew + conductedNew}</p>
          <p className="text-[9px] text-slate-500 mt-0.5">план {assignedNew} + факт {conductedNew}</p>
        </div>
        <div className="rounded-xl bg-blue-50 border border-blue-100 p-3">
          <p className="text-[10px] text-blue-700 font-bold uppercase">Повторные встречи</p>
          <p className="text-lg font-black text-blue-900">{conductedRepeat}</p>
        </div>
        <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3">
          <p className="text-[10px] text-emerald-700 font-bold uppercase">Выполненные задачи</p>
          <p className="text-lg font-black text-emerald-900">{metrics.doneTasks}</p>
        </div>
        <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
          <p className="text-[10px] text-amber-800 font-bold uppercase">Переходы на этап</p>
          <p className="text-lg font-black text-amber-950">{metrics.transitions}</p>
        </div>
      </div>

      {focuses.length > 0 ? (
        <div className="space-y-2">
          <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Лента актуальных фокусов</h4>
          <div className="space-y-2">
            {focuses.map((f) => (
              <div key={`${f.bin}|${f.entityName}`} className="border border-gray-100 rounded-xl p-3 bg-gray-50/60">
                <div className="flex flex-wrap justify-between gap-2 mb-1">
                  <div className="font-bold text-sm text-gray-800">
                    {f.entityName || '—'} <span className="font-mono text-[10px] text-gray-400">{f.bin}</span>
                  </div>
                  <span className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-white border border-gray-200 text-gray-700">
                    {workItemStatusLabel(f.status)}
                  </span>
                </div>
                <p className="text-[11px] text-gray-500">
                  {f.managerName}
                  {f.deadline ? ` · дедлайн ${f.deadline}` : ''}
                  {` · снимок ${f.reportDate}`}
                </p>
                {f.nextStep ? <p className="text-sm text-gray-800 mt-1">{f.nextStep}</p> : null}
                {f.blockers.trim() ? (
                  <p className="text-sm text-amber-800 mt-1 whitespace-pre-wrap">{f.blockers}</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {blockerHistory.length > 0 ? (
        <div className="space-y-2">
          <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">История блокеров</h4>
          {blockerHistory.map((h) => {
            const key = `${h.bin}|${h.entityName}`;
            const open = Boolean(openBins[key]);
            return (
              <div key={key} className="border border-gray-100 rounded-xl overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-gray-50"
                  onClick={() => setOpenBins((p) => ({ ...p, [key]: !open }))}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span className="font-bold text-sm text-gray-800 truncate">
                      {h.entityName || '—'} <span className="font-mono text-[10px] text-gray-400">{h.bin}</span>
                    </span>
                  </span>
                  <span
                    className={`shrink-0 text-[10px] uppercase font-bold px-2 py-1 rounded ${
                      h.lifted ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {h.lifted ? 'снят' : 'висит'}
                  </span>
                </button>
                {open ? (
                  <div className="px-3 pb-3 space-y-2 border-t border-gray-50 bg-gray-50/40">
                    {h.days.map((d) => (
                      <div key={`${d.reportDate}|${d.blockers.slice(0, 24)}`} className="pt-2">
                        <p className="text-[10px] text-gray-400 font-bold uppercase">
                          {d.reportDate} · {workItemStatusLabel(d.status)}
                        </p>
                        <p className="text-sm text-gray-800 whitespace-pre-wrap">{d.blockers}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
