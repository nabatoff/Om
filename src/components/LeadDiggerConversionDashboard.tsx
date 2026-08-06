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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-black text-gray-800 uppercase tracking-widest">Лидорубы · доходимость</h2>
          <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">Проведено ÷ всего передано</p>
        </div>
        <button type="button" onClick={() => void load()} className="p-2 text-gray-400 hover:text-blue-600">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {err ? <p className="text-sm font-bold text-red-600">{err}</p> : null}

      <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm">
        {loading && rows.length === 0 ? (
          <p className="p-6 text-sm text-gray-400">Загрузка…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-gray-400">Пока нет переданных лидов</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-black text-gray-400 uppercase border-b bg-gray-50">
                <th className="text-left p-3">Лидоруб</th>
                <th className="text-right p-3">Передано</th>
                <th className="text-right p-3">Проведено</th>
                <th className="text-right p-3">Конверсия</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.creatorId}>
                  <td className="p-3 font-bold">{r.creatorName || '—'}</td>
                  <td className="p-3 text-right font-mono">{r.transferredCount}</td>
                  <td className="p-3 text-right font-mono">{r.completedCount}</td>
                  <td className="p-3 text-right font-black text-violet-700">{r.conversion}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
