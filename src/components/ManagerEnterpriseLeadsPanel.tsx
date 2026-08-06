import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Building2, RotateCcw } from 'lucide-react';
import {
  formatLeadDate,
  listEnterpriseLeadsApi,
  managerReturnLeadToSmbApi,
  managerSetLeadMeetingStatusApi,
  type EnterpriseLead,
} from '../lib/enterpriseLeadsApi';
import { formatYmdLocal } from '../lib/periodBounds';

type Props = {
  onChanged?: () => void | Promise<void>;
};

function isPastMeetingWithoutStatus(lead: EnterpriseLead): boolean {
  if (lead.meetingStatus) return false;
  const day = lead.meetingDate || formatYmdLocal(new Date());
  const today = formatYmdLocal(new Date());
  return day < today;
}

export function ManagerEnterpriseLeadsPanel({ onChanged }: Props) {
  const [rows, setRows] = useState<EnterpriseLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setRows(await listEnterpriseLeadsApi('mine_assigned'));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (leadId: string, fn: () => Promise<void>) => {
    setBusyId(leadId);
    setErr(null);
    try {
      await fn();
      await load();
      await onChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6 text-left">
      <div className="flex items-center justify-between border-b border-gray-100 pb-4">
        <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">
          Мой план встреч (Крупный бизнес)
        </h2>
      </div>

      {err ? (
        <p className="text-sm font-bold text-red-600 flex items-center gap-2">
          <AlertTriangle size={16} />
          {err}
        </p>
      ) : null}

      {loading && rows.length === 0 ? (
        <p className="text-sm text-gray-400">Загрузка…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-400">Нет назначенных лидов</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rows.map((r) => {
            const blocked = isPastMeetingWithoutStatus(r);
            const busy = busyId === r.id;
            const done = r.meetingStatus === 'completed';
            const cancelled = r.meetingStatus === 'cancelled';

            if (blocked) {
              return (
                <div
                  key={r.id}
                  className="border-2 border-red-100 rounded-2xl p-5 bg-red-50/30 flex flex-col h-full relative shadow-sm"
                >
                  <div className="absolute top-0 right-0 bg-gray-100 text-gray-500 text-[9px] uppercase font-bold px-3 py-1 rounded-bl-lg">
                    От: {r.creatorName || 'Лидоруб'}
                  </div>

                  <div className="flex items-center gap-2 mb-2 mt-2">
                    <span className="bg-red-100 text-red-700 text-[10px] uppercase font-bold px-2 py-0.5 rounded flex items-center gap-1 animate-pulse">
                      <AlertTriangle size={12} />
                      Время вышло
                    </span>
                  </div>

                  <div className="font-extrabold text-gray-900 text-lg mb-1">{r.clientName}</div>
                  <div className="text-xs font-medium text-red-600 mb-4">
                    Встреча была: {formatLeadDate(r.meetingDate)}
                  </div>

                  <div className="mt-auto bg-white p-3 rounded-xl border border-red-100">
                    <p className="text-xs text-gray-600 mb-3 font-medium text-center">
                      Карточка заблокирована. Укажите итог встречи.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void run(r.id, () => managerSetLeadMeetingStatusApi(r.id, 'completed'))}
                        className="bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-xs font-bold transition disabled:opacity-40"
                      >
                        Состоялась
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void run(r.id, () => managerSetLeadMeetingStatusApi(r.id, 'cancelled'))}
                        className="bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg text-xs font-bold transition disabled:opacity-40"
                      >
                        Не состоялась
                      </button>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={r.id}
                className="border border-gray-100 rounded-2xl p-5 hover:shadow-md transition bg-white flex flex-col h-full relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 bg-gray-100 text-gray-500 text-[9px] uppercase font-bold px-3 py-1 rounded-bl-lg">
                  От: {r.creatorName || 'Лидоруб'}
                </div>

                <div className="flex items-center gap-3 mb-4 mt-2">
                  <div className="bg-purple-100 text-purple-700 p-3 rounded-xl">
                    <Building2 size={24} />
                  </div>
                  <div>
                    <div className="font-extrabold text-gray-900 text-lg leading-tight">{r.clientName}</div>
                    <div className="text-xs font-medium text-gray-500 mt-0.5">
                      {formatLeadDate(r.meetingDate)}
                    </div>
                    <div className="text-[10px] font-mono text-gray-400">{r.bin}</div>
                  </div>
                </div>

                {(done || cancelled) && (
                  <div className="mb-3">
                    <span
                      className={`text-[10px] uppercase font-bold px-2 py-1 rounded ${
                        done ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {done ? 'Проведена' : 'Не состоялась'}
                    </span>
                  </div>
                )}

                <div className="mt-auto space-y-2 pt-4 border-t border-gray-50">
                  {!done && !cancelled ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void run(r.id, () => managerSetLeadMeetingStatusApi(r.id, 'completed'))}
                        className="w-full bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-600 hover:text-white py-2 rounded-xl text-sm font-bold transition disabled:opacity-40"
                      >
                        Провести встречу
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void run(r.id, () => managerSetLeadMeetingStatusApi(r.id, 'cancelled'))}
                        className="w-full bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 py-2 rounded-xl text-sm font-bold transition disabled:opacity-40"
                      >
                        Не состоялась
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (!window.confirm('Вернуть лид на СМБ инициатору?')) return;
                      void run(r.id, () => managerReturnLeadToSmbApi(r.id));
                    }}
                    className="w-full bg-white text-orange-600 border border-orange-200 hover:bg-orange-50 py-2 rounded-xl text-sm font-bold transition flex justify-center items-center gap-2 disabled:opacity-40"
                  >
                    <RotateCcw size={14} />
                    Забраковать (На СМБ)
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { isPastMeetingWithoutStatus };
