import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import type { UiClient } from '../lib/crmApi';
import {
  listWorkItemsForDateApi,
  saveWorkItemsApi,
  type SaveWorkItemInput,
  type WorkItemStatus,
} from '../lib/managerWorkItemsApi';

type Row = SaveWorkItemInput & { key: string };

const STATUS_OPTIONS: { value: WorkItemStatus; label: string }[] = [
  { value: 'in_work', label: 'В работе' },
  { value: 'waiting', label: 'Ожидание' },
  { value: 'blocked', label: 'Заблокирован' },
  { value: 'done', label: 'Выполнено' },
];

function emptyRow(): Row {
  return {
    key: crypto.randomUUID(),
    bin: '',
    entityName: '',
    status: 'in_work',
    nextStep: '',
    deadline: null,
    blockers: '',
    sortOrder: 0,
  };
}

type Props = {
  reportDate: string;
  clients: UiClient[];
  onOpenAddClient: (input: string, cb: (c: UiClient) => void) => void;
  onSaved?: () => void;
};

export function ManagerWorkItemsPanel({ reportDate, clients, onOpenAddClient, onSaved }: Props) {
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await listWorkItemsForDateApi(reportDate);
      if (data.length === 0) {
        setRows([emptyRow()]);
      } else {
        setRows(
          data.map((it) => ({
            key: it.id,
            bin: it.bin,
            entityName: it.entityName,
            status: it.status,
            nextStep: it.nextStep,
            deadline: it.deadline,
            blockers: it.blockers,
            sortOrder: it.sortOrder,
          })),
        );
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка загрузки');
      setRows([emptyRow()]);
    } finally {
      setLoading(false);
    }
  }, [reportDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateRow = (idx: number, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const pickClient = (idx: number, name: string, bin: string) => {
    updateRow(idx, { entityName: name, bin });
  };

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const items = rows
        .filter((r) => r.entityName.trim() || r.bin.trim())
        .map((r, i) => ({
          bin: r.bin,
          entityName: r.entityName,
          status: r.status,
          nextStep: r.nextStep,
          deadline: r.deadline,
          blockers: r.blockers,
          sortOrder: i,
        }));
      await saveWorkItemsApi(reportDate, items);
      await load();
      await onSaved?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const activeCount = useMemo(() => rows.filter((r) => r.bin.trim() || r.entityName.trim()).length, [rows]);

  return (
    <section className="bg-white border border-gray-100 rounded-2xl p-4 sm:p-6 shadow-sm text-left space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Поставщики в работе</h3>
          <p className="text-[10px] text-gray-400 mt-1">Уникальные поставщики считаются автоматически по БИН</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setRows((prev) => [...prev, emptyRow()])}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50"
          >
            <Plus size={14} /> Добавить
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-60"
          >
            <Save size={14} /> {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </div>

      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      {loading ? <p className="text-sm text-gray-400">Загрузка…</p> : null}

      <div className="space-y-3">
        {rows.map((row, idx) => (
          <div key={row.key} className="border border-gray-100 rounded-xl p-3 space-y-2 bg-gray-50/40">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input
                list="work-items-clients"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold"
                placeholder="Компания или БИН"
                value={row.entityName}
                onChange={(e) => {
                  const val = e.target.value;
                  const found = clients.find(
                    (c) =>
                      c.name.trim().toLowerCase() === val.trim().toLowerCase() ||
                      c.bin.replace(/\D/g, '') === val.replace(/\D/g, ''),
                  );
                  pickClient(idx, found ? found.name : val, found ? found.bin : row.bin);
                }}
              />
              <div className="flex gap-2">
                <input
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono"
                  placeholder="БИН"
                  value={row.bin}
                  onChange={(e) => updateRow(idx, { bin: e.target.value.replace(/\D/g, '') })}
                />
                <button
                  type="button"
                  onClick={() => onOpenAddClient(row.entityName, (c) => pickClient(idx, c.name, c.bin))}
                  className="px-3 py-2 rounded-lg border border-gray-200 text-blue-600 text-xs font-bold"
                >
                  +
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <select
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold"
                value={row.status}
                onChange={(e) => updateRow(idx, { status: e.target.value as WorkItemStatus })}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <input
                type="date"
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm"
                value={row.deadline || ''}
                onChange={(e) => updateRow(idx, { deadline: e.target.value || null })}
              />
              <button
                type="button"
                onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}
                className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-red-100 text-red-600 text-xs font-bold hover:bg-red-50"
              >
                <Trash2 size={14} /> Удалить
              </button>
            </div>
            <input
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
              placeholder="Следующее действие"
              value={row.nextStep}
              onChange={(e) => updateRow(idx, { nextStep: e.target.value })}
            />
          </div>
        ))}
      </div>

      <datalist id="work-items-clients">
        {clients.map((c) => (
          <option key={c.bin} value={c.name} />
        ))}
      </datalist>

      <p className="text-[10px] text-gray-400">Активных карточек: {activeCount}</p>
    </section>
  );
}
