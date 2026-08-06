import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, UserCheck } from 'lucide-react';
import type { UiManagerProfile } from '../lib/crmApi';
import {
  adminAssignEnterpriseLeadApi,
  formatLeadDate,
  listEnterpriseLeadsApi,
  listLeadEventsApi,
  type EnterpriseLead,
  type LeadEvent,
} from '../lib/enterpriseLeadsApi';

type Props = {
  managers: UiManagerProfile[];
  onAssigned?: () => void | Promise<void>;
};

export function EnterpriseLeadsBuffer({ managers, onAssigned }: Props) {
  const [tab, setTab] = useState<'pending' | 'assigned'>('pending');
  const [rows, setRows] = useState<EnterpriseLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [pickManager, setPickManager] = useState<Record<string, string>>({});
  const [eventsFor, setEventsFor] = useState<string | null>(null);
  const [events, setEvents] = useState<LeadEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await listEnterpriseLeadsApi(tab);
      setRows(data);
      const picks: Record<string, string> = {};
      for (const r of data) {
        picks[r.id] = r.assignedManagerId || managers[0]?.id || '';
      }
      setPickManager((prev) => ({ ...picks, ...prev }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [managers, tab]);

  useEffect(() => {
    void load();
  }, [load]);

  const assign = async (leadId: string) => {
    const managerId = pickManager[leadId];
    if (!managerId) {
      setErr('Выберите менеджера');
      return;
    }
    setAssigningId(leadId);
    setErr(null);
    try {
      await adminAssignEnterpriseLeadApi(leadId, managerId);
      await load();
      await onAssigned?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось назначить');
    } finally {
      setAssigningId(null);
    }
  };

  const openEvents = async (leadId: string) => {
    setEventsFor(leadId);
    try {
      setEvents(await listLeadEventsApi(leadId));
    } catch {
      setEvents([]);
    }
  };

  return (
    <div className="space-y-4 text-left animate-in fade-in">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-gray-800 uppercase tracking-widest">Входящие лиды</h2>
          <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">От лидорубов · крупный бизнес</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1">
            <button
              type="button"
              onClick={() => setTab('pending')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase ${tab === 'pending' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
            >
              Буфер
            </button>
            <button
              type="button"
              onClick={() => setTab('assigned')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase ${tab === 'assigned' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
            >
              Назначенные
            </button>
          </div>
          <button type="button" onClick={() => void load()} className="p-2 text-gray-400 hover:text-blue-600" title="Обновить">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {err ? (
        <p className="text-sm font-bold text-red-600 flex items-center gap-2">
          <AlertTriangle size={16} />
          {err}
        </p>
      ) : null}

      <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm">
        {loading && rows.length === 0 ? (
          <p className="p-6 text-sm text-gray-400">Загрузка…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-gray-400">Буфер пуст</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-[10px] font-black text-gray-400 uppercase border-b bg-gray-50">
                  <th className="text-left p-3">Компания</th>
                  <th className="text-left p-3">БИН</th>
                  <th className="text-left p-3">Лидоруб</th>
                  <th className="text-left p-3">Передано</th>
                  <th className="text-left p-3">Назначить</th>
                  <th className="text-left p-3"> </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.id} className="text-gray-800">
                    <td className="p-3 font-bold">{r.clientName}</td>
                    <td className="p-3 font-mono text-xs">{r.bin}</td>
                    <td className="p-3">{r.creatorName || '—'}</td>
                    <td className="p-3 text-xs">{formatLeadDate(r.transferredAt)}</td>
                    <td className="p-3">
                      <select
                        className="w-full max-w-[200px] bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold"
                        value={pickManager[r.id] || ''}
                        onChange={(e) => setPickManager((p) => ({ ...p, [r.id]: e.target.value }))}
                      >
                        {managers.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.fullName}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={assigningId === r.id}
                          onClick={() => void assign(r.id)}
                          className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-blue-600 text-white text-[10px] font-black uppercase disabled:opacity-40"
                        >
                          <UserCheck size={14} />
                          {assigningId === r.id ? '…' : tab === 'assigned' ? 'Переназначить' : 'Назначить'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void openEvents(r.id)}
                          className="px-3 py-2 rounded-xl border border-gray-200 text-[10px] font-black uppercase text-gray-600"
                        >
                          Журнал
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {eventsFor ? (
        <div className="bg-white border border-gray-200 rounded-3xl p-4 shadow-sm">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-xs font-black uppercase text-gray-500">Журнал событий</h3>
            <button type="button" className="text-xs font-bold text-gray-400" onClick={() => setEventsFor(null)}>
              Закрыть
            </button>
          </div>
          <ul className="space-y-2 text-xs">
            {events.map((e) => (
              <li key={e.id} className="flex gap-3 border-b border-gray-50 pb-2">
                <span className="text-gray-400 font-mono">{formatLeadDate(e.createdAt)}</span>
                <span className="font-bold">{e.actorName || '—'}</span>
                <span className="text-violet-700 font-black uppercase">{e.action}</span>
              </li>
            ))}
            {events.length === 0 ? <li className="text-gray-400">Пусто</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
