import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Trash2, X } from 'lucide-react';
import type { UiManagerProfile } from '../lib/crmApi';
import {
  adminAssignEnterpriseLeadApi,
  adminClearReturnedLeadsApi,
  adminDeleteReturnedLeadApi,
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

type BufferTab = 'pending' | 'assigned' | 'returned';

function avatarLetter(name: string): string {
  const t = name.trim();
  return t ? t[0]!.toUpperCase() : '?';
}

function avatarTone(name: string): string {
  const code = (name.codePointAt(0) || 0) % 3;
  if (code === 0) return 'bg-blue-100 text-blue-600';
  if (code === 1) return 'bg-purple-100 text-purple-600';
  return 'bg-emerald-100 text-emerald-700';
}

export function EnterpriseLeadsBuffer({ managers, onAssigned }: Props) {
  const [tab, setTab] = useState<BufferTab>('pending');
  const [rows, setRows] = useState<EnterpriseLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
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

  const deleteReturned = async (leadId: string) => {
    if (!confirm('Удалить этот возврат из истории?')) return;
    setDeletingId(leadId);
    setErr(null);
    try {
      await adminDeleteReturnedLeadApi(leadId);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось удалить');
    } finally {
      setDeletingId(null);
    }
  };

  const clearAllReturned = async () => {
    if (!confirm('Удалить ВСЕ возвраты на СМБ? Это необратимо.')) return;
    setClearing(true);
    setErr(null);
    try {
      const n = await adminClearReturnedLeadsApi();
      await load();
      if (n === 0) setErr('Возвратов не было');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось очистить');
    } finally {
      setClearing(false);
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

  const pendingCount = tab === 'pending' ? rows.length : null;

  return (
    <div className="space-y-4 text-left animate-in fade-in">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="mb-6 flex flex-wrap justify-between items-end gap-3 border-b border-gray-100 pb-4">
          <div>
            <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-1">
              Буферная зона: Входящие лиды
            </h2>
            <p className="text-xs text-gray-500">
              Лиды сегмента «Крупный бизнес», переданные лидорубами для распределения.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full border border-gray-100 bg-gray-50/50 p-1">
              <button
                type="button"
                onClick={() => setTab('pending')}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition ${
                  tab === 'pending' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                В очереди
              </button>
              <button
                type="button"
                onClick={() => setTab('assigned')}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition ${
                  tab === 'assigned' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                Назначенные
              </button>
              <button
                type="button"
                onClick={() => setTab('returned')}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition ${
                  tab === 'returned' ? 'bg-orange-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                Возвраты
              </button>
            </div>
            {pendingCount !== null ? (
              <div className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg text-sm font-bold">
                В очереди: {pendingCount}
              </div>
            ) : null}
            {tab === 'returned' ? (
              <button
                type="button"
                disabled={clearing || rows.length === 0}
                onClick={() => void clearAllReturned()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase border border-red-100 text-red-600 hover:bg-red-50 disabled:opacity-40"
              >
                <Trash2 size={14} />
                {clearing ? '…' : 'Обнулить все'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void load()}
              className="p-2 text-gray-400 hover:text-blue-600 rounded-lg border border-gray-100"
              title="Обновить"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {err ? <p className="text-sm font-bold text-red-600 mb-4">{err}</p> : null}

        {loading && rows.length === 0 ? (
          <p className="text-sm text-gray-400 py-4">Загрузка…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-400 py-4">{tab === 'returned' ? 'Нет возвратов' : 'Буфер пуст'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[720px]">
              <thead className="text-[10px] uppercase text-gray-400 font-bold bg-gray-50">
                <tr>
                  <th className="px-4 py-3 rounded-l-lg">Компания</th>
                  <th className="px-4 py-3">Инициатор (Лидоруб)</th>
                  <th className="px-4 py-3">{tab === 'returned' ? 'Дата возврата' : 'Дата создания'}</th>
                  <th className="px-4 py-3 rounded-r-lg text-right">Действие</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((r) => {
                  const name = r.creatorName || '—';
                  return (
                    <tr key={r.id} className="hover:bg-gray-50/50 transition">
                      <td className="px-4 py-4">
                        <div className="font-bold text-gray-900">{r.clientName}</div>
                        <div className="text-[10px] font-mono text-gray-400 mt-0.5">{r.bin}</div>
                      </td>
                      <td className="px-4 py-4 text-gray-600">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${avatarTone(name)}`}
                          >
                            {avatarLetter(name)}
                          </div>
                          {name}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-gray-500">
                        {formatLeadDate(tab === 'returned' ? r.returnedAt : r.transferredAt)}
                      </td>
                      <td className="px-4 py-4 text-right">
                        {tab === 'returned' ? (
                          <div className="inline-flex flex-wrap items-center justify-end gap-2">
                            <button
                              type="button"
                              disabled={deletingId === r.id}
                              onClick={() => void deleteReturned(r.id)}
                              className="inline-flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-700 px-3 py-2 rounded-lg text-xs font-bold transition disabled:opacity-40 border border-red-100"
                            >
                              <Trash2 size={14} />
                              {deletingId === r.id ? '…' : 'Удалить'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void openEvents(r.id)}
                              className="text-xs font-bold text-gray-500 hover:text-gray-800 px-2 py-2"
                            >
                              Журнал
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex flex-wrap items-center justify-end gap-2">
                            <select
                              className="bg-white border border-gray-200 text-gray-700 text-xs font-bold rounded-lg px-3 py-2 outline-none focus:border-blue-500 cursor-pointer shadow-sm"
                              value={pickManager[r.id] || ''}
                              onChange={(e) => setPickManager((p) => ({ ...p, [r.id]: e.target.value }))}
                            >
                              <option value="" disabled>
                                Назначить…
                              </option>
                              {managers.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.fullName}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              disabled={assigningId === r.id || !pickManager[r.id]}
                              onClick={() => void assign(r.id)}
                              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-xs font-bold transition disabled:opacity-40"
                            >
                              {assigningId === r.id ? '…' : 'OK'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void openEvents(r.id)}
                              className="text-xs font-bold text-gray-500 hover:text-gray-800 px-2 py-2"
                            >
                              Журнал
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {eventsFor ? (
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-3 border-b border-gray-100 pb-3">
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Журнал событий</h3>
            <button
              type="button"
              className="text-gray-400 hover:text-gray-600"
              onClick={() => setEventsFor(null)}
            >
              <X size={18} />
            </button>
          </div>
          <ul className="space-y-2 text-xs">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap gap-3 border-b border-gray-50 pb-2">
                <span className="text-gray-400 font-mono">{formatLeadDate(e.createdAt)}</span>
                <span className="font-bold text-gray-800">{e.actorName || '—'}</span>
                <span className="text-blue-700 font-bold uppercase">{e.action}</span>
              </li>
            ))}
            {events.length === 0 ? <li className="text-gray-400">Пусто</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
