import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, RotateCcw, XCircle } from 'lucide-react';
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
    <div className="bg-white border border-violet-100 rounded-3xl p-4 sm:p-6 shadow-sm space-y-4 text-left">
      <div>
        <h3 className="text-xs font-black uppercase tracking-widest text-violet-700">Крупные лиды от лидорубов</h3>
        <p className="text-[10px] text-gray-400 font-bold mt-1">Назначенные руководителем · обратная связь обязательна</p>
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
        <ul className="space-y-3">
          {rows.map((r) => {
            const blocked = isPastMeetingWithoutStatus(r);
            const busy = busyId === r.id;
            return (
              <li key={r.id} className="border border-gray-100 rounded-2xl p-4 space-y-3">
                <div className="flex flex-wrap justify-between gap-2">
                  <div>
                    <p className="font-black text-gray-900">{r.clientName}</p>
                    <p className="text-[10px] font-mono text-gray-400">{r.bin}</p>
                    <p className="text-[10px] text-violet-700 font-bold mt-1">Инициатор: {r.creatorName || '—'}</p>
                    <p className="text-[10px] text-gray-400">Встреча: {formatLeadDate(r.meetingDate)}</p>
                  </div>
                  <div className="text-right text-[10px] font-black uppercase">
                    {r.meetingStatus === 'completed' ? (
                      <span className="text-emerald-700">Проведена</span>
                    ) : r.meetingStatus === 'cancelled' ? (
                      <span className="text-red-600">Не состоялась</span>
                    ) : blocked ? (
                      <span className="text-amber-700">Нужен статус</span>
                    ) : (
                      <span className="text-gray-400">В плане</span>
                    )}
                  </div>
                </div>

                {blocked ? (
                  <p className="text-[10px] font-bold text-amber-700 flex items-center gap-1">
                    <AlertTriangle size={12} />
                    Дата встречи прошла — укажите «Проведено» или «Не состоялось», прежде чем двигать эту компанию дальше
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy || r.meetingStatus === 'completed'}
                    onClick={() => void run(r.id, () => managerSetLeadMeetingStatusApi(r.id, 'completed'))}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase disabled:opacity-40"
                  >
                    <CheckCircle size={14} />
                    Проведено
                  </button>
                  <button
                    type="button"
                    disabled={busy || r.meetingStatus === 'cancelled'}
                    onClick={() => void run(r.id, () => managerSetLeadMeetingStatusApi(r.id, 'cancelled'))}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-red-200 text-red-600 text-[10px] font-black uppercase disabled:opacity-40"
                  >
                    <XCircle size={14} />
                    Не состоялось
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (!window.confirm('Вернуть лид на СМБ инициатору?')) return;
                      void run(r.id, () => managerReturnLeadToSmbApi(r.id));
                    }}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-orange-200 text-orange-700 text-[10px] font-black uppercase disabled:opacity-40"
                  >
                    <RotateCcw size={14} />
                    Вернуть на СМБ
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export { isPastMeetingWithoutStatus };
