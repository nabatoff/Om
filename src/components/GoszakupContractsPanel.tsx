import { useRef, useState } from 'react';
import { Download, FileSpreadsheet, Loader2, X } from 'lucide-react';
import {
  exportAllGoszakupContractsByBin,
  exportGoszakupContractsToExcel,
} from '../lib/goszakupContractsApi';

export function GoszakupContractsPanel() {
  const [bin, setBin] = useState('');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{
    page: number;
    loaded: number;
    total: number | null;
    phase: 'list' | 'enrich';
  } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const digits = bin.replace(/\D/g, '').slice(0, 12);

  const cancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
  };

  const runExport = async () => {
    if (running) return;
    if (digits.length !== 12) {
      setError('Введите БИН поставщика (12 цифр)');
      return;
    }
    setError(null);
    setStatus(null);
      setProgress({ page: 0, loaded: 0, total: null, phase: 'list' });
    setRunning(true);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const { rows, total, missingSums } = await exportAllGoszakupContractsByBin(digits, {
        signal: ac.signal,
        onProgress: setProgress,
      });
      if (rows.length === 0) {
        setStatus('Договоры не найдены');
        return;
      }
      await exportGoszakupContractsToExcel(rows, digits);
      const withSums = rows.length - missingSums;
      setStatus(
        `Готово: ${rows.length} договоров${total != null ? ` (из ${total})` : ''}, сумм: ${withSums}/${rows.length}${
          missingSums > 0 ? ` (без публичной карточки: ${missingSums})` : ''
        }. Excel скачан.`,
      );
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setStatus('Отменено');
      } else {
        setError(e instanceof Error ? e.message : 'Не удалось выгрузить договоры');
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300 max-w-2xl">
      <div className="flex items-start gap-3">
        <div className="p-2.5 bg-blue-600 rounded-xl text-white">
          <FileSpreadsheet size={20} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">Договоры госзакупа</h2>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
            Выгрузка по БИН · суммы с карточки (плановая / итоговая)
          </p>
          <p className="text-xs text-amber-700/80 mt-1">
            На проде goszakup с Vercel/EU часто таймаутит. Для полного покрытия сумм —{' '}
            <code className="text-[11px] bg-amber-50 px-1 rounded">npm run dev</code> локально.
          </p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
        <label className="block space-y-1.5">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">БИН поставщика</span>
          <input
            type="text"
            inputMode="numeric"
            value={digits}
            onChange={(e) => setBin(e.target.value.replace(/\D/g, '').slice(0, 12))}
            disabled={running}
            placeholder="211140016342"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm font-mono font-bold outline-none focus:ring-2 focus:ring-blue-500/30 disabled:bg-gray-50"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void runExport()}
            disabled={running || digits.length !== 12}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold uppercase tracking-widest shadow-sm hover:bg-blue-500 disabled:opacity-50"
          >
            {running ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {running ? 'Выгрузка…' : 'Выгрузить в Excel'}
          </button>
          {running ? (
            <button
              type="button"
              onClick={cancel}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-xs font-bold uppercase tracking-widest hover:bg-gray-50"
            >
              <X size={14} />
              Отменить
            </button>
          ) : null}
        </div>

        {running && progress ? (
          <p className="text-sm text-gray-600">
            {progress.phase === 'list' ? 'Список' : 'Суммы с карточек'}
            {' · '}
            страница <span className="font-bold">{Math.max(1, progress.page)}</span>
            {' · '}
            <span className="font-bold">{progress.loaded}</span>
            {progress.total != null ? (
              <>
                {' '}
                / <span className="font-bold">{progress.total}</span>
              </>
            ) : null}
            <span className="text-gray-400"> — может занять несколько минут</span>
          </p>
        ) : null}

        {status ? <p className="text-sm font-medium text-emerald-700">{status}</p> : null}
        {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

        <p className="text-[11px] text-gray-400 leading-relaxed">
          Данные берутся с публичного реестра goszakup.gov.kz: метаданные из списка, «Общая плановая сумма»
          и «Общая итоговая сумма» — из карточки договора (не из Excel сайта, где суммы часто с НДС).
        </p>
      </div>
    </div>
  );
}
