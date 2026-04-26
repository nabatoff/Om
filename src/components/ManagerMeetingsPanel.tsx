import { useMemo, useState } from 'react';
import { Calendar, CalendarDays, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import type { FullReport, UiAssigned, UiConducted } from '../lib/crmApi';

export type UiAssignedWithReport = UiAssigned & { reportDate: string };

function toYmd(raw: string): string | null {
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) {
    const d = m[1].padStart(2, '0');
    const mo = m[2].padStart(2, '0');
    return `${m[3]}-${mo}-${d}`;
  }
  return null;
}

function localYmd(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

function addDaysYmd(ymd: string, add: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const x = new Date(y, m - 1, d);
  x.setDate(x.getDate() + add);
  return localYmd(x);
}

export function ManagerMeetingsPanel({
  allReports,
  findEvidence,
  managerName,
}: {
  allReports: FullReport[];
  findEvidence: (planned: UiAssigned, manager: string) => { evidence: UiConducted; reportDate: string } | null;
  managerName: string;
}) {
  const [view, setView] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  const rows: UiAssignedWithReport[] = useMemo(() => {
    const out: UiAssignedWithReport[] = [];
    for (const r of allReports) {
      for (const a of r.assignedMeetings) {
        out.push({ ...a, reportDate: r.date });
      }
    }
    out.sort((x, y) => {
      const ax = toYmd(x.date) || x.date;
      const ay = toYmd(y.date) || y.date;
      return ax.localeCompare(ay) || x.entityName.localeCompare(y.entityName, 'ru');
    });
    return out;
  }, [allReports]);

  const todayYmd = localYmd(new Date());
  const tomorrowYmd = addDaysYmd(todayYmd, 1);

  const { today, tomorrow } = useMemo(() => {
    const t: typeof rows = [];
    const tom: typeof rows = [];
    for (const a of rows) {
      const ymd = toYmd(a.date);
      if (!ymd) continue;
      if (ymd === todayYmd) t.push(a);
      else if (ymd === tomorrowYmd) tom.push(a);
    }
    return { today: t, tomorrow: tom };
  }, [rows, todayYmd, tomorrowYmd]);

  const byDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of rows) {
      const y = toYmd(a.date);
      if (!y) continue;
      m.set(y, (m.get(y) || 0) + 1);
    }
    return m;
  }, [rows]);

  const firstMondayIndex = (() => {
    const d0 = new Date(view.y, view.m, 1).getDay();
    return d0 === 0 ? 6 : d0 - 1;
  })();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = Array.from({ length: firstMondayIndex }, () => null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const monthLabel = new Date(view.y, view.m, 1).toLocaleString('ru-RU', { month: 'long', year: 'numeric' });

  const shiftMonth = (delta: number) => {
    setView((v) => {
      const d = new Date(v.y, v.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };

  return (
    <div className="space-y-6 text-left">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-white border border-amber-100 rounded-3xl p-6 shadow-sm">
          <h3 className="text-xs font-black text-amber-800 uppercase tracking-widest flex items-center gap-2 mb-4">
            <Clock size={16} className="text-amber-500" />
            Сегодня · завтра
          </h3>
          <div className="space-y-4">
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase mb-2">Сегодня</p>
              {today.length === 0 ? (
                <p className="text-sm text-gray-400">Нет назначенных встреч</p>
              ) : (
                <ul className="space-y-2">
                  {today.map((a, i) => (
                    <MeetingMiniRow key={`t-${a.bin}-${i}`} a={a} findEvidence={findEvidence} managerName={managerName} />
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase mb-2">Завтра</p>
              {tomorrow.length === 0 ? (
                <p className="text-sm text-gray-400">Нет назначенных встреч</p>
              ) : (
                <ul className="space-y-2">
                  {tomorrow.map((a, i) => (
                    <MeetingMiniRow key={`tm-${a.bin}-${i}`} a={a} findEvidence={findEvidence} managerName={managerName} />
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-black text-gray-800 uppercase tracking-widest flex items-center gap-2">
              <Calendar size={16} className="text-blue-500" />
              Календарь
            </h3>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => shiftMonth(-1)} className="p-1.5 rounded-lg hover:bg-gray-100" aria-label="Пред. месяц">
                <ChevronLeft size={18} className="text-gray-500" />
              </button>
              <span className="text-sm font-bold text-gray-700 capitalize min-w-[140px] text-center">{monthLabel}</span>
              <button type="button" onClick={() => shiftMonth(1)} className="p-1.5 rounded-lg hover:bg-gray-100" aria-label="След. месяц">
                <ChevronRight size={18} className="text-gray-500" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black text-gray-400 mb-1">
            {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => (
              <div key={d}>
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (d == null) return <div key={`e-${i}`} className="aspect-square" />;
              const ymd = localYmd(new Date(view.y, view.m, d));
              const n = byDay.get(ymd) || 0;
              const isToday = ymd === todayYmd;
              return (
                <div
                  key={d}
                  className={`aspect-square rounded-lg flex flex-col items-center justify-center text-xs border ${
                    isToday ? 'border-blue-500 bg-blue-50' : 'border-gray-100 bg-gray-50/80'
                  }`}
                >
                  <span className={`font-bold ${isToday ? 'text-blue-700' : 'text-gray-700'}`}>{d}</span>
                  {n > 0 && <span className="text-[9px] font-black text-blue-600">{n}</span>}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <section className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm overflow-x-auto">
        <h3 className="text-xs font-black text-gray-800 uppercase tracking-widest flex items-center gap-2 mb-4">
          <CalendarDays size={16} className="text-blue-500" />
          Все назначенные встречи
        </h3>
        <table className="w-full text-sm border-collapse min-w-[700px]">
          <thead>
            <tr className="text-[10px] font-black text-gray-400 border-b">
              <th className="text-left py-2">Дата встречи</th>
              <th className="text-left py-2">Контрагент</th>
              <th className="text-center py-2">Тип</th>
              <th className="text-left py-2">Отчёт</th>
              <th className="text-right py-2">Статус</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-gray-400">
                  Нет назначенных встреч в загруженных отчётах
                </td>
              </tr>
            ) : (
              rows.map((a, idx) => {
                const ymd = toYmd(a.date);
                const ev = findEvidence(a, managerName);
                return (
                  <tr key={`${a.bin}-${a.date}-${idx}`} className="text-gray-800">
                    <td className="py-3 text-gray-600 whitespace-nowrap">
                      {ymd
                        ? new Date(ymd + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
                        : a.date}
                    </td>
                    <td className="py-3 font-bold">
                      {a.entityName}
                      <div className="text-[10px] font-mono text-gray-400">{a.bin}</div>
                    </td>
                    <td className="py-3 text-center">
                      <span
                        className={`px-2 py-1 rounded text-[10px] font-black uppercase ${
                          a.type === 'Новая' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {a.type}
                      </span>
                    </td>
                    <td className="py-3 text-gray-500 text-xs">{a.reportDate}</td>
                    <td className="py-3 text-right">
                      {ev ? (
                        <span className="text-emerald-600 font-black text-[10px] bg-emerald-50 px-2 py-1 rounded-full uppercase">Выполнено</span>
                      ) : (
                        <span className="text-amber-600 font-black text-[10px] bg-amber-50 px-2 py-1 rounded-full uppercase">Ожидает</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function MeetingMiniRow({
  a,
  findEvidence,
  managerName,
}: {
  a: UiAssignedWithReport;
  findEvidence: (planned: UiAssigned, manager: string) => { evidence: UiConducted; reportDate: string } | null;
  managerName: string;
}) {
  const ev = findEvidence(a, managerName);
  return (
    <li className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 p-3 rounded-2xl bg-amber-50/80 border border-amber-100/80 text-sm">
      <div>
        <div className="font-bold text-gray-900">{a.entityName}</div>
        <div className="text-[10px] text-gray-500 font-mono">{a.bin}</div>
      </div>
      <div className="text-xs font-bold">
        {ev ? <span className="text-emerald-700">Выполнено</span> : <span className="text-amber-700">Ожидает</span>}
      </div>
    </li>
  );
}
