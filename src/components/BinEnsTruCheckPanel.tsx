import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Download, Factory, Loader2, Search } from 'lucide-react';
import { checkBinEnsTruContractsApi, type BinEnsTruCodeResult, type BinPurchaseMethodStat, type BinSupplierStats } from '../lib/binEnsTruCheckApi';
import { exportBinCheckToExcel } from '../lib/binEnsTruExport';

function formatMoney(n: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n);
}

type SortKey = 'contractCount' | 'contractSum';

export function BinEnsTruCheckPanel() {
  const [bin, setBin] = useState('');
  const [checking, setChecking] = useState(false);
  const [codes, setCodes] = useState<BinEnsTruCodeResult[]>([]);
  const [year, setYear] = useState<number | null>(null);
  const [sumCap, setSumCap] = useState<number | null>(null);
  const [maxContractPrice, setMaxContractPrice] = useState<number | null>(null);
  const [supplier, setSupplier] = useState<BinSupplierStats | null>(null);
  const [methods, setMethods] = useState<BinPurchaseMethodStat[]>([]);
  const [checked, setChecked] = useState(false);
  const [checkedBin, setCheckedBin] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' } | null>(null);

  const handleCheck = async () => {
    const trimmed = bin.trim();
    if (!/^\d{12}$/.test(trimmed)) {
      setError('БИН/ИИН должен состоять из 12 цифр');
      setCodes([]);
      setSupplier(null);
      setMethods([]);
      setChecked(false);
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
      setMaxContractPrice(res.maxContractPrice ?? null);
      setSupplier(res.supplier ?? null);
      setMethods(res.methods ?? []);
      setChecked(true);
      setCheckedBin(trimmed);
      setMessage(res.message ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось выполнить проверку');
      setCodes([]);
      setSupplier(null);
      setMethods([]);
      setChecked(false);
    } finally {
      setChecking(false);
    }
  };

  const visibleCodes = useMemo(() => codes.filter((c) => c.contractCount > 0), [codes]);

  const sortedCodes = useMemo(() => {
    if (!sortConfig) return visibleCodes;
    const { key, direction } = sortConfig;
    const mul = direction === 'asc' ? 1 : -1;
    return [...visibleCodes].sort((a, b) => {
      const av = key === 'contractCount' ? a.contractCount : a.contractSum ?? -1;
      const bv = key === 'contractCount' ? b.contractCount : b.contractSum ?? -1;
      return (av - bv) * mul;
    });
  }, [visibleCodes, sortConfig]);

  const handleSort = (key: SortKey) => {
    setSortConfig((prev) => {
      if (prev?.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'desc' };
    });
  };

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortConfig?.key === col ? (
      sortConfig.direction === 'asc' ? (
        <ChevronUp size={14} className="ml-1 text-indigo-600" />
      ) : (
        <ChevronDown size={14} className="ml-1 text-indigo-600" />
      )
    ) : null;

  const totalContracts = visibleCodes.reduce((sum, c) => sum + c.contractCount, 0);
  const totalSum = visibleCodes.reduce((sum, c) => (c.contractSum != null ? sum + c.contractSum : sum), 0);
  const hasCapped = visibleCodes.some((c) => c.sumCapped);
  const methodsCount = methods.reduce((a, m) => a + m.count, 0);
  const methodsSum = methods.reduce((a, m) => a + m.sum, 0);

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
        {checked && (supplier || visibleCodes.length > 0) ? (
          <button
            type="button"
            onClick={() =>
              exportBinCheckToExcel({
                bin: checkedBin,
                year,
                maxContractPrice,
                sumCap,
                supplier,
                methods,
                codes: sortedCodes,
              })
            }
            className="ml-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-700 text-xs font-bold uppercase tracking-wider hover:bg-gray-50"
          >
            <Download size={14} />
            Выгрузить в Excel
          </button>
        ) : null}
      </section>

      {checked && supplier ? (
        <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              Договоры самого поставщика за {year}
            </p>
            <p className="text-sm font-black text-gray-900 mt-0.5">{supplier.name}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 space-y-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase">Все договоры</p>
              <div className="flex flex-wrap gap-x-8 gap-y-2">
                <div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase">Кол-во</p>
                  <p className="text-lg font-black text-gray-900">{supplier.count}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase">Сумма</p>
                  <p className="text-lg font-black text-emerald-700 whitespace-nowrap">
                    {supplier.sum != null ? `${formatMoney(supplier.sum)} ₸` : 'не считали'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase">Средний чек</p>
                  <p className="text-lg font-black text-indigo-700 whitespace-nowrap">
                    {supplier.avgCheck != null ? `${formatMoney(supplier.avgCheck)} ₸` : '—'}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 space-y-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase">
                Договоры до {maxContractPrice != null ? formatMoney(maxContractPrice) : '—'} ₸
              </p>
              <div className="flex flex-wrap gap-x-8 gap-y-2">
                <div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase">Кол-во</p>
                  <p className="text-lg font-black text-gray-900">{supplier.underCount}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase">Сумма</p>
                  <p className="text-lg font-black text-emerald-700 whitespace-nowrap">
                    {supplier.underSum != null ? `${formatMoney(supplier.underSum)} ₸` : 'не считали'}
                  </p>
                </div>
              </div>
            </div>
          </div>
          {supplier.capped ? (
            <p className="text-[11px] text-amber-600 font-medium">
              Договоров очень много — суммы не считались, показано только количество.
            </p>
          ) : null}
        </section>
      ) : null}

      {checked && !supplier && !error ? (
        <p className="text-sm text-gray-500 font-medium max-w-xl">
          На zakup.gov.kz организация с этим БИН не найдена — собственных договоров поставщика нет.
        </p>
      ) : null}

      {message ? (
        <p className="text-sm text-gray-500 font-medium max-w-xl">{message}</p>
      ) : null}

      {codes.length > 0 && (
        <div className="space-y-3">
          {maxContractPrice != null ? (
            <p className="text-[11px] text-gray-400 font-medium">
              Учитываются договоры стоимостью до {formatMoney(maxContractPrice)} ₸
            </p>
          ) : null}
          <p className="text-xs text-gray-500 font-bold">
            Кодов с договорами: <span className="text-indigo-700">{visibleCodes.length}</span>
            {' · '}
            Договоров за {year}: <span className="text-indigo-700">{totalContracts}</span>
            {' · '}
            Сумма{hasCapped ? ' (без кодов с превышением лимита)' : ''}:{' '}
            <span className="text-emerald-700">{formatMoney(totalSum)} ₸</span>
          </p>
          {methods.length > 0 ? (
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-x-auto">
              <div className="px-6 pt-5">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  Способы закупки за {year}
                </p>
              </div>
              <table className="w-full text-left border-collapse min-w-[640px]">
                <thead>
                  <tr className="text-[10px] font-bold text-gray-400 border-b border-gray-100 uppercase tracking-wider">
                    <th className="py-3 px-6">Способ закупки</th>
                    <th className="py-3 px-4 text-center">Договоров</th>
                    <th className="py-3 px-4">Доля по сумме</th>
                    <th className="py-3 px-6 text-right">Сумма</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {methods.map((m) => {
                    const share = methodsSum > 0 ? (m.sum / methodsSum) * 100 : 0;
                    return (
                      <tr key={m.name} className="text-sm">
                        <td className="py-3 px-6 font-bold text-gray-800">{m.name}</td>
                        <td className="py-3 px-4 text-center font-bold text-gray-800">
                          {m.count}
                          <span className="text-gray-400 font-medium text-xs ml-1">
                            ({methodsCount > 0 ? ((m.count / methodsCount) * 100).toFixed(1) : '0'}%)
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="h-2 w-32 rounded-full bg-gray-100 overflow-hidden">
                              <div className="h-full bg-indigo-500" style={{ width: `${share}%` }} />
                            </div>
                            <span className="text-xs font-bold text-gray-700">{share.toFixed(2)}%</span>
                          </div>
                        </td>
                        <td className="py-3 px-6 text-right font-bold text-emerald-700 whitespace-nowrap">
                          {formatMoney(m.sum)} ₸
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {hasCapped ? (
                <p className="px-6 py-3 text-[11px] text-amber-600 font-medium">
                  Не включены коды с превышением лимита (суммы по ним не считались).
                </p>
              ) : null}
            </div>
          ) : null}
          {visibleCodes.length === 0 ? (
            <p className="text-sm text-gray-400 font-medium">
              По найденным кодам ЕНС ТРУ договоров за {year} год не было.
            </p>
          ) : (
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[940px]">
              <thead>
                <tr className="bg-gray-50/50 text-[10px] font-bold text-gray-400 border-b border-gray-100 uppercase tracking-wider">
                  <th className="py-4 px-6">Код ЕНС ТРУ</th>
                  <th className="py-4 px-4">Наименование (ЕНС ТРУ)</th>
                  <th className="py-4 px-4">Товар (по реестру)</th>
                  <th
                    className="py-4 px-4 text-center cursor-pointer hover:bg-gray-100/80 select-none"
                    onClick={() => handleSort('contractCount')}
                  >
                    <div className="flex items-center justify-center">
                      Договоров за {year}
                      <SortIcon col="contractCount" />
                    </div>
                  </th>
                  <th
                    className="py-4 px-6 text-right cursor-pointer hover:bg-gray-100/80 select-none"
                    onClick={() => handleSort('contractSum')}
                  >
                    <div className="flex items-center justify-end">
                      Сумма
                      <SortIcon col="contractSum" />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sortedCodes.map((row) => (
                  <tr key={row.code} className="hover:bg-gray-50/50 text-sm">
                    <td className="py-4 px-6 font-mono font-bold text-gray-900 whitespace-nowrap">{row.code}</td>
                    <td className="py-4 px-4 text-gray-800 text-xs font-bold max-w-xs">
                      {row.canonicalName ?? <span className="text-gray-400 font-normal">—</span>}
                    </td>
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
          )}
        </div>
      )}
    </div>
  );
}
