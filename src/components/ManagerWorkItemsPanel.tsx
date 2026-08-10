import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, Plus, Trash2, UserPlus } from 'lucide-react';
import type { UiClient } from '../lib/crmApi';
import {
  WORK_ITEM_STATUS_OPTIONS,
  listCrmWorkItemsForDate,
  saveCrmWorkItemsApi,
  workItemStatusLabel,
  type ManagerWorkItem,
  type WorkItemStatus,
} from '../lib/managerWorkItemsApi';

type DraftRow = {
  key: string;
  bin: string;
  entityName: string;
  status: WorkItemStatus;
  nextStep: string;
  deadline: string;
  blockers: string;
};

type Props = {
  reportDate: string;
  clients: UiClient[];
  onOpenAddClient: (input: string, cb: (c: UiClient) => void) => void;
  processedTotal: number;
  onProcessedTotalChange: (n: number) => void;
};

function emptyRow(): DraftRow {
  return {
    key: crypto.randomUUID(),
    bin: '',
    entityName: '',
    status: 'in_work',
    nextStep: '',
    deadline: '',
    blockers: '',
  };
}

function fromApi(it: ManagerWorkItem): DraftRow {
  return {
    key: it.id || crypto.randomUUID(),
    bin: it.bin,
    entityName: it.entityName,
    status: it.status,
    nextStep: it.nextStep,
    deadline: it.deadline,
    blockers: it.blockers,
  };
}

function distinctBinCount(rows: DraftRow[]): number {
  const set = new Set<string>();
  for (const r of rows) {
    const bin = r.bin.replace(/\D/g, '');
    if (bin) set.add(bin);
  }
  return set.size;
}

function ContractorLookupMini({
  value,
  bin,
  onSelect,
  clients,
  onOpenAddClient,
}: {
  value: string;
  bin: string;
  onSelect: (name: string, bin: string) => void;
  clients: UiClient[];
  onOpenAddClient: (input: string, cb: (c: UiClient) => void) => void;
}) {
  const normalizeName = (s: string) => s.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
  const normalizeBin = (s: string) => s.replace(/\D/g, '');
  const currentClient = clients.find(
    (c) => normalizeName(c.name) === normalizeName(value) || (bin && normalizeBin(c.bin) === normalizeBin(bin)),
  );
  const isNotFound = value.trim() !== '' && !currentClient;
  return (
    <div className="flex flex-col gap-1 text-left">
      <div className="flex gap-2 items-center">
        <div className="relative flex-grow">
          <input
            list="clients-list"
            type="text"
            className={`w-full bg-gray-50/50 p-3 rounded-2xl text-sm font-bold outline-none ${
              currentClient
                ? 'ring-1 ring-emerald-500 text-emerald-700 bg-emerald-50/20'
                : isNotFound
                  ? 'ring-1 ring-amber-500'
                  : ''
            }`}
            value={currentClient ? currentClient.name : value}
            onChange={(e) => {
              const val = e.target.value;
              const found = clients.find(
                (c) => normalizeName(c.name) === normalizeName(val) || normalizeBin(c.bin) === normalizeBin(val),
              );
              onSelect(found ? found.name : val, found ? found.bin : '');
            }}
            placeholder="Наименование или БИН..."
          />
          {currentClient ? (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500 text-right leading-none">
              <CheckCircle size={14} className="ml-auto" />
              <span className="text-[7px] font-mono font-black tracking-tighter">{currentClient.bin}</span>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => onOpenAddClient(value, (c) => onSelect(c.name, c.bin))}
          className={`p-3 border rounded-2xl shadow-sm ${
            isNotFound ? 'bg-amber-600 border-amber-600 text-white' : 'bg-white border-gray-100 text-blue-600'
          }`}
          title="Создать карточку клиента"
        >
          <UserPlus size={18} />
        </button>
      </div>
      {isNotFound ? (
        <div className="flex items-center gap-1 text-[10px] text-amber-600 font-bold uppercase ml-2">
          <AlertTriangle size={12} /> Не найдено — создайте карточку
        </div>
      ) : null}
    </div>
  );
}

export function ManagerWorkItemsPanel({
  reportDate,
  clients,
  onOpenAddClient,
  processedTotal,
  onProcessedTotalChange,
}: Props) {
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await listCrmWorkItemsForDate(reportDate);
      setRows(data.length ? data.map(fromApi) : []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [reportDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const uniqueBins = useMemo(() => distinctBinCount(rows), [rows]);

  useEffect(() => {
    if (!loading && uniqueBins !== processedTotal) {
      onProcessedTotalChange(uniqueBins);
    }
  }, [loading, uniqueBins, processedTotal, onProcessedTotalChange]);

  const persist = async (next: DraftRow[]) => {
    const valid = next.filter((r) => r.entityName.trim() || r.bin.replace(/\D/g, ''));
    setSaving(true);
    setErr(null);
    try {
      await saveCrmWorkItemsApi(
        reportDate,
        valid.map((r, i) => ({
          bin: r.bin,
          entityName: r.entityName,
          status: r.status,
          nextStep: r.nextStep,
          deadline: r.deadline,
          blockers: r.blockers,
          sortOrder: i,
        })),
      );
      onProcessedTotalChange(distinctBinCount(valid));
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const blockers = rows.filter((r) => r.blockers.trim());

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100 text-left space-y-4">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-4">
          <div>
            <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Поставщики в работе</h2>
            <p className="text-[10px] text-gray-400 mt-1">
              Уникальных БИН: {uniqueBins}
              {saving ? ' · сохранение…' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRows((prev) => [...prev, emptyRow()])}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold uppercase text-gray-600 hover:bg-gray-50"
          >
            <Plus size={14} /> Добавить
          </button>
        </div>

        {err ? <p className="text-sm font-bold text-red-600">{err}</p> : null}
        {loading ? <p className="text-sm text-gray-400">Загрузка…</p> : null}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="text-[9px] font-bold text-gray-400 uppercase border-b border-gray-50 tracking-widest">
                <th className="pb-3">Контрагент / БИН</th>
                <th className="pb-3 w-36 px-2 text-center">Статус</th>
                <th className="pb-3 min-w-[180px]">Следующий шаг</th>
                <th className="pb-3 w-36">Дедлайн</th>
                <th className="pb-3 min-w-[180px]">Ситуация / блокер</th>
                <th className="pb-3 w-28 text-center">Сохранить</th>
                <th className="pb-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={row.key} className="border-b border-gray-50 align-top">
                  <td className="py-3 pr-2 min-w-[260px]">
                    <ContractorLookupMini
                      value={row.entityName}
                      bin={row.bin}
                      clients={clients}
                      onOpenAddClient={onOpenAddClient}
                      onSelect={(name, bin) => {
                        setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, entityName: name, bin } : r)));
                      }}
                    />
                  </td>
                  <td className="py-3 px-2">
                    <select
                      className="w-full bg-gray-50/50 p-3 rounded-2xl text-sm font-bold text-center outline-none"
                      value={row.status}
                      onChange={(e) => {
                        const status = e.target.value as WorkItemStatus;
                        setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, status } : r)));
                      }}
                    >
                      {WORK_ITEM_STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 px-2">
                    <input
                      type="text"
                      className="w-full bg-gray-50/50 p-3 rounded-2xl text-sm outline-none"
                      value={row.nextStep}
                      onChange={(e) => {
                        const nextStep = e.target.value;
                        setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, nextStep } : r)));
                      }}
                      placeholder="Следующий шаг"
                    />
                  </td>
                  <td className="py-3 px-2">
                    <input
                      type="date"
                      className="w-full bg-gray-50/50 p-3 rounded-2xl text-sm outline-none"
                      value={row.deadline}
                      onChange={(e) => {
                        const deadline = e.target.value;
                        setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, deadline } : r)));
                      }}
                    />
                  </td>
                  <td className="py-3 px-2">
                    <textarea
                      className="w-full bg-gray-50/50 p-3 rounded-2xl text-sm outline-none min-h-[46px] resize-y"
                      rows={2}
                      value={row.blockers}
                      onChange={(e) => {
                        const blockersText = e.target.value;
                        setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, blockers: blockersText } : r)));
                      }}
                      placeholder="Ситуация / блокер"
                    />
                  </td>
                  <td className="py-3 text-center">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void persist(rows)}
                      className="px-3 py-2 rounded-xl bg-blue-600 text-white text-[10px] font-bold uppercase disabled:opacity-60"
                    >
                      Сохранить
                    </button>
                  </td>
                  <td className="py-3">
                    <button
                      type="button"
                      onClick={() => {
                        const next = rows.filter((_, i) => i !== idx);
                        setRows(next);
                        void persist(next);
                      }}
                      className="p-2 text-gray-400 hover:text-red-600"
                      title="Удалить"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && !loading ? (
          <p className="text-sm text-gray-400">Нет поставщиков. Добавь строку.</p>
        ) : null}
      </div>

      <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-amber-100 text-left space-y-3">
        <h3 className="text-sm font-bold text-amber-900 uppercase tracking-wide">Проблемные точки</h3>
        {blockers.length === 0 ? (
          <p className="text-sm text-gray-400">Нет заполненных блокеров за дату</p>
        ) : (
          <div className="space-y-2">
            {blockers.map((r) => (
              <div key={r.key} className="border border-amber-100 rounded-xl p-3 bg-amber-50/50">
                <div className="flex justify-between gap-2 mb-1">
                  <div className="font-bold text-sm text-gray-800">
                    {r.entityName || '—'}{' '}
                    <span className="font-mono text-[10px] text-gray-400">{r.bin || ''}</span>
                  </div>
                  <span className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-amber-100 text-amber-800">
                    {workItemStatusLabel(r.status)}
                  </span>
                </div>
                <p className="text-sm text-amber-900 whitespace-pre-wrap">{r.blockers}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
