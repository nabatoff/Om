import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  formatLeadDate,
  leadDisplayStatus,
  listEnterpriseLeadsApi,
  type EnterpriseLead,
} from '../lib/enterpriseLeadsApi';

/** Readonly список всех переданных в круп (для админа / view-only). */
export function EnterpriseLeadsAllPanel() {
  const [rows, setRows] = useState<EnterpriseLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await listEnterpriseLeadsApi('all');
      setRows(data.filter((r) => r.routingStatus !== 'returned_to_smb'));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100 text-left space-y-4">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-4">
        <div>
          <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Переданные в круп</h2>
          <p className="text-[11px] text-gray-500 mt-1">Все лиды в воронке крупного бизнеса (только просмотр)</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold uppercase text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Обновить
        </button>
      </div>

      {err ? <p className="text-sm font-bold text-red-600">{err}</p> : null}
      {loading && rows.length === 0 ? (
        <p className="text-sm text-gray-400">Загрузка…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-400">Нет переданных лидов</p>
      ) : (
        <div className="overflow-x-auto -mx-1 om-scroll">
          <table className="w-full text-left border-collapse min-w-[720px]">
            <thead>
              <tr className="text-[9px] font-bold text-gray-400 uppercase border-b border-gray-100 tracking-widest">
                <th className="pb-3 pr-3">Компания</th>
                <th className="pb-3 pr-3">БИН</th>
                <th className="pb-3 pr-3">Лидоруб</th>
                <th className="pb-3 pr-3">Менеджер</th>
                <th className="pb-3 pr-3">Статус</th>
                <th className="pb-3">Передано</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = leadDisplayStatus(r);
                return (
                  <tr key={r.id} className="border-b border-gray-50 text-sm">
                    <td className="py-3 pr-3 font-bold text-gray-800">{r.clientName || '—'}</td>
                    <td className="py-3 pr-3 font-mono text-xs text-gray-500">{r.bin}</td>
                    <td className="py-3 pr-3 text-gray-700">{r.creatorName || '—'}</td>
                    <td className="py-3 pr-3 text-gray-700">{r.assignedManagerName || '—'}</td>
                    <td className="py-3 pr-3">
                      <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded ${st.color}`}>
                        {st.label}
                      </span>
                    </td>
                    <td className="py-3 text-gray-600">{formatLeadDate(r.transferredOn || r.transferredAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
