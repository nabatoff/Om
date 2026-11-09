import { Fragment, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, Download, Factory, Loader2, Presentation, Search } from 'lucide-react';
import {
  checkBinEnsTruContractsApi,
  type BinCodesSource,
  type BinEnsTruCheckResponse,
  type BinEnsTruCodeResult,
  type BinPurchaseMethodStat,
  type BinSeasonality,
  type BinShareTotals,
  type BinSupplierStats,
} from '../lib/binEnsTruCheckApi';
import { checkEnsTruCodesApi, checkEnsTruNationalExemptionCodesApi } from '../lib/ensTruApi';
import { exportBinCheckToExcel } from '../lib/binEnsTruExport';
import { openPresentationWindow, renderBinPresentation } from '../lib/binPresentation';
import { CODES_TOP_LIMIT, SEASONALITY_MIN_CONTRACTS, SEASONALITY_PEAK_FACTOR } from '../lib/binCheckConfig';

type CodeRegime = { nat: boolean; ooi: boolean };
type SortKey = 'contractCount' | 'contractSum' | 'share';
type TabKey = 'codes' | 'methods' | 'seasonality';

const MONTHS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
const METHOD_COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#ec4899', '#84cc16'];

function formatMoney(n: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n);
}

function formatPct(part: number, total: number): string {
  if (!(total > 0)) return '—';
  const v = (part / total) * 100;
  return `${v >= 10 ? v.toFixed(1) : v.toFixed(2)}%`;
}

/** Доля поставщика в сумме рынка по коду, % (null — у поставщика нет договоров по коду). */
function codeShare(c: BinEnsTruCodeResult): number | null {
  if (!c.supplierCount || c.contractSum == null || !(c.contractSum > 0)) return null;
  return ((c.supplierSum ?? 0) / c.contractSum) * 100;
}

function RegimeBadges({ regime }: { regime: CodeRegime | undefined }) {
  if (!regime || (!regime.nat && !regime.ooi)) return <span className="text-gray-300 text-xs font-bold">—</span>;
  return (
    <span className="inline-flex items-center gap-1">
      {regime.nat ? (
        <span
          title="Нацизъятие"
          className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-rose-200 bg-rose-50 text-[11px] font-black text-rose-700"
        >
          Н
        </span>
      ) : null}
      {regime.ooi ? (
        <span
          title="ООИ"
          className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-amber-200 bg-amber-50 text-[11px] font-black text-amber-700"
        >
          О
        </span>
      ) : null}
    </span>
  );
}

function SourceBadge({ source }: { source: BinCodesSource }) {
  if (source === 'none') return null;
  const ktp = source === 'ktp';
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-bold ${
        ktp ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'
      }`}
    >
      {ktp ? 'Коды из КТП' : 'Коды из договоров (нет в КТП)'}
    </span>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
      <p className={`mt-1 text-xl font-black leading-tight ${tone ?? 'text-gray-900'}`}>{value}</p>
      {sub ? <p className="mt-1 text-[11px] font-medium text-gray-500">{sub}</p> : null}
    </div>
  );
}

export function BinEnsTruCheckPanel() {
  const [bin, setBin] = useState('');
  /** Проверка за 2026 год (неполный) — показывается рядом с основным 2025. */
  const [res26, setRes26] = useState<BinEnsTruCheckResponse | null>(null);
  const [presBusy, setPresBusy] = useState(false);
  /** Ответы проверки по годам для текущего БИН — презентации нужны оба года (2025 — основа, 2026 — текущие закупки). */
  const resByYear = useRef<{ bin: string; byYear: Record<number, BinEnsTruCheckResponse> }>({ bin: '', byYear: {} });
  const [checking, setChecking] = useState(false);
  const [codes, setCodes] = useState<BinEnsTruCodeResult[]>([]);
  const [year, setYear] = useState<number | null>(null);
  const [sumCap, setSumCap] = useState<number | null>(null);
  const [maxContractPrice, setMaxContractPrice] = useState<number | null>(null);
  const [supplier, setSupplier] = useState<BinSupplierStats | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [methods, setMethods] = useState<BinPurchaseMethodStat[]>([]);
  const [codesSource, setCodesSource] = useState<BinCodesSource>('ktp');
  const [share, setShare] = useState<BinShareTotals | null>(null);
  const [seasonality, setSeasonality] = useState<BinSeasonality | null>(null);
  const [regimes, setRegimes] = useState<Record<string, CodeRegime>>({});
  const [checked, setChecked] = useState(false);
  const [checkedBin, setCheckedBin] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
    key: 'contractSum',
    direction: 'desc',
  });
  const [tab, setTab] = useState<TabKey>('codes');
  const [showAllCodes, setShowAllCodes] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showSeasonTable, setShowSeasonTable] = useState(false);

  const resetResult = () => {
    setCodes([]);
    setSupplier(null);
    setMethods([]);
    setShare(null);
    setSeasonality(null);
    setRes26(null);
    setRegimes({});
    setChecked(false);
  };

  const handleCheck = async () => {
    const trimmed = bin.trim();
    if (!/^\d{12}$/.test(trimmed)) {
      setError('БИН/ИИН должен состоять из 12 цифр');
      resetResult();
      setMessage(null);
      return;
    }

    setChecking(true);
    setError(null);
    setMessage(null);
    try {
      // Оба года параллельно: 2025 — основной, 2026 (неполный) — рядом; если 2026 не загрузился, просто не показываем.
      const [res, cur] = await Promise.all([
        checkBinEnsTruContractsApi(trimmed, 2025),
        checkBinEnsTruContractsApi(trimmed, 2026).catch(() => null),
      ]);
      resByYear.current = { bin: trimmed, byYear: cur ? { 2025: res, 2026: cur } : { 2025: res } };
      setRes26(cur);
      setCodes(res.codes);
      setYear(res.year ?? null);
      setSumCap(res.sumCap ?? null);
      setMaxContractPrice(res.maxContractPrice ?? null);
      setSupplier(res.supplier ?? null);
      setCompanyName(res.companyName ?? '');
      setMethods(res.methods ?? []);
      setCodesSource(res.codesSource ?? 'ktp');
      setShare(res.share ?? null);
      setSeasonality(res.seasonality ?? null);
      setRegimes({});
      setTab('codes');
      setShowAllCodes(false);
      setExpanded(new Set());
      setShowSeasonTable(false);
      const codeList = res.codes.filter((c) => c.contractCount > 0).map((c) => c.code);
      if (codeList.length > 0) {
        // Принадлежность кода к «Нацизъятию» / ООИ — из тех же справочников, что и соседние вкладки проверок.
        void Promise.all([
          checkEnsTruNationalExemptionCodesApi(codeList).catch(() => null),
          checkEnsTruCodesApi(codeList).catch(() => null),
        ]).then(([nat, ooi]) => {
          const natSet = new Set((nat ?? []).filter((r) => r.found).map((r) => r.inputCode));
          const ooiSet = new Set((ooi ?? []).filter((r) => r.found).map((r) => r.inputCode));
          const next: Record<string, CodeRegime> = {};
          for (const code of codeList) {
            if (nat === null && ooi === null) continue;
            next[code] = { nat: natSet.has(code), ooi: ooiSet.has(code) };
          }
          setRegimes(next);
        });
      }
      setChecked(true);
      setCheckedBin(trimmed);
      setMessage(res.message ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось выполнить проверку');
      resetResult();
    } finally {
      setChecking(false);
    }
  };

  const handlePresentation = async () => {
    const w = openPresentationWindow();
    if (!w) {
      setError('Браузер заблокировал новую вкладку — разрешите всплывающие окна для сайта.');
      return;
    }
    setPresBusy(true);
    setError(null);
    try {
      if (resByYear.current.bin !== checkedBin) resByYear.current = { bin: checkedBin, byYear: {} };
      const store = resByYear.current;
      const load = async (y: number) => {
        const cached = store.byYear[y];
        if (cached) return cached;
        const r = await checkBinEnsTruContractsApi(checkedBin, y);
        store.byYear[y] = r;
        return r;
      };
      // 2025 — основа презентации, 2026 — слайд текущих закупок (если не загрузился — слайд просто не показываем).
      const [baseRes, curRes] = await Promise.all([load(2025), load(2026).catch(() => null)]);
      renderBinPresentation(w, {
        bin: checkedBin,
        year: baseRes.year ?? 2025,
        maxContractPrice: baseRes.maxContractPrice ?? null,
        supplier: baseRes.supplier ?? null,
        companyName: baseRes.companyName ?? companyName,
        codesSource: baseRes.codesSource ?? 'ktp',
        share: baseRes.share ?? null,
        seasonality: baseRes.seasonality ?? null,
        codes: baseRes.codes.filter((c) => c.contractCount > 0 && !c.sumCapped && !c.error),
        purchase: baseRes.purchaseStats ?? null,
        current: curRes?.purchaseStats ?? null,
      });
    } catch (e) {
      w.close();
      setError(e instanceof Error ? e.message : 'Не удалось собрать презентацию');
    } finally {
      setPresBusy(false);
    }
  };

  // В таблицу идут только коды с посчитанной суммой; коды с превышением лимита и ошибками — под таблицей счётчиком.
  const tableCodes = useMemo(
    () => codes.filter((c) => c.contractCount > 0 && !c.sumCapped && !c.error),
    [codes],
  );
  const cappedCount = useMemo(() => codes.filter((c) => c.sumCapped).length, [codes]);
  const errorCount = useMemo(() => codes.filter((c) => c.error).length, [codes]);

  const sortedCodes = useMemo(() => {
    const { key, direction } = sortConfig;
    const mul = direction === 'asc' ? 1 : -1;
    const val = (c: BinEnsTruCodeResult): number => {
      if (key === 'contractCount') return c.contractCount;
      if (key === 'contractSum') return c.contractSum ?? -1;
      return codeShare(c) ?? -1;
    };
    return [...tableCodes].sort((a, b) => (val(a) - val(b)) * mul);
  }, [tableCodes, sortConfig]);

  const shownCodes = showAllCodes ? sortedCodes : sortedCodes.slice(0, CODES_TOP_LIMIT);

  const handleSort = (key: SortKey) => {
    setSortConfig((prev) =>
      prev.key === key ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'desc' },
    );
  };

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortConfig.key === col ? (
      sortConfig.direction === 'asc' ? (
        <ChevronUp size={14} className="ml-1 text-indigo-600" />
      ) : (
        <ChevronDown size={14} className="ml-1 text-indigo-600" />
      )
    ) : null;

  const toggleExpanded = (code: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  const codes26 = useMemo(() => new Map((res26?.codes ?? []).map((c) => [c.code, c])), [res26]);
  const marketContracts = tableCodes.reduce((sum, c) => sum + c.contractCount, 0);
  const methodsCount = methods.reduce((a, m) => a + m.count, 0);
  const methodsSum = methods.reduce((a, m) => a + m.sum, 0);

  const underLimitDiffers =
    supplier != null &&
    (supplier.underCount !== supplier.count ||
      (supplier.sum != null && supplier.underSum != null && Math.abs(supplier.sum - supplier.underSum) > 1));

  const hasResult = checked && codesSource !== 'none' && codes.length > 0;

  const seasonMax = seasonality ? Math.max(0, ...seasonality.months.map((m) => m.sum)) : 0;
  const seasonTotal = seasonality?.sum ?? 0;
  const isPeak = (sum: number) =>
    seasonTotal > 0 && sum / seasonTotal >= (1 / 12) * SEASONALITY_PEAK_FACTOR;

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: 'codes', label: `Коды (${tableCodes.length})` },
    { key: 'methods', label: 'Способы закупки' },
    { key: 'seasonality', label: `Сезонность ${year ?? ''}`.trim() },
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500 text-left">
      {/* 1. Шапка */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-600 rounded-xl text-white">
            <Factory size={22} />
          </div>
          <div>
            <h2 className="text-lg font-black text-gray-900">Проверка по БИН</h2>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
              Коды ЕНС ТРУ поставщика и объём госзакупок по ним (zakup.gov.kz)
            </p>
          </div>
        </div>
        {checked && codesSource !== 'none' ? (
          <div className="flex flex-wrap items-center gap-2">
            <SourceBadge source={codesSource} />
            {year != null ? (
              <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[11px] font-bold text-gray-600">
                {year} год
              </span>
            ) : null}
            {maxContractPrice != null ? (
              <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[11px] font-bold text-gray-600">
                Лимит договора {formatMoney(maxContractPrice)} ₸
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4 max-w-xl">
        <label className="block space-y-1.5">
          <span className="text-[10px] font-bold text-gray-400 uppercase">БИН/ИИН поставщика</span>
          <input
            type="text"
            inputMode="numeric"
            value={bin}
            onChange={(e) => setBin(e.target.value.replace(/\D/g, '').slice(0, 12))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !checking) void handleCheck();
            }}
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
        {checked && (supplier || tableCodes.length > 0) ? (
          <button
            type="button"
            onClick={() =>
              exportBinCheckToExcel({
                bin: checkedBin,
                year,
                maxContractPrice,
                sumCap,
                supplier,
                companyName,
                methods,
                regimes,
                codes: sortedCodes,
                codesSource,
                share,
                seasonality,
                cappedCount,
              })
            }
            className="ml-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-700 text-xs font-bold uppercase tracking-wider hover:bg-gray-50"
          >
            <Download size={14} />
            Выгрузить в Excel
          </button>
        ) : null}
        {hasResult ? (
          <button
            type="button"
            disabled={presBusy}
            onClick={() => void handlePresentation()}
            className="ml-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-bold uppercase tracking-wider hover:bg-indigo-100 disabled:opacity-60"
          >
            {presBusy ? <Loader2 size={14} className="animate-spin" /> : null}
            {presBusy ? null : <Presentation size={14} />}
            {presBusy ? 'Собираем данные…' : 'Презентация (PDF)'}
          </button>
        ) : null}
      </section>

      {checked && codesSource === 'none' ? (
        <div className="max-w-xl rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-black text-gray-900">{message ?? 'Нет данных для анализа рынка'}</p>
          <p className="mt-1 text-xs text-gray-500 font-medium">
            {supplier
              ? `В реестрах товаропроизводителей кодов нет, и у ${supplier.name} нет договоров за ${year} год.`
              : 'В реестрах товаропроизводителей кодов нет, а организация с этим БИН не найдена на zakup.gov.kz.'}
          </p>
        </div>
      ) : null}

      {hasResult ? (
        <>
          {/* 2. Сводка из четырёх плиток */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Tile
              label={`Поставщик · ${year}`}
              value={supplier ? (supplier.sum != null ? `${formatMoney(supplier.sum)} ₸` : 'не считали') : 'нет договоров'}
              tone="text-emerald-700"
              sub={
                supplier
                  ? `${supplier.name} · ${supplier.count} дог.${
                      supplier.avgCheck != null ? ` · ср. чек ${formatMoney(supplier.avgCheck)} ₸` : ''
                    }`
                  : 'не найден на zakup.gov.kz'
              }
            />
            <Tile
              label="Рынок по кодам"
              value={share ? `${formatMoney(share.marketSum)} ₸` : '—'}
              tone="text-indigo-700"
              sub={`${tableCodes.length} кодов · ${marketContracts} договоров`}
            />
            <Tile
              label="Доля по всем кодам"
              value={share ? formatPct(share.supplierSum, share.marketSum) : '—'}
              sub={share ? `${formatMoney(share.supplierSum)} из ${formatMoney(share.marketSum)} ₸` : undefined}
            />
            <Tile
              label="Доля в своей нише"
              value={share ? formatPct(share.supplierSum, share.nicheMarketSum) : '—'}
              sub={
                share
                  ? share.nicheCodes > 0
                    ? `по ${share.nicheCodes} кодам с договорами`
                    : 'нет договоров по этим кодам'
                  : undefined
              }
            />
          </div>

          {/* 2б. Те же показатели за 2026 (год неполный) */}
          {res26 && res26.codes.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                2026 год (неполный, данные на сегодня)
              </p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Tile
                  label="Поставщик · 2026"
                  value={res26.supplier ? (res26.supplier.sum != null ? `${formatMoney(res26.supplier.sum)} ₸` : 'не считали') : 'нет договоров'}
                  tone="text-emerald-700"
                  sub={res26.supplier ? `${res26.supplier.count} дог.` : undefined}
                />
                <Tile
                  label="Рынок по кодам · 2026"
                  value={res26.share ? `${formatMoney(res26.share.marketSum)} ₸` : '—'}
                  tone="text-indigo-700"
                  sub={`${res26.codes.filter((c) => c.contractCount > 0 && !c.sumCapped && !c.error).reduce((a, c) => a + c.contractCount, 0)} договоров`}
                />
                <Tile
                  label="Доля по всем кодам · 2026"
                  value={res26.share ? formatPct(res26.share.supplierSum, res26.share.marketSum) : '—'}
                  sub={res26.share ? `${formatMoney(res26.share.supplierSum)} из ${formatMoney(res26.share.marketSum)} ₸` : undefined}
                />
                <Tile
                  label="Доля в нише · 2026"
                  value={res26.share ? formatPct(res26.share.supplierSum, res26.share.nicheMarketSum) : '—'}
                />
              </div>
            </div>
          ) : null}

          {/* 3. Договоры до лимита — только если отличается от «Все договоры» */}
          {supplier && underLimitDiffers ? (
            <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm flex flex-wrap items-center gap-x-8 gap-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                Договоры до {maxContractPrice != null ? formatMoney(maxContractPrice) : '—'} ₸
              </p>
              <p className="text-sm font-black text-gray-900">
                {supplier.underCount} <span className="text-gray-400 font-bold">из {supplier.count} договоров</span>
              </p>
              <p className="text-sm font-black text-emerald-700 whitespace-nowrap">
                {supplier.underSum != null ? `${formatMoney(supplier.underSum)} ₸` : 'сумма не считалась'}
              </p>
              {supplier.capped ? (
                <p className="text-[11px] text-amber-600 font-medium">
                  Договоров очень много — суммы не считались, показано только количество.
                </p>
              ) : null}
            </div>
          ) : null}

          {/* 4. Вкладки */}
          <div className="space-y-4">
            <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`rounded-lg px-4 py-2 text-xs font-bold transition-colors ${
                    tab === t.key ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'codes' ? (
              <div className="space-y-3">
                {tableCodes.length === 0 ? (
                  <p className="text-sm text-gray-400 font-medium">
                    По найденным кодам ЕНС ТРУ договоров за {year} год с посчитанной суммой нет.
                  </p>
                ) : (
                  <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[1060px]">
                      <thead>
                        <tr className="bg-gray-50/50 text-[10px] font-bold text-gray-400 border-b border-gray-100 uppercase tracking-wider">
                          <th className="py-4 pl-4 pr-1 w-8" />
                          <th className="py-4 px-3">Код ЕНС ТРУ</th>
                          <th className="py-4 px-3">Наименование</th>
                          <th className="py-4 px-3 text-center">Статус</th>
                          <th
                            className="py-4 px-3 text-center cursor-pointer hover:bg-gray-100/80 select-none"
                            onClick={() => handleSort('contractCount')}
                          >
                            <div className="flex items-center justify-center">
                              Договоров
                              <SortIcon col="contractCount" />
                            </div>
                          </th>
                          <th
                            className="py-4 px-3 text-right cursor-pointer hover:bg-gray-100/80 select-none"
                            onClick={() => handleSort('contractSum')}
                          >
                            <div className="flex items-center justify-end">
                              Сумма рынка
                              <SortIcon col="contractSum" />
                            </div>
                          </th>
                          <th
                            className="py-4 px-3 text-center cursor-pointer hover:bg-gray-100/80 select-none"
                            onClick={() => handleSort('share')}
                          >
                            <div className="flex items-center justify-center">
                              Доля, %
                              <SortIcon col="share" />
                            </div>
                          </th>
                          <th className="py-4 px-4 text-center">Место</th>
                          {res26 ? <th className="py-4 px-3 text-center">2026: договоров</th> : null}
                          {res26 ? <th className="py-4 px-3 text-right">2026: сумма рынка</th> : null}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {shownCodes.map((row) => {
                          const mine = (row.supplierCount ?? 0) > 0;
                          const open = expanded.has(row.code);
                          const sh = codeShare(row);
                          return (
                            <Fragment key={row.code}>
                              <tr className={`text-sm ${mine ? 'bg-indigo-50/60 hover:bg-indigo-50' : 'hover:bg-gray-50/50'}`}>
                                <td className={`py-3 pl-4 pr-1 ${mine ? 'border-l-4 border-indigo-500' : 'border-l-4 border-transparent'}`}>
                                  <button
                                    type="button"
                                    onClick={() => toggleExpanded(row.code)}
                                    title="Товар по реестру"
                                    className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                                  >
                                    {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                  </button>
                                </td>
                                <td className="py-3 px-3 font-mono font-bold text-gray-900 whitespace-nowrap">{row.code}</td>
                                <td className="py-3 px-3 text-gray-800 text-xs font-bold max-w-sm">
                                  {row.canonicalName ?? <span className="text-gray-400 font-normal">—</span>}
                                </td>
                                <td className="py-3 px-3 text-center">
                                  <RegimeBadges regime={regimes[row.code]} />
                                </td>
                                <td className="py-3 px-3 text-center font-bold text-gray-800">{row.contractCount}</td>
                                <td className="py-3 px-3 text-right font-bold text-emerald-700 whitespace-nowrap">
                                  {formatMoney(row.contractSum ?? 0)} ₸
                                </td>
                                <td className="py-3 px-3 text-center font-bold text-gray-800 whitespace-nowrap">
                                  {sh == null ? <span className="text-gray-300">—</span> : `${sh >= 10 ? sh.toFixed(1) : sh.toFixed(2)}%`}
                                </td>
                                <td className="py-3 px-4 text-center text-xs font-bold text-gray-700 whitespace-nowrap">
                                  {mine && row.supplierRank != null && row.suppliersTotal ? (
                                    `${row.supplierRank}-й из ${row.suppliersTotal}`
                                  ) : (
                                    <span className="text-gray-300">—</span>
                                  )}
                                </td>
                                {res26 ? (
                                  <td className="py-3 px-3 text-center font-bold text-gray-800">
                                    {codes26.get(row.code)?.contractCount ?? 0}
                                  </td>
                                ) : null}
                                {res26 ? (
                                  <td className="py-3 px-3 text-right font-bold text-emerald-700 whitespace-nowrap">
                                    {formatMoney(codes26.get(row.code)?.contractSum ?? 0)} ₸
                                  </td>
                                ) : null}
                              </tr>
                              {open ? (
                                <tr className={mine ? 'bg-indigo-50/30' : 'bg-gray-50/40'}>
                                  <td />
                                  <td colSpan={res26 ? 9 : 7} className="px-3 pb-3 pt-0 text-xs text-gray-600">
                                    <span className="font-bold text-gray-400 uppercase text-[10px] mr-2">Товар по реестру</span>
                                    {row.names.length > 0 ? row.names.join('; ') : 'нет (код найден по договорам поставщика)'}
                                  </td>
                                </tr>
                              ) : null}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {sortedCodes.length > CODES_TOP_LIMIT ? (
                  <button
                    type="button"
                    onClick={() => setShowAllCodes((v) => !v)}
                    className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50"
                  >
                    {showAllCodes ? `Свернуть до ${CODES_TOP_LIMIT}` : `Показать все ${sortedCodes.length} кодов`}
                  </button>
                ) : null}
                <p className="text-[11px] text-gray-400 font-medium">
                  <span className="font-black text-rose-600">Н</span> — нацизъятие, <span className="font-black text-amber-600">О</span> — ООИ.
                  Подсвечены коды, по которым у поставщика есть договоры. Доля и место — по сумме договоров среди поставщиков кода.
                </p>
                {cappedCount > 0 || errorCount > 0 ? (
                  <p className="text-[11px] text-amber-600 font-medium">
                    {cappedCount > 0
                      ? `Не показано кодов с превышением лимита (договоров больше ${sumCap ?? ''}, суммы не считались): ${cappedCount}. `
                      : ''}
                    {errorCount > 0 ? `Не удалось получить данные по кодам: ${errorCount}.` : ''}
                    {' '}Эти коды исключены из расчёта рынка и долей.
                  </p>
                ) : null}
              </div>
            ) : null}

            {tab === 'methods' ? (
              <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-5">
                {methods.length === 0 ? (
                  <p className="text-sm text-gray-400 font-medium">Нет данных по способам закупки.</p>
                ) : (
                  <>
                    <div className="flex h-5 w-full overflow-hidden rounded-full bg-gray-100">
                      {methods.map((m, i) => (
                        <div
                          key={m.name}
                          title={`${m.name}: ${formatPct(m.sum, methodsSum)}`}
                          style={{
                            width: `${methodsSum > 0 ? (m.sum / methodsSum) * 100 : 0}%`,
                            backgroundColor: METHOD_COLORS[i % METHOD_COLORS.length],
                          }}
                        />
                      ))}
                    </div>
                    <ul className="space-y-2">
                      {methods.map((m, i) => (
                        <li key={m.name} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                          <span
                            className="h-3 w-3 shrink-0 rounded-sm"
                            style={{ backgroundColor: METHOD_COLORS[i % METHOD_COLORS.length] }}
                          />
                          <span className="min-w-0 flex-1 font-bold text-gray-800">{m.name}</span>
                          <span className="w-16 text-right text-xs font-black text-gray-700">{formatPct(m.sum, methodsSum)}</span>
                          <span className="w-40 text-right text-xs font-bold text-emerald-700 whitespace-nowrap">
                            {formatMoney(m.sum)} ₸
                          </span>
                          <span className="w-36 text-right text-xs font-medium text-gray-500 whitespace-nowrap">
                            {m.count} дог. ({formatPct(m.count, methodsCount)})
                          </span>
                        </li>
                      ))}
                    </ul>
                    {cappedCount > 0 ? (
                      <p className="text-[11px] text-amber-600 font-medium">
                        Не включены коды с превышением лимита (суммы по ним не считались).
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}

            {tab === 'seasonality' ? (
              <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-5">
                {!seasonality || seasonality.count === 0 ? (
                  <p className="text-sm text-gray-400 font-medium">
                    Нет договоров рынка с датой заключения в {year} году.
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-gray-500 font-medium">
                      Сумма договоров рынка по кодам поставщика по месяцам {year} (по дате заключения), без договоров самого
                      поставщика. Над столбцом — доля месяца в годовой сумме.
                    </p>
                    {seasonality.count < SEASONALITY_MIN_CONTRACTS ? (
                      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-700">
                        Мало данных: один крупный договор может исказить картину ({seasonality.count} дог. при пороге{' '}
                        {SEASONALITY_MIN_CONTRACTS})
                      </p>
                    ) : null}
                    <div className="flex h-56 items-end gap-2 sm:gap-3">
                      {seasonality.months.map((m, i) => {
                        const peak = isPeak(m.sum);
                        const h = seasonMax > 0 ? (m.sum / seasonMax) * 100 : 0;
                        return (
                          <div
                            key={MONTHS[i]}
                            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
                            title={`${MONTHS[i]}: ${formatMoney(m.sum)} ₸, ${m.count} дог.`}
                          >
                            <span className={`text-[10px] font-black ${peak ? 'text-amber-600' : 'text-gray-500'}`}>
                              {formatPct(m.sum, seasonTotal)}
                            </span>
                            <div
                              className={`w-full rounded-t-md ${peak ? 'bg-amber-500' : 'bg-indigo-300'}`}
                              style={{ height: `${Math.max(h, m.sum > 0 ? 2 : 0)}%` }}
                            />
                            <span className="text-[10px] font-bold text-gray-500">{MONTHS[i]}</span>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-gray-400 font-medium">
                      <span className="inline-block h-2 w-2 rounded-sm bg-amber-500 mr-1" />
                      Пиковые месяцы — доля не ниже среднего на {Math.round((SEASONALITY_PEAK_FACTOR - 1) * 100)}% и более.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowSeasonTable((v) => !v)}
                      className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50"
                    >
                      {showSeasonTable ? 'Скрыть таблицу по месяцам' : 'Показать таблицу по месяцам'}
                    </button>
                    {showSeasonTable ? (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[420px] text-left border-collapse">
                          <thead>
                            <tr className="text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-100">
                              <th className="py-2 px-3">Месяц</th>
                              <th className="py-2 px-3 text-center">Договоров</th>
                              <th className="py-2 px-3 text-right">Сумма</th>
                              <th className="py-2 px-3 text-right">Средний чек</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50 text-sm">
                            {seasonality.months.map((m, i) => (
                              <tr key={MONTHS[i]}>
                                <td className="py-2 px-3 font-bold text-gray-800">{MONTHS[i]}</td>
                                <td className="py-2 px-3 text-center font-bold">{m.count}</td>
                                <td className="py-2 px-3 text-right font-bold text-emerald-700 whitespace-nowrap">
                                  {formatMoney(m.sum)} ₸
                                </td>
                                <td className="py-2 px-3 text-right font-bold text-gray-700 whitespace-nowrap">
                                  {m.count > 0 ? `${formatMoney(m.sum / m.count)} ₸` : '—'}
                                </td>
                              </tr>
                            ))}
                            <tr className="bg-gray-50/60">
                              <td className="py-2 px-3 font-black text-gray-900">Итого</td>
                              <td className="py-2 px-3 text-center font-black">{seasonality.count}</td>
                              <td className="py-2 px-3 text-right font-black text-emerald-700 whitespace-nowrap">
                                {formatMoney(seasonality.sum)} ₸
                              </td>
                              <td className="py-2 px-3 text-right font-black text-gray-700 whitespace-nowrap">
                                {seasonality.count > 0 ? `${formatMoney(seasonality.sum / seasonality.count)} ₸` : '—'}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {checked && codesSource !== 'none' && !supplier && !error ? (
        <p className="text-sm text-gray-500 font-medium max-w-xl">
          На zakup.gov.kz организация с этим БИН не найдена — собственных договоров поставщика нет.
        </p>
      ) : null}
    </div>
  );
}
