import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, Save, Trash2, UserPlus, X } from 'lucide-react';
import type { UiClient, UiOrder } from '../lib/crmApi';
import { adminDeleteConfirmedOrder, adminUpdateConfirmedOrder } from '../lib/crmApi';
import { formatMoneyKzt, validateOrderLinesAmount } from '../lib/commission';
import type { OrderRow } from '../lib/ordersGrouping';

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
}

function normalizeBin(s: string): string {
  return s.replace(/\D/g, '');
}

function ContractorField({
  label,
  value,
  clients,
  onSelect,
  onOpenAddClient,
  datalistId,
}: {
  label: string;
  value: string;
  clients: UiClient[];
  onSelect: (name: string, bin: string) => void;
  onOpenAddClient: (input: string, cb: (c: UiClient) => void) => void;
  datalistId: string;
}) {
  const valueName = normalizeName(value);
  const valueBin = normalizeBin(value);
  const currentClient = clients.find(
    (c) => normalizeName(c.name) === valueName || normalizeBin(c.bin) === valueBin,
  );
  const isNotFound = value.trim() !== '' && !currentClient;

  return (
    <div className="space-y-1.5 text-left">
      <label className="text-[9px] font-black text-gray-400 uppercase ml-2">{label}</label>
      <div className="flex gap-2 items-center">
        <div className="relative flex-grow">
          <input
            list={datalistId}
            type="text"
            className={`w-full bg-gray-50 border border-gray-200 p-3 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/30 ${
              currentClient ? 'text-emerald-700 border-emerald-100 bg-emerald-50/20' : ''
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
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500 flex flex-col items-end leading-none">
              <CheckCircle size={16} />
              <span className="text-[7px] font-mono font-black tracking-tighter mt-0.5">{currentClient.bin}</span>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => onOpenAddClient(value, (newClient) => onSelect(newClient.name, newClient.bin))}
          className={`p-3 border rounded-2xl transition-all shadow-sm ${
            isNotFound ? 'bg-amber-600 border-amber-600 text-white' : 'bg-white border-gray-100 text-blue-600 hover:bg-blue-50'
          }`}
          title="Создать карточку клиента"
        >
          <UserPlus size={20} />
        </button>
      </div>
      {isNotFound ? (
        <div className="flex items-center gap-1 text-[10px] text-amber-600 font-black uppercase tracking-tighter ml-2">
          <AlertTriangle size={12} />
          <span>Не найдено в базе</span>
        </div>
      ) : null}
      <datalist id={datalistId}>
        {clients.map((c) => (
          <option key={c.bin} value={c.name}>
            {c.bin}
          </option>
        ))}
      </datalist>
    </div>
  );
}

type Props = {
  order: OrderRow;
  clients: UiClient[];
  mrpKzt: number;
  onOpenAddClient: (input: string, cb: (c: UiClient) => void) => void;
  onSaved: () => void | Promise<void>;
  onClose: () => void;
};

export function AdminOrderEditModal({ order, clients, mrpKzt, onOpenAddClient, onSaved, onClose }: Props) {
  const [draft, setDraft] = useState<UiOrder>(() => ({
    ...order,
    amounts: [...order.amounts],
  }));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const amountErr = useMemo(() => {
    if (draft.totalAmount <= 0 && !draft.amounts.some((a) => a > 0)) return null;
    const v = validateOrderLinesAmount(draft.amounts, draft.totalAmount, mrpKzt);
    return v.ok ? null : v.message;
  }, [draft.amounts, draft.totalAmount, mrpKzt]);

  const canSave = Boolean(draft.entityName.trim() && draft.bin.trim() && order.id && !amountErr);

  const updateCount = (raw: string) => {
    const count = Math.max(1, parseInt(raw, 10) || 1);
    const amounts = [...draft.amounts];
    while (amounts.length < count) amounts.push(0);
    amounts.length = count;
    setDraft({
      ...draft,
      orderCount: count,
      amounts,
      totalAmount: amounts.reduce((a, b) => a + b, 0),
    });
  };

  const updateAmount = (idx: number, raw: string) => {
    const amounts = [...draft.amounts];
    amounts[idx] = parseFloat(raw.replace(/[^0-9.]/g, '')) || 0;
    setDraft({ ...draft, amounts, totalAmount: amounts.reduce((a, b) => a + b, 0) });
  };

  const save = async () => {
    if (!order.id) {
      setErr('У записи нет id — обновите страницу');
      return;
    }
    if (amountErr) {
      setErr(amountErr);
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await adminUpdateConfirmedOrder(order.id, {
        entityName: draft.entityName.trim(),
        bin: draft.bin.trim(),
        viaEntityName: draft.viaEntityName.trim(),
        viaBin: draft.viaBin.trim(),
        orderCount: draft.orderCount,
        amounts: draft.amounts,
        totalAmount: draft.totalAmount,
      });
      await onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!order.id) return;
    if (!window.confirm('Удалить эту запись подтверждённого заказа?')) return;
    setDeleting(true);
    setErr(null);
    try {
      await adminDeleteConfirmedOrder(order.id);
      await onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось удалить');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[450] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-[32px] shadow-2xl w-full max-w-2xl max-h-[min(92vh,900px)] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-100 flex justify-between items-start gap-4">
          <div className="text-left">
            <h3 className="font-black text-gray-900 text-lg uppercase">Редактирование заказа</h3>
            <p className="text-[10px] text-gray-500 font-bold uppercase mt-1">
              {order.manager} · {order.date}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-400">
            <X size={22} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 flex-1 min-h-0 text-left">
          <ContractorField
            label="Контрагент"
            value={draft.entityName || draft.bin}
            clients={clients}
            datalistId="admin-order-edit-counterparty"
            onSelect={(name, bin) => setDraft({ ...draft, entityName: name, bin })}
            onOpenAddClient={onOpenAddClient}
          />

          <ContractorField
            label="Юр. лицо через которое был заказ"
            value={draft.viaEntityName || draft.viaBin}
            clients={clients}
            datalistId="admin-order-edit-via"
            onSelect={(name, bin) => setDraft({ ...draft, viaEntityName: name, viaBin: bin })}
            onOpenAddClient={onOpenAddClient}
          />

          <div className="space-y-1.5">
            <label className="text-[9px] font-black text-gray-400 uppercase ml-2">К-во заказов</label>
            <input
              type="number"
              min={1}
              className="w-full max-w-[140px] bg-gray-50 border border-gray-200 p-3 rounded-2xl text-sm font-black"
              value={draft.orderCount}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => updateCount(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {draft.amounts.map((sum, idx) => (
              <div key={idx} className="space-y-1">
                <label className="text-[8px] font-bold text-gray-500 uppercase ml-1">Сумма #{idx + 1}</label>
                <input
                  type="text"
                  className="w-full bg-gray-50 border border-gray-200 p-2 rounded-xl text-xs font-black text-right"
                  value={sum || ''}
                  placeholder="0"
                  onChange={(e) => updateAmount(idx, e.target.value)}
                />
              </div>
            ))}
          </div>

          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
            <p className="text-[10px] font-black text-emerald-700 uppercase">Итого сумма</p>
            <p className="text-xl font-black text-emerald-700">{formatMoneyKzt(draft.totalAmount)} ₸</p>
          </div>

          {amountErr ? (
            <p className="text-[11px] font-bold text-red-600 flex items-center gap-1">
              <AlertTriangle size={14} />
              {amountErr}
            </p>
          ) : null}
          {err ? <p className="text-[11px] font-bold text-red-600">{err}</p> : null}
        </div>

        <div className="p-6 border-t border-gray-100 bg-gray-50 flex flex-wrap justify-between gap-3">
          <button
            type="button"
            onClick={remove}
            disabled={deleting || saving}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-40"
          >
            <Trash2 size={14} />
            {deleting ? 'Удаление…' : 'Удалить'}
          </button>
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-xs font-black uppercase text-gray-600 border border-gray-200 hover:bg-white"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!canSave || saving || deleting}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
            >
              <Save size={14} />
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
