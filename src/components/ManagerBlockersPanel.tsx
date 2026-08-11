import { useCallback, useEffect, useState } from 'react';
import { CheckCircle, Plus } from 'lucide-react';
import type { UiClient } from '../lib/crmApi';
import {
  createManagerBlockerApi,
  listManagerBlockersApi,
  resolveManagerBlockerApi,
  type ManagerBlocker,
} from '../lib/managerBlockersApi';

type Props = {
  clients: UiClient[];
  onOpenAddClient: (input: string, cb: (c: UiClient) => void) => void;
  onResolved?: () => void;
};

export function ManagerBlockersPanel({ clients, onOpenAddClient, onResolved }: Props) {
  const [rows, setRows] = useState<ManagerBlocker[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [entityName, setEntityName] = useState('');
  const [bin, setBin] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

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

  const pickClient = (name: string, clientBin: string) => {
    setEntityName(name);
    setBin(clientBin.replace(/\D/g, ''));
  };

  const submit = async () => {
    if (!description.trim()) {
      setErr('Опишите проблему');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await createManagerBlockerApi(bin, entityName, description.trim());
      setFormOpen(false);
      setEntityName('');
      setBin('');
      setDescription('');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const resolve = async (id: string) => {
    setResolvingId(id);
    setErr(null);
    try {
      await resolveManagerBlockerApi(id);
      await load();
      await onResolved?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось снять блокер');
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <section className="bg-white border border-amber-100 rounded-2xl p-4 sm:p-6 shadow-sm text-left space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-800">Ситуации и блокеры</h3>
          <p className="text-[10px] text-amber-700/70 mt-1">Снятые блокеры попадают в KPI за сегодня</p>
        </div>
        <button
          type="button"
          onClick={() => setFormOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-700"
        >
          <Plus size={14} /> Зафиксировать проблему
        </button>
      </div>

      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      {formOpen ? (
        <div className="border border-amber-100 rounded-xl p-3 space-y-2 bg-amber-50/30">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <input
              list="blocker-clients"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold"
              placeholder="Компания"
              value={entityName}
              onChange={(e) => {
                const val = e.target.value;
                const found = clients.find(
                  (c) =>
                    c.name.trim().toLowerCase() === val.trim().toLowerCase() ||
                    c.bin.replace(/\D/g, '') === val.replace(/\D/g, ''),
                );
                pickClient(found ? found.name : val, found ? found.bin : bin);
              }}
            />
            <div className="flex gap-2">
              <input
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono"
                placeholder="БИН"
                value={bin}
                onChange={(e) => setBin(e.target.value.replace(/\D/g, ''))}
              />
              <button
                type="button"
                onClick={() => onOpenAddClient(entityName, (c) => pickClient(c.name, c.bin))}
                className="px-3 py-2 rounded-lg border border-gray-200 text-blue-600 text-xs font-bold"
              >
                +
              </button>
            </div>
          </div>
          <textarea
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm min-h-[80px]"
            placeholder="Почему сделка стоит?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <button
            type="button"
            disabled={saving}
            onClick={() => void submit()}
            className="px-4 py-2 rounded-xl bg-amber-700 text-white text-xs font-bold disabled:opacity-60"
          >
            {saving ? 'Сохранение…' : 'Сохранить проблему'}
          </button>
        </div>
      ) : null}

      {loading ? <p className="text-sm text-gray-400">Загрузка…</p> : null}

      {!loading && rows.length === 0 ? (
        <p className="text-sm text-gray-500">Активных проблем нет</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((b) => (
            <li key={b.id} className="border border-amber-100 rounded-xl p-3 bg-white">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-gray-900">{b.entityName || '—'}</p>
                  {b.bin ? <p className="text-[10px] font-mono text-gray-400">{b.bin}</p> : null}
                  <p className="text-sm text-gray-800 mt-2 whitespace-pre-wrap">{b.description}</p>
                </div>
                <button
                  type="button"
                  disabled={resolvingId === b.id}
                  onClick={() => void resolve(b.id)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 text-[10px] font-bold uppercase hover:bg-emerald-50 disabled:opacity-60"
                >
                  <CheckCircle size={12} /> Снять
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <datalist id="blocker-clients">
        {clients.map((c) => (
          <option key={c.bin} value={c.name} />
        ))}
      </datalist>
    </section>
  );
}
