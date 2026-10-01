import { useState } from 'react';
import { Factory, Loader2, Search } from 'lucide-react';
import { checkBinEnsTruContractsApi, type BinEnsTruCodeResult } from '../lib/binEnsTruCheckApi';

function formatMoney(n: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n);
}

export function BinEnsTruCheckPanel() {
  const [bin, setBin] = useState('');
  const [checking, setChecking] = useState(false);
  const [codes, setCodes] = useState<BinEnsTruCodeResult[]>([]);
  const [year, setYear] = useState<number | null>(null);
  const [sumCap, setSumCap] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCheck = async () => {
    const trimmed = bin.trim();
    if (!/^\d{12}$/.test(trimmed)) {
      setError('БИН/ИИН должен состоять из 12 цифр');
      setCodes([]);
      setMessage(null);
      return;
    }

    setChecking(true);
    setError(null);
    setMessage(null);
    try {
      const res = await checkBinEnsTruContractsApi(trimmed);
      setCodes(res.codes);
      setYear(res.year ?? null);
      setSumCap(res.sumCap ?? null);
      setMessage(res.message ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось выполнить проверку');
      setCodes([]);
    } finally {
      setChecking(false);
    }
  };

  const totalContracts = codes.reduce((sum, c) => sum + c.contractCount, 0);
  const totalSum = codes.reduce((sum, c) => (c.contractSum != null ? sum + c.contractSum : sum), 0);
  const hasCapped = codes.some((c) => c.sumCapped);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500 text-left">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-indigo-600 rounded-xl text-white">
          <Factory size={22} />
        </div>
        <div>
          <h2 className="text-lg font-black text-gray-900">Проверка по БИН</h2>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
            Коды ЕНС ТРУ поставщика (e-ondiris.gov.kz) и объём госзакупок по ним (zakup.gov.kz)
          </p>
        </div>
      </div>

      <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4 max-w-xl">
        <label className="block space-y-1.5">
          <span className="text-[10px] font-bold text-gray-400 uppercase">БИН/ИИН поставщика</span>
          <input
            type="text"
            inputMode="numeric"
            value={bin}
            onChange={(e) => setBin(e.target.value.replace(/\D/g, '').slice(0, 12))}
            placeholder="Например: 061040006993"
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono"
          />
        </label>
        {error ? <p className="text-xs font-bold text-rose-600">{error}</p> : null}
        <button
          type="button"
          disabled={checking}
          onClick={() => void handleCheck()}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-indigo-500 disabled:opacity-60"
        >
          {checking ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          {checking ? 'Проверка… (может занять до минуты)' : 'Проверить'}
        </button>
      </section>

      {message ? (
        <p className="text-sm text-gray-500 font-medium max-w-xl">{message}</p>
      ) : null}

      {codes.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 font-bold">
            Кодов найдено: <span className="text-indigo-700">{codes.length}</span>
            {' · '}
            Договоров за {year}: <span className="text-indigo-700">{totalContracts}</span>
            {' · '}
            Сумма{hasCapped ? ' (без кодов с превышением лимита)' : ''}:{' '}
            <span className="text-emerald-700">{formatMoney(totalSum)} ₸</span>
          </p>
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[760px]">
              <thead>
                <tr className="bg-gray-50/50 text-[10px] font-bold text-gray-400 border-b border-gray-100 uppercase tracking-wider">
                  <th className="py-4 px-6">Код ЕНС ТРУ</th>
                  <th className="py-4 px-4">Товар (по реестру)</th>
                  <th className="py-4 px-4 text-center">Договоров за {year}</th>
                  <th className="py-4 px-6 text-right">Сумма</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {codes.map((row) => (
                  <tr key={row.code} className="hover:bg-gray-50/50 text-sm">
                    <td className="py-4 px-6 font-mono font-bold text-gray-900 whitespace-nowrap">{row.code}</td>
                    <td className="py-4 px-4 text-gray-600 text-xs max-w-sm">
                      {row.names.length > 0 ? row.names.join('; ') : '—'}
                    </td>
                    <td className="py-4 px-4 text-center font-bold text-gray-800">{row.contractCount}</td>
                    <td className="py-4 px-6 text-right font-bold">
                      {row.error ? (
                        <span className="text-rose-600 text-xs font-bold normal-case">{row.error}</span>
                      ) : row.sumCapped ? (
                        <span className="text-amber-600 text-xs font-bold normal-case">
                          больше {sumCap} — не считали
                        </span>
                      ) : (
                        <span className="text-emerald-700">{formatMoney(row.contractSum ?? 0)} ₸</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
