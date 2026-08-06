import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabase } from '../lib/supabase';
import {
  formatLeadDate,
  leadDisplayStatus,
  listEnterpriseLeadsApi,
  type EnterpriseLead,
} from '../lib/enterpriseLeadsApi';

type Props = {
  mode: 'status' | 'returns';
  dateFrom?: string;
  dateTo?: string;
  creatorId?: string;
};

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
    if (!creatorId) return;
    const sb = getSupabase();
    const channel = sb
      .channel(`enterprise-leads-${creatorId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'crm_enterprise_leads', filter: `creator_id=eq.${creatorId}` },
        () => {
          void load();
        },
      )
      .subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  }, [creatorId, load]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (mode === 'returns') return r.routingStatus === 'returned_to_smb';
      if (r.routingStatus === 'returned_to_smb') return false;
      const day = (r.transferredAt || '').slice(0, 10);
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
      return true;
    });
  }, [rows, mode, dateFrom, dateTo]);

  const transferredTodayCount = useMemo(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const key = `${y}-${m}-${d}`;
    return rows.filter((r) => (r.transferredAt || '').slice(0, 10) === key).length;
  }, [rows]);

  return (
    <div className="space-y-3 text-left">
      {mode === 'status' ? (
        <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4">
          <p className="text-[10px] font-black text-violet-600 uppercase">Передано на распределение (сегодня)</p>
          <p className="text-2xl font-black text-violet-800">{transferredTodayCount}</p>
        </div>
      ) : null}

      <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-gray-100">
          <h3 className="text-xs font-black uppercase text-gray-500 tracking-widest">
            {mode === 'returns' ? 'Возвраты на СМБ' : 'Статус переданных лидов'}
          </h3>
        </div>
        {err ? <p className="p-4 text-sm text-red-600 font-bold">{err}</p> : null}
        {loading && filtered.length === 0 ? (
          <p className="p-4 text-sm text-gray-400">Загрузка…</p>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-sm text-gray-400">Нет записей</p>
        ) : (
          <ul className="divide-y">
            {filtered.map((r) => {
              const st = leadDisplayStatus(r);
              return (
                <li key={r.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-gray-900">{r.clientName}</p>
                    <p className="text-[10px] font-mono text-gray-400">{r.bin}</p>
                    <p className="text-[10px] text-gray-400 mt-1">
                      Передано: {formatLeadDate(r.transferredAt)}
                      {r.assignedManagerName ? ` · менеджер: ${r.assignedManagerName}` : ''}
                    </p>
                  </div>
                  <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase ${st.color}`}>{st.label}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export function countTransferredOnDate(leads: EnterpriseLead[], ymd: string): number {
  return leads.filter((r) => (r.transferredAt || '').slice(0, 10) === ymd).length;
}
