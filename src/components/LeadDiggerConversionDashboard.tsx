import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { leadDiggerConversionStatsApi, type LeadDiggerConversionRow } from '../lib/enterpriseLeadsApi';

export function LeadDiggerConversionDashboard() {
  const [rows, setRows] = useState<LeadDiggerConversionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setRows(await leadDiggerConversionStatsApi());
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4 text-left animate-in fade-in">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="mb-6 flex justify-between items-end border-b border-gray-100 pb-4 gap-3">
          <div>
            <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-1">
              Лидорубы · доходимость
            </h2>
            <p className="text-xs text-gray-500">Проведено ÷ всего передано</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="p-2 text-gray-400 hover:text-blue-600 rounded-lg border border-gray-100"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {err ? <p className="text-sm font-bold text-red-600 mb-4">{err}</p> : null}

        {loading && rows.length === 0 ? (
          <p className="text-sm text-gray-400 py-4">Загрузка…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-400 py-4">Пока нет переданных лидов</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[10px] uppercase text-gray-400 font-bold bg-gray-50">
                <tr>
                  <th className="px-4 py-3 rounded-l-lg">Лидоруб</th>
                  <th className="px-4 py-3 text-right">Передано</th>
                  <th className="px-4 py-3 text-right">Проведено</th>
                  <th className="px-4 py-3 rounded-r-lg text-right">Конверсия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((r) => (
                  <tr key={r.creatorId} className="hover:bg-gray-50/50 transition">
                    <td className="px-4 py-4 font-bold text-gray-900">{r.creatorName || '—'}</td>
                    <td className="px-4 py-4 text-right text-gray-600 font-mono">{r.transferredCount}</td>
                    <td className="px-4 py-4 text-right text-gray-600 font-mono">{r.completedCount}</td>
                    <td className="px-4 py-4 text-right font-black text-blue-700">{r.conversion}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
