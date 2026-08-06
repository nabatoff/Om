import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Layers,
  Users,
  Phone,
  CheckCircle,
  Award,
  Calendar,
  AlertCircle,
} from 'lucide-react';
import type { FullReport } from '../lib/crmApi';
import { buildMonthSelectOptions } from '../lib/periodBounds';
import {
  buildSalesDashboardPeriod,
  collectReportMonthYms,
  formatKpiPercent,
  type SalesDashboardPeriod,
} from '../lib/kpiMetrics';

type DeltaResult = { percent: string; raw: string | number; positive: boolean };

function calculateDelta(currVal: number, compVal: number, isPercentage = false): DeltaResult {
  if (compVal === 0) return { percent: '0.0', raw: isPercentage ? currVal.toFixed(1) : currVal, positive: currVal >= 0 };
  const raw = currVal - compVal;
  const percent = (raw / compVal) * 100;
  return {
    percent: percent.toFixed(1),
    raw: isPercentage ? raw.toFixed(1) : raw,
    positive: raw >= 0,
  };
}

function pctOrZero(value: number | null): number {
  return value ?? 0;
}

const metricsConfig = [
  { key: 'worked' as const, label: 'Отработано', icon: Users, color: 'text-gray-600', bg: 'bg-gray-50' },
  { key: 'newTaken' as const, label: 'Взято новых', icon: Layers, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { key: 'calls' as const, label: 'Звонки', icon: Phone, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  { key: 'qualification' as const, label: 'Квалификация', icon: CheckCircle, color: 'text-amber-600', bg: 'bg-amber-50' },
  { key: 'newScheduled' as const, label: 'Назначено новых', icon: Calendar, color: 'text-cyan-600', bg: 'bg-cyan-50' },
  { key: 'newConducted' as const, label: 'Проведено новых', icon: Award, color: 'text-teal-600', bg: 'bg-teal-50' },
  { key: 'repeatConducted' as const, label: 'Проведено повторных', icon: Award, color: 'text-purple-600', bg: 'bg-purple-50' },
];

const conversionsConfig = [
  {
    key: 'qualificationRate' as const,
    label: 'Прошли квалификацию',
    formula: 'Квалификация ÷ Звонки × 100%',
    color: 'border-l-4 border-amber-400 bg-amber-50/30',
  },
  {
    key: 'scheduledGepRate' as const,
    label: 'Назначено ГЭП',
    formula: 'Назначено новых ÷ Квалификация × 100%',
    color: 'border-l-4 border-cyan-400 bg-cyan-50/30',
  },
  {
    key: 'conductedGepRate' as const,
    label: 'Проведен ГЭП',
    formula: 'Проведено новых ÷ Назначено новых × 100%',
    color: 'border-l-4 border-teal-400 bg-teal-50/30',
  },
  {
    key: 'confirmedOrderRate' as const,
    label: 'Подтвержден заказ',
    formula: 'Заказ в периоде ÷ Проведено новых × 100%',
    color: 'border-l-4 border-purple-400 bg-purple-50/30',
  },
];

function buildFunnelInsights(current: SalesDashboardPeriod, compare: SalesDashboardPeriod) {
  const convItems = conversionsConfig.map((c) => {
    const curr = pctOrZero(current.conversions[c.key]);
    const comp = pctOrZero(compare.conversions[c.key]);
    return { ...c, curr, comp, delta: curr - comp };
  });

  const bestGrowth = [...convItems].sort((a, b) => b.delta - a.delta)[0];
  const worstDecline = [...convItems].sort((a, b) => a.delta - b.delta)[0];
  const bottleneck = [...convItems].sort((a, b) => a.curr - b.curr)[0];

  return { bestGrowth, worstDecline, bottleneck };
}

function FunnelBars({ period, muted }: { period: SalesDashboardPeriod; muted?: boolean }) {
  const { metrics, conversions } = period;
  const qualPct = pctOrZero(conversions.qualificationRate);
  const schedFromCalls = metrics.calls > 0 ? (metrics.newScheduled / metrics.calls) * 100 : 0;
  const condFromCalls = metrics.calls > 0 ? (metrics.newConducted / metrics.calls) * 100 : 0;
  const orderFromCalls = metrics.calls > 0 ? (metrics.confirmedOrders / metrics.calls) * 100 : 0;

  const barBg = muted ? 'bg-gray-200' : undefined;
  const topBg = muted ? 'bg-gray-500' : 'bg-indigo-500';

  return (
    <div className="space-y-2">
      <div className="relative">
        <div className={`w-full ${topBg} text-white text-xs font-bold py-2 px-4 rounded flex justify-between items-center z-10 relative`}>
          <span>1. Звонки</span>
          <span>{metrics.calls}</span>
        </div>
      </div>
      <div className="relative">
        <div className={`absolute inset-0 ${barBg ?? 'bg-indigo-100'} rounded`} style={{ width: `${Math.min(100, qualPct)}%` }} />
        <div className="w-full text-gray-800 text-xs font-semibold py-2 px-4 rounded flex justify-between items-center border border-gray-200 z-10 relative">
          <span>2. Квалификация ({formatKpiPercent(conversions.qualificationRate)})</span>
          <span>{metrics.qualification}</span>
        </div>
      </div>
      <div className="relative">
        <div className={`absolute inset-0 ${barBg ?? 'bg-cyan-100'} rounded`} style={{ width: `${Math.min(100, schedFromCalls)}%` }} />
        <div className="w-full text-gray-800 text-xs font-semibold py-2 px-4 rounded flex justify-between items-center border border-gray-200 z-10 relative">
          <span>3. Назначено ГЭП ({formatKpiPercent(conversions.scheduledGepRate)} от квал.)</span>
          <span>{metrics.newScheduled}</span>
        </div>
      </div>
      <div className="relative">
        <div className={`absolute inset-0 ${barBg ?? 'bg-teal-100'} rounded`} style={{ width: `${Math.min(100, condFromCalls)}%` }} />
        <div className="w-full text-gray-800 text-xs font-semibold py-2 px-4 rounded flex justify-between items-center border border-gray-200 z-10 relative">
          <span>4. Проведен ГЭП ({formatKpiPercent(conversions.conductedGepRate)} от назн.)</span>
          <span>{metrics.newConducted}</span>
        </div>
      </div>
      <div className="relative">
        <div className={`absolute inset-0 ${barBg ?? 'bg-purple-100'} rounded`} style={{ width: `${Math.min(100, orderFromCalls)}%` }} />
        <div className="w-full text-gray-800 text-xs font-semibold py-2 px-4 rounded flex justify-between items-center border border-gray-200 z-10 relative">
          <span>5. Подтвержден заказ ({formatKpiPercent(conversions.confirmedOrderRate)} от пров.)</span>
          <span>{metrics.confirmedOrders}</span>
        </div>
      </div>
    </div>
  );
}

export function SalesComparisonDashboard({
  allReports,
  filterManager,
  setFilterManager,
  managerOptions,
}: {
  allReports: FullReport[];
  filterManager: string;
  setFilterManager: Dispatch<SetStateAction<string>>;
  managerOptions: string[];
}) {
  const monthOptions = useMemo(() => {
    const fromReports = collectReportMonthYms(allReports);
    const anchor = fromReports[0];
    const base = buildMonthSelectOptions(24, anchor);
    const seen = new Set(base.map((o) => o.value));
    for (const ym of fromReports) {
      if (!seen.has(ym)) {
        const [yy, mm] = ym.split('-').map(Number);
        const d = new Date(yy, mm - 1, 1);
        const raw = d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
        base.push({ value: ym, label: raw.charAt(0).toUpperCase() + raw.slice(1) });
        seen.add(ym);
      }
    }
    return base.sort((a, b) => b.value.localeCompare(a.value));
  }, [allReports]);

  const defaultCurrentYm = monthOptions[0]?.value ?? buildMonthSelectOptions(1)[0]?.value ?? '';
  const defaultCompareYm = monthOptions[1]?.value ?? monthOptions[0]?.value ?? '';

  const [currentMonth, setCurrentMonth] = useState(defaultCurrentYm);
  const [compareMonth, setCompareMonth] = useState(defaultCompareYm);
  const [activeTab, setActiveTab] = useState<'summary' | 'funnel' | 'simulator'>('summary');

  useEffect(() => {
    if (!monthOptions.some((o) => o.value === currentMonth)) {
      setCurrentMonth(defaultCurrentYm);
    }
    if (!monthOptions.some((o) => o.value === compareMonth) || compareMonth === currentMonth) {
      const alt = monthOptions.find((o) => o.value !== currentMonth);
      if (alt) setCompareMonth(alt.value);
    }
  }, [monthOptions, defaultCurrentYm, currentMonth, compareMonth]);

  const dataCurrent = useMemo(
    () => buildSalesDashboardPeriod(allReports, currentMonth, filterManager),
    [allReports, currentMonth, filterManager],
  );
  const dataCompare = useMemo(
    () => buildSalesDashboardPeriod(allReports, compareMonth, filterManager),
    [allReports, compareMonth, filterManager],
  );

  const [simCalls, setSimCalls] = useState(0);
  const [simQualRate, setSimQualRate] = useState(0);
  const [simGepSchedRate, setSimGepSchedRate] = useState(0);
  const [simGepCondRate, setSimGepCondRate] = useState(0);
  const [simOrderRate, setSimOrderRate] = useState(0);

  useEffect(() => {
    if (!dataCurrent) return;
    setSimCalls(dataCurrent.metrics.calls);
    setSimQualRate(pctOrZero(dataCurrent.conversions.qualificationRate));
    setSimGepSchedRate(pctOrZero(dataCurrent.conversions.scheduledGepRate));
    setSimGepCondRate(pctOrZero(dataCurrent.conversions.conductedGepRate));
    setSimOrderRate(pctOrZero(dataCurrent.conversions.confirmedOrderRate));
  }, [dataCurrent]);

  const simResults = useMemo(() => {
    const qualCount = Math.round((simCalls * simQualRate) / 100);
    const schedCount = Math.round((qualCount * simGepSchedRate) / 100);
    const condCount = Math.round((schedCount * simGepCondRate) / 100);
    const orderCount = Math.round((condCount * simOrderRate) / 100);
    return { qualification: qualCount, scheduled: schedCount, conducted: condCount, orders: orderCount };
  }, [simCalls, simQualRate, simGepSchedRate, simGepCondRate, simOrderRate]);

  const insights = useMemo(() => {
    if (!dataCurrent || !dataCompare) return null;
    return buildFunnelInsights(dataCurrent, dataCompare);
  }, [dataCurrent, dataCompare]);

  if (!dataCurrent || !dataCompare) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center text-gray-500">
        Нет данных за выбранные месяцы
      </div>
    );
  }

  const resetSimulator = () => {
    setSimCalls(dataCurrent.metrics.calls);
    setSimQualRate(pctOrZero(dataCurrent.conversions.qualificationRate));
    setSimGepSchedRate(pctOrZero(dataCurrent.conversions.scheduledGepRate));
    setSimGepCondRate(pctOrZero(dataCurrent.conversions.conductedGepRate));
    setSimOrderRate(pctOrZero(dataCurrent.conversions.confirmedOrderRate));
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500 text-left">
      <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h2 className="text-lg font-black text-gray-900">Сравнительный дэшборд продаж</h2>
            <p className="text-xs text-gray-500 mt-1">
              MoM-сравнение ключевых метрик воронки
              {filterManager !== 'Все' ? ` · менеджер: ${filterManager}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase">Менеджер</label>
              <select
                className="px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold min-w-[160px]"
                value={filterManager}
                onChange={(e) => setFilterManager(e.target.value)}
              >
                {managerOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-xl border border-gray-200">
              <span className="text-xs font-semibold text-gray-500 pl-2">Текущий:</span>
              <select
                value={currentMonth}
                onChange={(e) => setCurrentMonth(e.target.value)}
                className="bg-white border border-gray-200 rounded-lg text-sm px-2 py-1.5 outline-none font-medium text-gray-700"
              >
                {monthOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-xl border border-gray-200">
              <span className="text-xs font-semibold text-gray-500 pl-2">Прошлый месяц:</span>
              <select
                value={compareMonth}
                onChange={(e) => setCompareMonth(e.target.value)}
                className="bg-white border border-gray-200 rounded-lg text-sm px-2 py-1.5 outline-none font-medium text-gray-700"
              >
                {monthOptions.filter((o) => o.value !== currentMonth).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex border-b border-gray-100 gap-6">
          {(
            [
              ['summary', 'Сводка и MoM'],
              ['funnel', 'Сравнение воронок'],
              ['simulator', 'Симулятор гипотез'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`pb-3 text-sm font-bold transition-colors relative ${
                activeTab === id ? 'text-blue-600' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {label}
              {activeTab === id ? <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded" /> : null}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'summary' && (
        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Абсолютные показатели за период</h3>
              <div className="text-xs text-gray-500 bg-white px-2.5 py-1 rounded-lg border border-gray-200">
                Зелёный / красный = отклонение относительно прошлого месяца
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {metricsConfig.map((metric) => {
                const currVal = dataCurrent.metrics[metric.key];
                const compVal = dataCompare.metrics[metric.key];
                const delta = calculateDelta(currVal, compVal);
                return (
                  <div key={metric.key} className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tight truncate max-w-[120px]" title={metric.label}>
                          {metric.label}
                        </span>
                        <metric.icon className={`w-4 h-4 ${metric.color}`} />
                      </div>
                      <div className="text-2xl font-black text-gray-900">{currVal}</div>
                    </div>
                    <div className="mt-4 pt-2 border-t border-gray-100 flex items-center justify-between">
                      <span className="text-[10px] text-gray-400">Прошлый месяц: {compVal}</span>
                      <div className={`flex items-center text-xs font-bold ${delta.positive ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {delta.positive ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
                        <span>
                          {delta.positive ? '+' : ''}
                          {delta.percent}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4">Эффективность воронки (конверсии)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {conversionsConfig.map((conv) => {
                const currVal = pctOrZero(dataCurrent.conversions[conv.key]);
                const compVal = pctOrZero(dataCompare.conversions[conv.key]);
                const delta = calculateDelta(currVal, compVal, true);
                return (
                  <div key={conv.key} className={`p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between bg-white ${conv.color}`}>
                    <div>
                      <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">{conv.label}</div>
                      <div className="text-3xl font-black text-gray-900 my-2">{formatKpiPercent(dataCurrent.conversions[conv.key])}</div>
                      <div className="text-[10px] text-gray-400 italic mb-4">{conv.formula}</div>
                    </div>
                    <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                      <span className="text-gray-500">
                        В прошлом месяце: <strong className="text-gray-700">{formatKpiPercent(dataCompare.conversions[conv.key])}</strong>
                      </span>
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold ${
                          delta.positive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {delta.positive ? '+' : ''}
                        {delta.raw} п.п. к прошлому месяцу
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center">
              <h3 className="font-black text-gray-800">Детальное табличное сравнение</h3>
              <span className="text-xs text-gray-500">
                {dataCurrent.name} vs {dataCompare.name}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-[11px] uppercase font-black text-gray-500 border-b border-gray-200">
                    <th className="py-3 px-5">Показатель</th>
                    <th className="py-3 px-5 text-right">{dataCompare.name} (прошлый месяц)</th>
                    <th className="py-3 px-5 text-right">{dataCurrent.name} (текущий)</th>
                    <th className="py-3 px-5 text-right">Абсолютное изм.</th>
                    <th className="py-3 px-5 text-right">Относительное к прошлому месяцу</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  <tr className="bg-gray-50/60">
                    <td colSpan={5} className="py-2 px-5 text-xs font-bold text-blue-600 uppercase tracking-wide">
                      Абсолютные объёмы
                    </td>
                  </tr>
                  {metricsConfig.map((m) => {
                    const curr = dataCurrent.metrics[m.key];
                    const comp = dataCompare.metrics[m.key];
                    const diff = curr - comp;
                    const pct = comp !== 0 ? ((diff / comp) * 100).toFixed(1) : 'N/A';
                    return (
                      <tr key={m.key} className="hover:bg-gray-50/50">
                        <td className="py-3 px-5 font-medium text-gray-700">{m.label}</td>
                        <td className="py-3 px-5 text-right text-gray-500">{comp}</td>
                        <td className="py-3 px-5 text-right font-bold text-gray-900">{curr}</td>
                        <td className={`py-3 px-5 text-right font-semibold ${diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {diff >= 0 ? `+${diff}` : diff}
                        </td>
                        <td className={`py-3 px-5 text-right font-bold ${diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {diff >= 0 ? `+${pct}` : pct}%
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-gray-50/60">
                    <td colSpan={5} className="py-2 px-5 text-xs font-bold text-blue-600 uppercase tracking-wide">
                      Процентные конверсии
                    </td>
                  </tr>
                  {conversionsConfig.map((c) => {
                    const curr = pctOrZero(dataCurrent.conversions[c.key]);
                    const comp = pctOrZero(dataCompare.conversions[c.key]);
                    const diff = (curr - comp).toFixed(1);
                    const pct = comp !== 0 ? (((curr - comp) / comp) * 100).toFixed(1) : 'N/A';
                    const diffNum = curr - comp;
                    return (
                      <tr key={c.key} className="hover:bg-gray-50/50">
                        <td className="py-3 px-5 font-medium text-gray-700">{c.label}</td>
                        <td className="py-3 px-5 text-right text-gray-500">{formatKpiPercent(dataCompare.conversions[c.key])}</td>
                        <td className="py-3 px-5 text-right font-bold text-gray-900">{formatKpiPercent(dataCurrent.conversions[c.key])}</td>
                        <td className={`py-3 px-5 text-right font-semibold ${diffNum >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {diffNum >= 0 ? `+${diff}` : diff} п.п.
                        </td>
                        <td className={`py-3 px-5 text-right font-bold ${diffNum >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {diffNum >= 0 ? `+${pct}` : pct}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'funnel' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
            <h3 className="font-black text-gray-800 mb-6">Графическая воронка (MoM)</h3>
            <div className="space-y-6">
              <div>
                <div className="flex justify-between items-center text-xs font-bold text-gray-600 mb-2">
                  <span>{dataCurrent.name}</span>
                  <span>100% (звонки: {dataCurrent.metrics.calls})</span>
                </div>
                <FunnelBars period={dataCurrent} />
              </div>
              <hr className="border-gray-100" />
              <div>
                <div className="flex justify-between items-center text-xs font-bold text-gray-400 mb-2">
                  <span>{dataCompare.name}</span>
                  <span>100% (звонки: {dataCompare.metrics.calls})</span>
                </div>
                <div className="opacity-80">
                  <FunnelBars period={dataCompare} muted />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between">
            <div>
              <h3 className="font-black text-gray-800 mb-4 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-blue-500" />
                Анализ узких мест воронки
              </h3>
              {insights ? (
                <div className="space-y-4 text-sm text-gray-600">
                  <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                    <h4 className="font-bold text-emerald-800 mb-1">Лучший рост конверсии</h4>
                    <p className="text-xs leading-relaxed">
                      <strong>{insights.bestGrowth.label}</strong>: {formatKpiPercent(insights.bestGrowth.curr)} vs{' '}
                      {formatKpiPercent(insights.bestGrowth.comp)} в прошлом месяце (
                      {insights.bestGrowth.delta >= 0 ? '+' : ''}
                      {insights.bestGrowth.delta.toFixed(1)} п.п.)
                    </p>
                  </div>
                  <div className="p-4 bg-rose-50 rounded-xl border border-rose-100">
                    <h4 className="font-bold text-rose-800 mb-1">Наибольшее снижение</h4>
                    <p className="text-xs leading-relaxed">
                      <strong>{insights.worstDecline.label}</strong>: {formatKpiPercent(insights.worstDecline.curr)} vs{' '}
                      {formatKpiPercent(insights.worstDecline.comp)} (
                      {insights.worstDecline.delta >= 0 ? '+' : ''}
                      {insights.worstDecline.delta.toFixed(1)} п.п.)
                    </p>
                  </div>
                  <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
                    <h4 className="font-bold text-amber-800 mb-1">Узкое место воронки</h4>
                    <p className="text-xs leading-relaxed">
                      Самая низкая конверсия в текущем периоде — <strong>{insights.bottleneck.label}</strong> (
                      {formatKpiPercent(insights.bottleneck.curr)}). Фокус на улучшении этого этапа даст максимальный эффект на итоговые заказы.
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="mt-6 pt-4 border-t border-gray-100 text-xs text-gray-400">
              Расчёт метрик и конверсий совпадает с логикой KPI-отчёта CRM.
            </div>
          </div>
        </div>
      )}

      {activeTab === 'simulator' && (
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 border-b border-gray-100 pb-4">
            <div>
              <h3 className="font-black text-gray-800">Интерактивный симулятор («Что если?»)</h3>
              <p className="text-xs text-gray-500 mt-1">Изменяйте метрики ползунками для прогноза подтверждённых заказов.</p>
            </div>
            <button type="button" onClick={resetSimulator} className="text-xs font-bold text-blue-600 hover:text-blue-800">
              Сбросить на {dataCurrent.name.toLowerCase()}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-5 space-y-5 bg-gray-50 p-5 rounded-2xl border border-gray-200">
              <div>
                <div className="flex justify-between text-xs font-bold text-gray-700 mb-2">
                  <span>Объём звонков</span>
                  <span className="text-indigo-600">{simCalls}</span>
                </div>
                <input type="range" min="0" max="1000" step="10" value={simCalls} onChange={(e) => setSimCalls(Number(e.target.value))} className="w-full accent-indigo-600 cursor-pointer" />
                <span className="text-[10px] text-gray-400">{dataCurrent.name}: {dataCurrent.metrics.calls}</span>
              </div>
              <div>
                <div className="flex justify-between text-xs font-bold text-gray-700 mb-2">
                  <span>% квалификации</span>
                  <span className="text-amber-600">{simQualRate}%</span>
                </div>
                <input type="range" min="0" max="30" step="0.1" value={simQualRate} onChange={(e) => setSimQualRate(Number(e.target.value))} className="w-full accent-amber-500 cursor-pointer" />
                <span className="text-[10px] text-gray-400">{dataCurrent.name}: {formatKpiPercent(dataCurrent.conversions.qualificationRate)}</span>
              </div>
              <div>
                <div className="flex justify-between text-xs font-bold text-gray-700 mb-2">
                  <span>% назначения ГЭП</span>
                  <span className="text-cyan-600">{simGepSchedRate}%</span>
                </div>
                <input type="range" min="0" max="90" step="0.5" value={simGepSchedRate} onChange={(e) => setSimGepSchedRate(Number(e.target.value))} className="w-full accent-cyan-500 cursor-pointer" />
                <span className="text-[10px] text-gray-400">{dataCurrent.name}: {formatKpiPercent(dataCurrent.conversions.scheduledGepRate)}</span>
              </div>
              <div>
                <div className="flex justify-between text-xs font-bold text-gray-700 mb-2">
                  <span>% проведения ГЭП</span>
                  <span className="text-teal-600">{simGepCondRate}%</span>
                </div>
                <input type="range" min="0" max="90" step="0.5" value={simGepCondRate} onChange={(e) => setSimGepCondRate(Number(e.target.value))} className="w-full accent-teal-500 cursor-pointer" />
                <span className="text-[10px] text-gray-400">{dataCurrent.name}: {formatKpiPercent(dataCurrent.conversions.conductedGepRate)}</span>
              </div>
              <div>
                <div className="flex justify-between text-xs font-bold text-gray-700 mb-2">
                  <span>% подтверждения заказов</span>
                  <span className="text-purple-600">{simOrderRate}%</span>
                </div>
                <input type="range" min="0" max="80" step="0.5" value={simOrderRate} onChange={(e) => setSimOrderRate(Number(e.target.value))} className="w-full accent-purple-500 cursor-pointer" />
                <span className="text-[10px] text-gray-400">{dataCurrent.name}: {formatKpiPercent(dataCurrent.conversions.confirmedOrderRate)}</span>
              </div>
            </div>

            <div className="lg:col-span-7 flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Результаты моделирования</h4>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                    <span className="text-[10px] uppercase font-black text-gray-400">Квалифицировано</span>
                    <div className="text-2xl font-black text-gray-900">{simResults.qualification}</div>
                    <span className="text-xs text-gray-500">Факт: {dataCurrent.metrics.qualification}</span>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                    <span className="text-[10px] uppercase font-black text-gray-400">Назначено ГЭП</span>
                    <div className="text-2xl font-black text-gray-900">{simResults.scheduled}</div>
                    <span className="text-xs text-gray-500">Факт: {dataCurrent.metrics.newScheduled}</span>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                    <span className="text-[10px] uppercase font-black text-gray-400">Проведено ГЭП</span>
                    <div className="text-2xl font-black text-gray-900">{simResults.conducted}</div>
                    <span className="text-xs text-gray-500">Факт: {dataCurrent.metrics.newConducted}</span>
                  </div>
                  <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                    <span className="text-[10px] uppercase font-black text-blue-500">Прогноз заказов</span>
                    <div className="text-3xl font-black text-blue-700">{simResults.orders}</div>
                    <span className="text-xs text-blue-600">Факт: {dataCurrent.metrics.confirmedOrders}</span>
                  </div>
                </div>
                <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100 text-sm">
                  <h5 className="font-semibold text-blue-800 mb-2">Цепочка расчётов:</h5>
                  <ul className="list-disc list-inside space-y-1 text-xs text-gray-600">
                    <li>
                      Звонки ({simCalls}) × квалификация ({simQualRate}%) = {simResults.qualification}
                    </li>
                    <li>
                      Квалификация ({simResults.qualification}) × назначено ({simGepSchedRate}%) = {simResults.scheduled}
                    </li>
                    <li>
                      Назначено ({simResults.scheduled}) × проведено ({simGepCondRate}%) = {simResults.conducted}
                    </li>
                    <li>
                      Проведено ({simResults.conducted}) × закрытие ({simOrderRate}%) ={' '}
                      <strong className="text-blue-700">{simResults.orders} заказов</strong>
                    </li>
                  </ul>
                </div>
              </div>
              <div className="mt-6 p-4 bg-emerald-50 rounded-xl border border-emerald-100 flex items-start gap-3">
                <TrendingUp className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h5 className="font-bold text-emerald-800 text-xs">Практический инсайт</h5>
                  <p className="text-[11px] text-emerald-700 leading-normal mt-1">
                    При звонках {simCalls} и текущих конверсиях прогноз — <strong>{simResults.orders} заказов</strong> (факт {dataCurrent.metrics.confirmedOrders}).
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
