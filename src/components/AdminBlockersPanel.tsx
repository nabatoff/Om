import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { listManagerBlockersApi, type ManagerBlocker } from '../lib/managerBlockersApi';

type Props = {
  filterManager?: string;
};

function formatWhen(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Админ: активные блокеры менеджеров на вкладке KPI. */
export function AdminBlockersPanel({ filterManager = 'Все' }: Props) {
  const [rows, setRows] = useState<ManagerBlocker[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await listManagerBlockersApi(true);
      setRows(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка загрузки');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    if (filterManager === 'Все') return rows;
    return rows.filter((r) => r.managerName === filterManager);
  }, [rows, filterManager]);

  const byManager = useMemo(() => {
    const map = new Map<string, ManagerBlocker[]>();
    for (const r of visible) {
      const list = map.get(r.managerName) || [];
      list.push(r);
      map.set(r.managerName, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], 'ru'));
  }, [visible]);

  return (
    <section className="bg-white border border-amber-100 rounded-2xl shadow-sm overflow-hidden text-left">
      <div className="p-4 border-b border-amber-100 bg-amber-50/40 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-amber-100 text-amber-700 rounded">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-slate-700 uppercase tracking-wider text-xs">Блокеры менеджеров</h3>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Активные проблемы · {visible.length}
              {filterManager !== 'Все' ? ` · ${filterManager}` : ''}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-200 text-amber-800 text-[10px] font-bold uppercase hover:bg-amber-50"
        >
          <RefreshCw size={12} /> Обновить
        </button>
      </div>

      {err ? <p className="px-4 py-3 text-sm text-red-600">{err}</p> : null}
      {loading ? <p className="px-4 py-3 text-sm text-gray-400">Загрузка…</p> : null}

      {!loading && visible.length === 0 ? (
        <p className="px-4 py-4 text-sm text-gray-500">Активных блокеров нет</p>
      ) : null}

      {!loading && byManager.length > 0 ? (
        <div className="divide-y divide-amber-50">
          {byManager.map(([manager, items]) => (
            <div key={manager} className="px-4 py-3">
              <p className="text-xs font-bold text-slate-800 mb-2">
                {manager}{' '}
                <span className="text-amber-700 font-semibold">({items.length})</span>
              </p>
              <ul className="space-y-2">
                {items.map((b) => (
                  <li key={b.id} className="rounded-xl border border-amber-100 bg-amber-50/20 p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-bold text-gray-900 text-sm">{b.entityName || '—'}</p>
                      <p className="text-[10px] text-gray-400">{formatWhen(b.createdAt)}</p>
                    </div>
                    {b.bin ? <p className="text-[10px] font-mono text-gray-400 mt-0.5">{b.bin}</p> : null}
                    <p className="text-sm text-gray-800 mt-2 whitespace-pre-wrap">{b.description}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
