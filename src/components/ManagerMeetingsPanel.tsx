import { useMemo, useState } from 'react';
import { Calendar, CalendarDays, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import type { FullReport, UiAssigned, UiConducted } from '../lib/crmApi';

export type UiAssignedWithReport = UiAssigned & { reportDate: string };

function formatDisplayDate(raw: string): string {
  const ymd = toYmd(raw);
  if (!ymd) return raw;
  const [y, m, d] = ymd.split('-');
  return `${d}-${m}-${y}`;
}

function toYmd(raw: string): string | null {
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) {
    const d = m[1].padStart(2, '0');
    const mo = m[2].padStart(2, '0');
    return `${m[3]}-${mo}-${d}`;
  }
  const mDash = t.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (mDash) {
    const d = mDash[1].padStart(2, '0');
    const mo = mDash[2].padStart(2, '0');
    return `${mDash[3]}-${mo}-${d}`;
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

function buildLastDaysRange(days: number): { from: string; to: string } {
  const to = localYmd(new Date());
  const from = addDaysYmd(to, -(days - 1));
  return { from, to };
}

function normalizeMeetingType(value: string): string {
  return value.trim().toLowerCase().replace(/ё/g, 'е');
}

export function ManagerMeetingsPanel({
  allReports,
  findEvidence,
  managerName,
  mode = 'all',
}: {
  allReports: FullReport[];
  findEvidence: (planned: UiAssigned, manager: string) => { evidence: UiConducted; reportDate: string } | null;
  managerName: string;
  mode?: 'calendar' | 'assigned' | 'all';
}) {
  const todayYmd = localYmd(new Date());
  const [view, setView] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [selectedYmd, setSelectedYmd] = useState(todayYmd);
  const [assignedFilterFrom, setAssignedFilterFrom] = useState('');
  const [assignedFilterTo, setAssignedFilterTo] = useState('');
  const [assignedStatusFilter, setAssignedStatusFilter] = useState<'all' | 'done' | 'pending'>('all');
  const [assignedTypeFilter, setAssignedTypeFilter] = useState<'all' | 'Новая' | 'Повторная'>('all');

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

  const selectedRows = useMemo(() => {
    return rows.filter((a) => toYmd(a.date) === selectedYmd);
  }, [rows, selectedYmd]);

  const filteredAssignedRows = useMemo(() => {
    return rows.filter((a) => {
      const ymd = toYmd(a.date);
      if (!ymd) return false;
      if (assignedFilterFrom && ymd < assignedFilterFrom) return false;
      if (assignedFilterTo && ymd > assignedFilterTo) return false;
      const isDone = Boolean(findEvidence(a, managerName));
      if (assignedStatusFilter === 'done' && !isDone) return false;
      if (assignedStatusFilter === 'pending' && isDone) return false;
      if (assignedTypeFilter !== 'all') {
        const rowType = normalizeMeetingType(a.type);
        if (assignedTypeFilter === 'Новая' && !rowType.startsWith('нов')) return false;
        if (assignedTypeFilter === 'Повторная' && !rowType.startsWith('повтор')) return false;
      }
      return true;
    });
  }, [rows, assignedFilterFrom, assignedFilterTo, assignedStatusFilter, assignedTypeFilter, findEvidence, managerName]);

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

  const selectedDateLabel = useMemo(() => formatDisplayDate(selectedYmd), [selectedYmd]);

  return (
    <div className="space-y-4 sm:space-y-6 text-left">
      {mode !== 'assigned' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="bg-white border border-amber-100 rounded-3xl p-4 sm:p-6 shadow-sm">
              <h3 className="text-xs font-black text-amber-800 uppercase tracking-widest flex items-center gap-2 mb-4">
                <Clock size={16} className="text-amber-500" />
                Сегодня · завтра
              </h3>
              <div className="space-y-4">
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase mb-2">Сегодня</p>
                  {today.length === 0 ? (
                    <p className="text-xs sm:text-sm text-gray-400">Нет назначенных встреч</p>
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
                    <p className="text-xs sm:text-sm text-gray-400">Нет назначенных встреч</p>
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

            <section className="bg-white border border-gray-200 rounded-3xl p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 className="text-xs font-black text-gray-800 uppercase tracking-widest flex items-center gap-2">
                  <Calendar size={16} className="text-blue-500" />
                  Календарь
                </h3>
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <button type="button" onClick={() => shiftMonth(-1)} className="p-1.5 rounded-lg hover:bg-gray-100" aria-label="Пред. месяц">
                    <ChevronLeft size={18} className="text-gray-500" />
                  </button>
                  <span className="text-xs font-bold text-gray-700 capitalize min-w-[100px] sm:min-w-[120px] text-center">{monthLabel}</span>
                  <button type="button" onClick={() => shiftMonth(1)} className="p-1.5 rounded-lg hover:bg-gray-100" aria-label="След. месяц">
                    <ChevronRight size={18} className="text-gray-500" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      setView({ y: d.getFullYear(), m: d.getMonth() });
                      setSelectedYmd(todayYmd);
                    }}
                    className="px-2 py-1 rounded-lg border border-gray-200 text-[10px] font-black uppercase tracking-wider text-gray-600 hover:bg-gray-50"
                  >
                    Сегодня
                  </button>
                </div>
              </div>
              <div className="max-w-[340px] sm:max-w-[380px] mx-auto">
                <div className="grid grid-cols-7 gap-1 text-center text-[9px] font-black text-gray-400 mb-1">
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
                    const isSelected = ymd === selectedYmd;
                    return (
                      <button
                        type="button"
                        key={d}
                        onClick={() => setSelectedYmd(ymd)}
                        title={n > 0 ? `Встреч: ${n}` : 'Нет встреч'}
                        className={`aspect-square rounded-md flex flex-col items-center justify-center text-[11px] border ${
                          isSelected
                            ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-300'
                            : isToday
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-100 bg-gray-50/80'
                        }`}
                      >
                        <span className={`font-bold ${isSelected ? 'text-indigo-700' : isToday ? 'text-blue-700' : 'text-gray-700'}`}>{d}</span>
                        {n > 0 && <span className="text-[8px] font-black text-blue-600 leading-none">{n}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          </div>

          <section className="bg-white border border-indigo-100 rounded-3xl p-4 sm:p-6 shadow-sm">
            <h3 className="text-xs font-black text-indigo-800 uppercase tracking-widest flex items-center gap-2 mb-4">
              <CalendarDays size={16} className="text-indigo-500" />
              Встречи на {selectedDateLabel}
            </h3>
            {selectedRows.length === 0 ? (
              <p className="text-xs sm:text-sm text-gray-400">На выбранный день назначенных встреч нет.</p>
            ) : (
              <ul className="space-y-2">
                {selectedRows.map((a, i) => (
                  <MeetingMiniRow key={`sel-${a.bin}-${a.date}-${i}`} a={a} findEvidence={findEvidence} managerName={managerName} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {mode !== 'calendar' && (
        <section className="bg-white border border-gray-200 rounded-3xl p-4 sm:p-6 shadow-sm overflow-x-auto">
          <h3 className="text-xs font-black text-gray-800 uppercase tracking-widest flex items-center gap-2 mb-4">
            <CalendarDays size={16} className="text-blue-500" />
            Все назначенные встречи
          </h3>
          <div className="bg-gray-50/70 border border-gray-100 rounded-2xl p-3 sm:p-4 mb-4 flex flex-wrap gap-3 items-end">
            <div className="space-y-1.5 w-full sm:w-auto">
              <label className="text-[10px] font-black text-gray-400 uppercase">Дата с</label>
              <input
                type="date"
                className="w-full sm:w-auto px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm"
                value={assignedFilterFrom}
                onChange={(e) => setAssignedFilterFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 w-full sm:w-auto">
              <label className="text-[10px] font-black text-gray-400 uppercase">Дата по</label>
              <input
                type="date"
                className="w-full sm:w-auto px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm"
                value={assignedFilterTo}
                onChange={(e) => setAssignedFilterTo(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 w-full sm:w-auto sm:min-w-[200px]">
              <label className="text-[10px] font-black text-gray-400 uppercase">Тип встречи</label>
              <select
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold"
                value={assignedTypeFilter}
                onChange={(e) => setAssignedTypeFilter(e.target.value as 'all' | 'Новая' | 'Повторная')}
              >
                <option value="all">Все</option>
                <option value="Новая">Новая</option>
                <option value="Повторная">Повторная</option>
              </select>
            </div>
            <div className="space-y-1.5 w-full sm:w-auto sm:min-w-[200px]">
              <label className="text-[10px] font-black text-gray-400 uppercase">Статус</label>
              <select
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold"
                value={assignedStatusFilter}
                onChange={(e) => setAssignedStatusFilter(e.target.value as 'all' | 'done' | 'pending')}
              >
                <option value="all">Все</option>
                <option value="done">Выполнено</option>
                <option value="pending">Ожидает</option>
              </select>
            </div>
            <div className="w-full sm:w-auto sm:min-w-[250px]">
              <p className="text-[10px] font-black text-gray-400 uppercase mb-1.5">Быстрый период</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const today = localYmd(new Date());
                    setAssignedFilterFrom(today);
                    setAssignedFilterTo(today);
                  }}
                  className="px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border border-gray-200 text-gray-600 hover:bg-white"
                >
                  Сегодня
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const range = buildLastDaysRange(7);
                    setAssignedFilterFrom(range.from);
                    setAssignedFilterTo(range.to);
                  }}
                  className="px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border border-gray-200 text-gray-600 hover:bg-white"
                >
                  7 дней
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const range = buildLastDaysRange(30);
                    setAssignedFilterFrom(range.from);
                    setAssignedFilterTo(range.to);
                  }}
                  className="px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border border-gray-200 text-gray-600 hover:bg-white"
                >
                  30 дней
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setAssignedFilterFrom('');
                setAssignedFilterTo('');
                setAssignedStatusFilter('all');
                setAssignedTypeFilter('all');
              }}
              className="w-full sm:w-auto px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border border-gray-200 text-gray-600 hover:bg-white"
            >
              Сбросить фильтр
            </button>
          </div>
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
            {filteredAssignedRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-gray-400">
                  Нет встреч по выбранным фильтрам
                </td>
              </tr>
            ) : (
              filteredAssignedRows.map((a, idx) => {
                const ymd = toYmd(a.date);
                const ev = findEvidence(a, managerName);
                return (
                  <tr key={`${a.bin}-${a.date}-${idx}`} className="text-gray-800">
                    <td className="py-3 text-gray-600 whitespace-nowrap">
                      {ymd ? formatDisplayDate(ymd) : a.date}
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
                    <td className="py-3 text-gray-500 text-xs">{formatDisplayDate(a.reportDate)}</td>
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
      )}
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
    <li className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 p-2.5 sm:p-3 rounded-2xl bg-amber-50/80 border border-amber-100/80 text-xs sm:text-sm">
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
