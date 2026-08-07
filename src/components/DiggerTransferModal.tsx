import { useEffect, useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import type { UiClient } from '../lib/crmApi';
import {
  diggerTransferEnterpriseBatchApi,
  type DiggerTransferBatchResultItem,
} from '../lib/enterpriseLeadsApi';

export type DiggerTransferRow = {
  bin: string;
  name: string;
  meetingScheduled: boolean;
};

type Props = {
  open: boolean;
  rowCount: number;
  reportDate: string;
  clients: UiClient[];
  onClose: () => void;
  onSuccess: (result: {
    items: DiggerTransferBatchResultItem[];
    meetingRows: DiggerTransferRow[];
    skippedExisting: number;
  }) => void | Promise<void>;
};

function emptyRows(n: number): DiggerTransferRow[] {
  return Array.from({ length: n }, () => ({ bin: '', name: '', meetingScheduled: false }));
}

function normalizeBin(s: string): string {
  return s.replace(/\D/g, '');
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
}

function extractErrorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (e && typeof e === 'object') {
    const o = e as { message?: string; details?: string; hint?: string; error_description?: string };
    const parts = [o.message, o.details, o.hint, o.error_description].filter(
      (x): x is string => typeof x === 'string' && x.trim().length > 0,
    );
    if (parts.length) return parts.join(' — ');
  }
  return 'Не удалось передать';
}

export function DiggerTransferModal({ open, rowCount, reportDate, clients, onClose, onSuccess }: Props) {
  const [rows, setRows] = useState<DiggerTransferRow[]>(() => emptyRows(rowCount));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRows(emptyRows(Math.max(0, rowCount)));
    setError(null);
    setSubmitting(false);
  }, [open, rowCount]);

  const validationError = useMemo(() => {
    const seen = new Set<string>();
    for (let i = 0; i < rows.length; i++) {
      const bin = normalizeBin(rows[i].bin);
      const name = rows[i].name.trim();
      if (bin.length !== 12) return `Строка ${i + 1}: БИН — ровно 12 цифр`;
      if (!name) return `Строка ${i + 1}: укажите название`;
      if (seen.has(bin)) return `Строка ${i + 1}: дублирующий БИН ${bin}`;
      seen.add(bin);
    }
    return null;
  }, [rows]);

  if (!open) return null;

  const resolveClient = (raw: string): UiClient | undefined => {
    const bin = normalizeBin(raw);
    const name = normalizeName(raw);
    if (bin.length === 12) {
      const byBin = clients.find((c) => normalizeBin(c.bin) === bin);
      if (byBin) return byBin;
    }
    if (name) {
      return clients.find((c) => normalizeName(c.name) === name);
    }
    return undefined;
  };

  const updateRow = (idx: number, patch: Partial<DiggerTransferRow>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const onBinChange = (idx: number, value: string) => {
    const bin = normalizeBin(value).slice(0, 12);
    const found = bin.length === 12 ? clients.find((c) => normalizeBin(c.bin) === bin) : undefined;
    updateRow(idx, found ? { bin, name: found.name } : { bin });
  };

  const onNameChange = (idx: number, value: string) => {
    const found = resolveClient(value);
    if (found) {
      updateRow(idx, { name: found.name, bin: normalizeBin(found.bin) });
      return;
    }
    updateRow(idx, { name: value });
  };

  const submit = async () => {
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload = rows.map((r) => ({
        bin: normalizeBin(r.bin),
        name: r.name.trim(),
        meeting_scheduled: r.meetingScheduled,
      }));
      const result = await diggerTransferEnterpriseBatchApi(reportDate, payload);
      const skippedExisting = result.items.filter((i) => i.skipped_existing).length;
      const meetingBins = new Set(
        result.items.filter((i) => i.created && i.meeting_scheduled).map((i) => i.bin),
      );
      const meetingRows = rows
        .filter((r) => r.meetingScheduled && meetingBins.has(normalizeBin(r.bin)))
        .map((r) => ({
          bin: normalizeBin(r.bin),
          name: r.name.trim(),
          meetingScheduled: true,
        }));
      await onSuccess({ items: result.items, meetingRows, skippedExisting });
      onClose();
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const listId = `digger-transfer-clients-${reportDate}`;

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-2xl max-h-[92vh] rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col">
        <div className="flex items-start justify-between gap-3 px-4 sm:px-6 pt-4 sm:pt-5 pb-3 border-b border-gray-100">
          <div className="text-left">
            <h3 className="text-sm font-black text-gray-900 uppercase tracking-wide">Передача в круп</h3>
            <p className="text-[11px] text-gray-500 mt-1">
              {rowCount} {rowCount === 1 ? 'компания' : rowCount < 5 ? 'компании' : 'компаний'} · дата отчёта{' '}
              {reportDate}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              Можно выбрать из ваших клиентов ({clients.length}) или ввести новые
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-50"
          >
            <X size={18} />
          </button>
        </div>

        <datalist id={listId}>
          {clients.map((c) => (
            <option key={c.bin} value={c.name}>
              {c.bin}
            </option>
          ))}
        </datalist>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-3">
          {rows.map((row, idx) => (
            <div
              key={idx}
              className="grid grid-cols-1 sm:grid-cols-[120px_1fr_auto] gap-2 sm:gap-3 items-end p-3 rounded-xl bg-gray-50 border border-gray-100"
            >
              <div className="space-y-1 text-left">
                <label className="text-[9px] font-bold text-gray-400 uppercase ml-1">БИН</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={12}
                  list={listId}
                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono font-bold outline-none focus:border-blue-500"
                  value={row.bin}
                  onChange={(e) => onBinChange(idx, e.target.value)}
                  placeholder="12 цифр"
                />
              </div>
              <div className="space-y-1 text-left">
                <label className="text-[9px] font-bold text-gray-400 uppercase ml-1">Название</label>
                <input
                  type="text"
                  list={listId}
                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:border-blue-500"
                  value={row.name}
                  onChange={(e) => onNameChange(idx, e.target.value)}
                  placeholder="ТОО … или выберите из списка"
                />
              </div>
              <label className="flex items-center gap-2 pb-2.5 sm:pb-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="rounded border-gray-300"
                  checked={row.meetingScheduled}
                  onChange={(e) => updateRow(idx, { meetingScheduled: e.target.checked })}
                />
                <span className="text-[11px] font-bold text-gray-600 whitespace-nowrap">Встреча</span>
              </label>
            </div>
          ))}
        </div>

        {(error || validationError) && (
          <p className="px-4 sm:px-6 text-xs font-bold text-red-600 text-left">{error || validationError}</p>
        )}

        <div className="flex justify-end gap-2 px-4 sm:px-6 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-bold uppercase text-gray-600 hover:bg-gray-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting || Boolean(validationError)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
            Передать
          </button>
        </div>
      </div>
    </div>
  );
}
