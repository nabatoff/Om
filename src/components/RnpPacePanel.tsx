import { DAILY_CALL_GOAL, DAILY_MEETINGS_GREEN, type RnpDayFact, type RnpPaceMeta, type RnpPaceRow } from '../lib/kpiMetrics';
import { TrendingUp } from 'lucide-react';

function formatDayHeader(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  return `${m[3]}.${m[2]}`;
}

function meetingsTone(count: number): 'good' | 'bad' | 'mid' {
  if (count >= DAILY_MEETINGS_GREEN) return 'good';
  if (count < 1) return 'bad';
  return 'mid';
}

function MeetingsChip({ count }: { count: number }) {
  const tone = meetingsTone(count);
  const cls =
    tone === 'good'
      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
      : tone === 'bad'
        ? 'bg-rose-50 border-rose-200 text-rose-600'
        : 'bg-white border-sky-200 text-sky-700';
  return (
    <div className={`mt-1.5 rounded-md border px-1.5 py-0.5 text-[10px] font-bold leading-tight ${cls}`}>
      Встреч: {count}
    </div>
  );
}

function DayCard({ cell }: { cell: RnpDayFact }) {
  if (cell.calls == null) {
    return (
      <div className="w-[92px] rounded-xl border border-slate-200 bg-slate-50 px-2 py-3 text-center">
        <span className="text-slate-300 text-lg font-medium">—</span>
      </div>
    );
  }
  const ok = cell.calls >= DAILY_CALL_GOAL;
  return (
    <div
      className={`w-[92px] rounded-xl border px-2 py-2 text-center ${
        ok ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'
      }`}
    >
      <div className={`text-xl font-black leading-none ${ok ? 'text-emerald-700' : 'text-rose-600'}`}>
        {cell.calls}
      </div>
      <div className={`text-[8px] font-bold uppercase tracking-wider mt-1 ${ok ? 'text-emerald-600' : 'text-rose-400'}`}>
        звонков
      </div>
      <MeetingsChip count={cell.meetings ?? 0} />
    </div>
  );
}

function DeltaBox({ delta }: { delta: number }) {
  const bad = delta < 0;
  return (
    <span
      className={`inline-flex min-w-[3.25rem] justify-center px-2 py-1 rounded-lg border text-xs font-black tabular-nums ${
        bad ? 'bg-rose-50 border-rose-200 text-rose-600' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
      }`}
    >
      {delta > 0 ? `+${delta}` : delta}
    </span>
  );
}

type Props = {
  rows: RnpPaceRow[];
  meta: RnpPaceMeta;
  days: string[];
};

export function RnpPacePanel({ rows, meta, days }: Props) {
  if (rows.length === 0) return null;

  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-100 flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-sky-50 text-sky-600 rounded-lg">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div className="text-left">
            <h3 className="font-bold text-slate-800 uppercase tracking-wider text-xs">
              РНП: ежедневная динамика темпа
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>
                Норма в день: <span className="font-bold text-slate-700">{DAILY_CALL_GOAL} звонка</span>
                {', '}
                <span className="font-bold text-slate-700">3+ встречи</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                План выполнен
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-400" />
                Отставание
              </span>
            </p>
          </div>
        </div>
        <div className="bg-white border border-sky-200 text-sky-800 px-3 py-1.5 rounded-full text-xs font-bold">
          Норма времени: {Math.round(meta.percent)}% ({meta.label}, {meta.workingDaysElapsed}/
          {meta.workingDaysInPeriod} р.д.)
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[720px]">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              <th className="px-4 py-3 text-left sticky left-0 bg-slate-50 z-10 min-w-[140px]">Менеджер</th>
              {days.map((d) => (
                <th key={d} className="px-2 py-3 text-center font-black text-slate-500 min-w-[108px]">
                  {formatDayHeader(d)}
                </th>
              ))}
              <th className="px-4 py-3 text-right sticky right-[88px] bg-slate-50 z-10 min-w-[140px]">Итого (факт)</th>
              <th className="px-4 py-3 text-right sticky right-0 bg-slate-50 z-10 min-w-[88px]">Дельта</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {rows.map((row) => (
              <tr key={row.manager} className="border-b border-slate-100">
                <td className="px-4 py-3 font-bold text-slate-800 sticky left-0 bg-white z-10">{row.manager}</td>
                {row.days.map((cell) => (
                  <td key={cell.date} className="px-2 py-2.5">
                    <div className="flex justify-center">
                      <DayCard cell={cell} />
                    </div>
                  </td>
                ))}
                <td className="px-4 py-3 text-right sticky right-[88px] bg-white z-10">
                  <div className="font-black text-slate-800 tabular-nums">
                    {row.callsFact} / {row.callsPlan} <span className="text-[11px] font-bold text-slate-400">зв.</span>
                  </div>
                  <div className="text-[11px] font-bold text-slate-500 mt-0.5 tabular-nums">
                    {row.newMeetingsFact} / {row.newMeetingsPlan} встр.
                  </div>
                </td>
                <td className="px-4 py-3 text-right sticky right-0 bg-white z-10">
                  <div className="flex flex-col items-end gap-1">
                    <DeltaBox delta={row.callsDelta} />
                    <DeltaBox delta={row.newMeetingsDelta} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
