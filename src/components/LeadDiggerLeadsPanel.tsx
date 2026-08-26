import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRightCircle, Building2, Info, User, PackageCheck } from 'lucide-react';
import { getSupabase } from '../lib/supabase';
import { formatMoneyKzt } from '../lib/commission';
import {
  formatLeadDate,
  leadDisplayStatus,
  leadTransferredDay,
  listEnterpriseLeadsApi,
  type EnterpriseLead,
} from '../lib/enterpriseLeadsApi';

type Props = {
  mode: 'status' | 'returns' | 'history';
  dateFrom?: string;
  dateTo?: string;
  creatorId?: string;
};

function statusBadgeClass(key: ReturnType<typeof leadDisplayStatus>['key']): string {
  switch (key) {
    case 'pending':
      return 'bg-gray-200 text-gray-600';
    case 'waiting':
      return 'bg-yellow-100 text-yellow-700';
    case 'done':
      return 'bg-emerald-100 text-emerald-700';
    case 'cancelled':
      return 'bg-red-100 text-red-700';
    case 'returned':
      return 'bg-orange-100 text-orange-700';
    case 'in_work':
      return 'bg-indigo-100 text-indigo-700';
    default:
      return 'bg-gray-100 text-gray-600';
  }
}

export function LeadDiggerLeadsPanel({ mode, dateFrom, dateTo, creatorId }: Props) {
  const [rows, setRows] = useState<EnterpriseLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await listEnterpriseLeadsApi(mode === 'returns' ? 'returned' : 'all');
      setRows(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onFocus = () => {
      void load();
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') void load();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load]);

  useEffect(() => {
    const sb = getSupabase();
    const topic = `enterprise-leads:${creatorId || 'all'}:${mode}:${crypto.randomUUID()}`;
    const channel = sb.channel(topic);
    const filter = creatorId ? { filter: `creator_id=eq.${creatorId}` as const } : {};
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'crm_enterprise_leads',
        ...filter,
      },
      () => {
        void load();
      },
    );
    channel.subscribe();

    // Fallback poll when creatorId missing or realtime lags
    const pollMs = creatorId ? 0 : 15_000;
    const timer = pollMs
      ? window.setInterval(() => {
          void load();
        }, pollMs)
      : 0;

    return () => {
      void sb.removeChannel(channel);
      if (timer) window.clearInterval(timer);
    };
  }, [creatorId, mode, load]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (mode === 'returns') return r.routingStatus === 'returned_to_smb';
      if (mode === 'history') return true;
      if (r.routingStatus === 'returned_to_smb') return false;
      const day = leadTransferredDay(r);
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
      return true;
    });
  }, [rows, mode, dateFrom, dateTo]);

  if (mode === 'history') {
    return (
      <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100 text-left space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
          <div>
            <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Все переданные лиды</h2>
            <p className="text-[10px] text-gray-400 mt-1">Без фильтра даты · {filtered.length} шт.</p>
          </div>
          <Info size={16} className="text-gray-400" aria-label="Полная история переданных в круп" />
        </div>

        {err ? <p className="text-sm font-bold text-red-600">{err}</p> : null}
        {loading && filtered.length === 0 ? (
          <p className="text-sm text-gray-400">Загрузка…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-400">Нет переданных лидов</p>
        ) : (
          <div className="space-y-3">
            {filtered.map((r) => {
              const st = leadDisplayStatus(r);
              return (
                <div key={r.id} className="border border-gray-100 rounded-xl p-3 bg-white">
                  <div className="flex justify-between items-start mb-2 gap-2">
                    <div>
                      <div className="font-bold text-sm text-gray-800">{r.clientName}</div>
                      <div className="text-[10px] font-mono text-gray-400">{r.bin}</div>
                    </div>
                    <span className={`shrink-0 text-[10px] uppercase font-bold px-2 py-1 rounded ${statusBadgeClass(st.key)}`}>
                      {st.label}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                    <span>Передано: {formatLeadDate(r.transferredOn || r.transferredAt)}</span>
                    {r.assignedManagerName ? (
                      <span className="inline-flex items-center gap-1">
                        <User size={12} className="text-gray-400" />
                        {r.assignedManagerName}
                      </span>
                    ) : (
                      <span>На распределении</span>
                    )}
                  </div>
                  {r.confirmedOrderCount > 0 ? (
                    <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-lg">
                      <PackageCheck size={12} />
                      Заказ подтверждён: {formatMoneyKzt(r.confirmedOrderAmount)} ₸ · {r.confirmedOrderCount} шт.
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (mode === 'status') {
    return (
      <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100 text-left space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
          <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Статус переданных</h2>
          <Info size={16} className="text-gray-400" aria-label="Крупный бизнес, переданный в другой отдел" />
        </div>

        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 border-dashed">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 flex items-center gap-1">
            Передано в круп
            <ArrowRightCircle size={14} className="text-gray-400" />
          </div>
          <div className="text-2xl font-black text-gray-700">{filtered.length}</div>
          <p className="text-[10px] text-gray-400 mt-0.5">За период фильтра</p>
        </div>

        {err ? <p className="text-sm font-bold text-red-600">{err}</p> : null}
        {loading && filtered.length === 0 ? (
          <p className="text-sm text-gray-400">Загрузка…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-400">Нет переданных лидов</p>
        ) : (
          <div className="space-y-3">
            {filtered.map((r) => {
              const st = leadDisplayStatus(r);
              const isPending = st.key === 'pending';
              return (
                <div
                  key={r.id}
                  className={`border border-gray-100 rounded-xl p-3 ${isPending ? 'bg-gray-50' : 'bg-white'}`}
                >
                  <div className="flex justify-between items-start mb-2 gap-2">
                    <div className="font-bold text-sm text-gray-800">{r.clientName}</div>
                    <span
                      className={`shrink-0 text-[10px] uppercase font-bold px-2 py-1 rounded ${statusBadgeClass(st.key)}`}
                    >
                      {st.label}
                    </span>
                  </div>
                  {isPending ? (
                    <div className="text-xs text-gray-500">Ждёт назначения руководителя</div>
                  ) : r.assignedManagerName ? (
                    <div className="text-xs text-gray-500 flex items-center gap-1">
                      <User size={12} className="text-gray-400" />
                      Менеджер: {r.assignedManagerName}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500">Передано: {formatLeadDate(r.transferredOn || r.transferredAt)}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100 text-left space-y-4">
      <div className="flex items-center justify-between border-b border-gray-100 pb-4">
        <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Возвраты на СМБ</h2>
        <span className="bg-orange-100 text-orange-700 text-[10px] uppercase font-bold px-2 py-1 rounded">
          Обратно в воронку
        </span>
      </div>

      {err ? <p className="text-sm font-bold text-red-600">{err}</p> : null}
      {loading && filtered.length === 0 ? (
        <p className="text-sm text-gray-400">Загрузка…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400">Нет возвратов</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <div key={r.id} className="border border-orange-100 rounded-xl p-3 bg-orange-50/50">
              <div className="flex justify-between items-start mb-2 gap-2">
                <div className="flex items-center gap-3">
                  <div className="bg-orange-100 text-orange-700 p-2 rounded-lg">
                    <Building2 size={18} />
                  </div>
                  <div>
                    <div className="font-bold text-sm text-gray-800">{r.clientName}</div>
                    <div className="text-[10px] font-mono text-gray-400">{r.bin}</div>
                  </div>
                </div>
                <span className="shrink-0 bg-orange-100 text-orange-700 text-[10px] uppercase font-bold px-2 py-1 rounded">
                  Возврат на СМБ
                </span>
              </div>
              <div className="text-xs text-orange-600 font-medium">
                Менеджер отклонил. Вернулся к вам в воронку.
                {r.assignedManagerName ? ` · ${r.assignedManagerName}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function countTransferredOnDate(leads: EnterpriseLead[], ymd: string): number {
  return leads.filter((r) => leadTransferredDay(r) === ymd).length;
}
