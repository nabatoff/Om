import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import {
  ALL_TIME_FROM,
  ALL_TIME_TO,
  adminDateFilterBounds,
  buildMonthSelectOptions,
  calendarMonthFromYm,
  calendarWeekPeriodBounds,
  inferPeriodFilterKind,
  rollingDaysPeriodBounds,
  todayPeriodBounds,
  type PeriodFilterKind,
} from '../lib/periodBounds';

const quickBtn =
  'px-3 py-1.5 rounded-lg text-xs font-black border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 uppercase tracking-wide';

type Props = {
  from: string;
  to: string;
  setFrom: Dispatch<SetStateAction<string>>;
  setTo: Dispatch<SetStateAction<string>>;
};

export function PeriodFilterFields({ from, to, setFrom, setTo }: Props) {
  const inferred = useMemo(() => inferPeriodFilterKind(from, to), [from, to]);
  /** Пока даты совпадают с «неделей» и т.п., но в списке выбран «Свой диапазон» — показываем поля дат. */
  const [forceRangeUi, setForceRangeUi] = useState(false);

  useEffect(() => {
    if (inferred.kind === 'range') setForceRangeUi(false);
  }, [inferred.kind, from, to]);

  const kind: PeriodFilterKind = forceRangeUi ? 'range' : inferred.kind;

  const monthYm = useMemo(() => {
    if (inferred.kind === 'month') return inferred.monthYm;
    const f = from.trim();
    if (f.length >= 7) return f.slice(0, 7);
    return inferred.monthYm;
  }, [from, inferred.kind, inferred.monthYm]);

  const monthOptions = useMemo(() => buildMonthSelectOptions(60, monthYm), [monthYm]);

  const apply = (nextFrom: string, nextTo: string) => {
    setFrom(nextFrom);
    setTo(nextTo);
  };

  const onMainSelect = (v: PeriodFilterKind) => {
    if (v === 'range') {
      setForceRangeUi(true);
      return;
    }
    setForceRangeUi(false);
    if (v === 'all') {
      apply(ALL_TIME_FROM, ALL_TIME_TO);
    } else if (v === 'today') {
      const b = todayPeriodBounds();
      apply(b.from, b.to);
    } else if (v === 'week') {
      const w = calendarWeekPeriodBounds();
      apply(w.from, w.to);
    } else if (v === 'month') {
      const b = calendarMonthFromYm(monthYm) ?? calendarMonthFromYm(adminDateFilterBounds('', '').from.slice(0, 7));
      if (b) apply(b.from, b.to);
    }
  };

  return (
    <div className="w-full space-y-3 text-left">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-black text-gray-400 uppercase shrink-0">Быстрый период</span>
        <button
          type="button"
          className={quickBtn}
          onClick={() => {
            setForceRangeUi(false);
            const b = todayPeriodBounds();
            apply(b.from, b.to);
          }}
        >
          Сегодня
        </button>
        <button
          type="button"
          className={quickBtn}
          onClick={() => {
            setForceRangeUi(false);
            const b = rollingDaysPeriodBounds(7);
            apply(b.from, b.to);
          }}
        >
          7 дней
        </button>
        <button
          type="button"
          className={quickBtn}
          onClick={() => {
            setForceRangeUi(false);
            const b = rollingDaysPeriodBounds(30);
            apply(b.from, b.to);
          }}
        >
          30 дней
        </button>
        <button
          type="button"
          className={quickBtn}
          onClick={() => {
            setForceRangeUi(false);
            apply(ALL_TIME_FROM, ALL_TIME_TO);
          }}
        >
          Все время
        </button>
      </div>
      <div className="flex flex-wrap gap-3 sm:gap-4 items-end">
        <div className="w-full sm:flex-1 sm:min-w-[200px] space-y-1.5">
          <label className="text-[10px] font-black text-gray-400 uppercase">Тип периода</label>
          <select
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold"
            value={kind}
            onChange={(e) => onMainSelect(e.target.value as PeriodFilterKind)}
          >
            <option value="today">Сегодня</option>
            <option value="week">Текущая неделя</option>
            <option value="month">Месяц</option>
            <option value="all">Все время</option>
            <option value="range">Свой диапазон</option>
          </select>
        </div>
        {kind === 'month' && (
          <div className="w-full sm:flex-1 sm:min-w-[200px] space-y-1.5">
            <label className="text-[10px] font-black text-gray-400 uppercase">Месяц</label>
            <select
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold"
              value={monthYm}
              onChange={(e) => {
                setForceRangeUi(false);
                const b = calendarMonthFromYm(e.target.value);
                if (b) apply(b.from, b.to);
              }}
            >
              {monthOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        )}
        {kind === 'range' && (
          <>
            <div className="w-full sm:flex-1 sm:min-w-[150px] space-y-1.5">
              <label className="text-[10px] font-black text-gray-400 uppercase">Дата с</label>
              <input
                type="date"
                className="w-full px-4 py-2.5 bg-gray-50 border rounded-xl text-sm"
                value={from}
                onChange={(e) => {
                  setForceRangeUi(false);
                  setFrom(e.target.value);
                }}
              />
            </div>
            <div className="w-full sm:flex-1 sm:min-w-[150px] space-y-1.5">
              <label className="text-[10px] font-black text-gray-400 uppercase">Дата по</label>
              <input
                type="date"
                className="w-full px-4 py-2.5 bg-gray-50 border rounded-xl text-sm"
                value={to}
                onChange={(e) => {
                  setForceRangeUi(false);
                  setTo(e.target.value);
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
