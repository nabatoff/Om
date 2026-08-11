import {
  formatKpiDeltaBadge,
  monthElapsedPercent,
  type RnpPaceRow,
} from '../lib/kpiMetrics';
import { TrendingUp } from 'lucide-react';

function DeltaBadge({ delta }: { delta: number }) {
  const { text, tone } = formatKpiDeltaBadge(delta);
  const cls =
    tone === 'bad'
      ? 'bg-red-50 text-red-600 border-red-100'
      : 'bg-emerald-50 text-emerald-600 border-emerald-100';
  return (
    <span className={`inline-flex items-center gap-1 border px-2 py-0.5 rounded text-[11px] font-bold ${cls}`}>
      {text}
    </span>
  );
}

type Props = {
  rows: RnpPaceRow[];
};

export function RnpPacePanel({ rows }: Props) {
  const elapsed = monthElapsedPercent();
  if (rows.length === 0) return null;

  return (
    <section className="bg-white border border-blue-200 rounded-2xl shadow-sm overflow-hidden ring-1 ring-blue-50">
      <div className="p-4 border-b border-blue-100 bg-blue-50/50 flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-blue-100 text-blue-600 rounded">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div className="text-left">
            <h3 className="font-bold text-slate-700 uppercase tracking-wider text-xs">РНП: контроль темпа (дельта)</h3>
            <p className="text-[10px] text-slate-500 mt-0.5">Отклонение менеджеров от плана на сегодняшний день</p>
          </div>
        </div>
        <div className="bg-white border border-blue-200 text-blue-700 px-3 py-1.5 rounded text-xs font-bold shadow-sm">
          Норма времени:{' '}
          <span className="text-blue-600">{Math.round(elapsed.percent)}%</span> ({elapsed.label})
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[760px]">
          <thead>
            <tr className="bg-white border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase">
              <th className="px-5 py-3 text-left">Менеджер</th>
              <th className="px-5 py-3 border-l border-slate-100 bg-slate-50/30">Звонки (факт / план)</th>
              <th className="px-5 py-3 bg-slate-50/30">Дельта</th>
              <th className="px-5 py-3 border-l border-slate-100 bg-slate-50/30">Новые встречи</th>
              <th className="px-5 py-3 bg-slate-50/30">Дельта</th>
              <th className="px-5 py-3 border-l border-slate-100 bg-slate-50/30">Переходы (факт)</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {rows.map((row) => (
              <tr key={row.manager} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                <td className="px-5 py-3 font-bold text-slate-800">{row.manager}</td>
                <td className="px-5 py-3 border-l border-slate-100 font-medium">
                  {row.callsFact} <span className="text-xs text-slate-400">/ {row.callsPlan}</span>
                </td>
                <td className="px-5 py-3">
                  <DeltaBadge delta={row.callsDelta} />
                </td>
                <td className="px-5 py-3 border-l border-slate-100 font-medium">
                  {row.newMeetingsFact} <span className="text-xs text-slate-400">/ {row.newMeetingsPlan}</span>
                </td>
                <td className="px-5 py-3">
                  <DeltaBadge delta={row.newMeetingsDelta} />
                </td>
                <td className="px-5 py-3 border-l border-slate-100 font-medium">{row.transitionsFact}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
