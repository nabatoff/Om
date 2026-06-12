import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import {
  Building2,
  Calendar,
  ChevronDown,
  ChevronUp,
  Download,
  Edit2,
  List,
  Search,
  TrendingUp,
  X,
} from 'lucide-react';
import { formatAttractionMonth } from '../lib/clientProfile';
import type { FullReport, UiClient } from '../lib/crmApi';
import { formatMoneyKzt } from '../lib/commission';
import {
  addCalendarMonths,
  buildSupplierRegistryRows,
  collectRegistryMonthOptions,
  collectRegistryYears,
  countOrderLinesInMonth,
  currentYearMonth,
  expandModalOrderLines,
  exportSupplierRegistryCsv,
  formatRegistryMonthLabel,
  formatRegistryMoney,
  hasOrdersInYear,
  monthsInYear,
  sumDisplayedMonthsAmount,
  sumMonthAmount,
  sumMonthCommission,
  type RegistryMonthModalData,
  type SupplierRegistryRow,
} from '../lib/supplierRegistry';

type SortKey = 'name' | 'managerName' | 'monthsWithUs' | 'totalTurnover';
type ViewMode = 'cohort' | 'year';

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesSupplierSearch(row: SupplierRegistryRow, rawQuery: string): boolean {
  const textQuery = normalizeSearchText(rawQuery);
  const digitsQuery = rawQuery.replace(/\D/g, '');
  if (!textQuery && !digitsQuery) return true;
  const nameMatch = textQuery ? normalizeSearchText(row.name).includes(textQuery) : false;
  const binMatch = digitsQuery ? row.bin.replace(/\D/g, '').includes(digitsQuery) : false;
  return nameMatch || binMatch;
}

type Props = {
  clients: UiClient[];
  reports: FullReport[];
  clientKtpByBin: Map<string, boolean>;
  onOpenClient?: (client: UiClient) => void;
};

type DossierPlacement = 'right' | 'above' | 'below';

type DossierAnchor = {
  supplier: SupplierRegistryRow;
  left: number;
  top: number;
  placement: DossierPlacement;
};

const DOSSIER_W = 288;
const DOSSIER_H = 300;

function SupplierDossierPopover({
  anchor,
  clientByBin,
  onOpenClient,
  onDismiss,
  onPointerEnter,
  onPointerLeave,
}: {
  anchor: DossierAnchor;
  clientByBin: Map<string, UiClient>;
  onOpenClient?: (client: UiClient) => void;
  onDismiss: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}) {
  const { supplier, placement } = anchor;
  const left =
    placement === 'right'
      ? Math.min(anchor.left, window.innerWidth - DOSSIER_W - 12)
      : Math.max(12, Math.min(anchor.left, window.innerWidth - DOSSIER_W));

  const style: CSSProperties =
    placement === 'right'
      ? { left, top: anchor.top }
      : placement === 'above'
        ? { left, top: anchor.top, transform: 'translateY(-100%)' }
        : { left, top: anchor.top };

  return createPortal(
    <div
      className="fixed z-[500] w-72 bg-white rounded-2xl shadow-xl border border-gray-100 p-5"
      style={style}
      onMouseEnter={onPointerEnter}
      onMouseLeave={onPointerLeave}
    >
      <div
        className={`absolute w-4 h-4 bg-white rotate-45 ${
          placement === 'right'
            ? '-left-2 top-6 border-l border-b border-gray-100'
            : placement === 'above'
              ? '-bottom-2 left-8 border-b border-r border-gray-100'
              : '-top-2 left-8 border-t border-l border-gray-100'
        }`}
      />
      <div className="relative z-10">
        <h4 className="font-bold text-gray-800 mb-3 flex items-center justify-between text-sm">
          Досье
          {onOpenClient && clientByBin.has(supplier.bin) && (
            <button
              type="button"
              onClick={() => {
                onDismiss();
                onOpenClient(clientByBin.get(supplier.bin)!);
              }}
              className="text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"
            >
              <Edit2 size={12} />
              Карточка
            </button>
          )}
        </h4>
        <div className="space-y-2">
          <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
            <div className="text-[10px] uppercase font-bold text-gray-400 mb-1 flex items-center gap-1">
              <Building2 size={12} />
              Категория
            </div>
            <div className="text-sm font-medium text-gray-700">{supplier.categoryName || '—'}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
            <div className="text-[10px] uppercase font-bold text-gray-400 mb-1 flex items-center gap-1">
              <TrendingUp size={12} />
              Обороты ГЗ (прошлый год)
            </div>
            <div className="text-sm font-bold text-emerald-600">
              {supplier.gzTurnoverPrevYear != null
                ? `${formatMoneyKzt(supplier.gzTurnoverPrevYear)} ₸`
                : '—'}
            </div>
          </div>
          <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
            <div className="text-[10px] uppercase font-bold text-gray-400 mb-1 flex items-center gap-1">
              <Calendar size={12} />
              Месяц привлечения
            </div>
            <div className="text-sm font-medium text-gray-700">
              {formatAttractionMonth(supplier.attractionMonth)}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function RegistryOrderModal({
  data,
  clientKtpByBin,
  onClose,
}: {
  data: RegistryMonthModalData | null;
  clientKtpByBin: Map<string, boolean>;
  onClose: () => void;
}) {
  if (!data) return null;

  const lines = expandModalOrderLines(data.orders, clientKtpByBin);
  const totalAmount = lines.reduce((s, l) => s + l.amount, 0);
  const commissionParts = lines.map((l) => l.commission).filter((c): c is number => c != null);
  const totalCommission = commissionParts.length > 0 ? commissionParts.reduce((a, b) => a + b, 0) : null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-md z-[500] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl w-full max-w-lg overflow-hidden flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 pb-4 relative border-b border-gray-100">
          <button type="button" onClick={onClose} className="absolute top-6 right-6 text-gray-400 hover:text-gray-600">
            <X size={22} />
          </button>
          <h2 className="text-lg font-black text-gray-900 uppercase tracking-wide pr-8">{data.supplier.name}</h2>
          <p className="text-xs text-gray-500 font-mono mt-1">БИН {data.supplier.bin}</p>
          <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mt-2">{data.monthLabel}</p>
        </div>

        <div className="p-6 overflow-y-auto max-h-[50vh] space-y-3">
          {lines.map((line) => (
            <div
              key={`${line.index}-${line.reportDate}-${line.amount}`}
              className="bg-gray-50 rounded-2xl p-4 flex justify-between items-center"
            >
              <div>
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  Заказ №{line.index}
                </span>
                <p className="text-xs font-semibold text-gray-500 mt-1">
                  {new Date(line.reportDate).toLocaleDateString('ru-RU')}
                </p>
              </div>
              <div className="text-right">
                <div className="text-base font-extrabold text-gray-900">{formatRegistryMoney(line.amount)}</div>
                <div className="text-[10px] font-bold text-purple-700 mt-0.5">
                  Комиссия: {formatRegistryMoney(line.commission)}
                </div>
              </div>
            </div>
          ))}
          {lines.length === 0 && (
            <p className="text-center py-8 text-gray-400 text-sm">Нет заказов в этом месяце</p>
          )}
        </div>

        <div className="p-6 border-t border-gray-100 flex justify-between items-end bg-gray-50/80">
          <div>
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Итого сумма</div>
            <div className="text-xl font-extrabold text-emerald-600">{formatRegistryMoney(totalAmount)}</div>
            <div className="text-[11px] font-bold text-purple-700 mt-1">
              Итого комиссия: {formatRegistryMoney(totalCommission)}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-500"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

export function SupplierRegistryPanel({ clients, reports, clientKtpByBin, onOpenClient }: Props) {
  const rows = useMemo(
    () => buildSupplierRegistryRows(clients, reports, clientKtpByBin),
    [clients, reports, clientKtpByBin],
  );

  const monthOptions = useMemo(() => collectRegistryMonthOptions(rows), [rows]);
  const yearOptions = useMemo(() => collectRegistryYears(rows), [rows]);

  const [searchTerm, setSearchTerm] = useState('');
  const [managerFilter, setManagerFilter] = useState('Все');
  const [categoryFilter, setCategoryFilter] = useState('Все');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
    key: 'name',
    direction: 'asc',
  });
  const [viewMode, setViewMode] = useState<ViewMode>('cohort');
  const [cohortMonth, setCohortMonth] = useState(() => monthOptions[0] ?? currentYearMonth());
  const [selectedYear, setSelectedYear] = useState(() => yearOptions[0] ?? new Date().getFullYear());
  const [modalData, setModalData] = useState<RegistryMonthModalData | null>(null);
  const [dossierAnchor, setDossierAnchor] = useState<DossierAnchor | null>(null);
  const dossierHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dossierOverPopoverRef = useRef(false);

  const dismissDossier = () => {
    cancelHideDossier();
    dossierOverPopoverRef.current = false;
    setDossierAnchor(null);
  };

  const cancelHideDossier = () => {
    if (dossierHideTimer.current) clearTimeout(dossierHideTimer.current);
    dossierHideTimer.current = null;
  };

  const scheduleHideDossier = () => {
    cancelHideDossier();
    dossierHideTimer.current = setTimeout(() => {
      if (!dossierOverPopoverRef.current) dismissDossier();
    }, 250);
  };

  const showDossierFromCell = (supplier: SupplierRegistryRow, cell: HTMLElement) => {
    cancelHideDossier();
    if (dossierAnchor && dossierAnchor.supplier.bin !== supplier.bin) return;

    const rect = cell.getBoundingClientRect();
    const spaceRight = window.innerWidth - rect.right;
    let placement: DossierPlacement = 'right';
    let left = rect.right + 8;
    let top = Math.max(12, Math.min(rect.top, window.innerHeight - DOSSIER_H - 12));

    if (spaceRight < DOSSIER_W + 16) {
      const spaceAbove = rect.top;
      const spaceBelow = window.innerHeight - rect.bottom;
      placement = spaceAbove >= DOSSIER_H || spaceAbove >= spaceBelow ? 'above' : 'below';
      left = rect.left + 56;
      top = placement === 'above' ? rect.top - 8 : rect.bottom + 8;
    }

    setDossierAnchor({ supplier, left, top, placement });
  };

  useEffect(() => {
    if (!dossierAnchor) return;
    const hide = () => dismissDossier();
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [dossierAnchor]);

  const effectiveCohortMonth = monthOptions.includes(cohortMonth) ? cohortMonth : (monthOptions[0] ?? currentYearMonth());
  const effectiveYear = yearOptions.includes(selectedYear) ? selectedYear : (yearOptions[0] ?? new Date().getFullYear());

  const managerOptions = useMemo(() => {
    const names = new Set<string>();
    let hasUnassigned = false;
    for (const row of rows) {
      if (row.managerName) names.add(row.managerName);
      else hasUnassigned = true;
    }
    const sorted = Array.from(names).sort((a, b) => a.localeCompare(b, 'ru'));
    return ['Все', ...(hasUnassigned ? ['Не назначен'] : []), ...sorted];
  }, [rows]);

  const effectiveManagerFilter = managerOptions.includes(managerFilter) ? managerFilter : 'Все';

  const categoryOptions = useMemo(() => {
    const names = new Set<string>();
    let hasUncategorized = false;
    for (const row of rows) {
      if (row.categoryName) names.add(row.categoryName);
      else hasUncategorized = true;
    }
    const sorted = Array.from(names).sort((a, b) => a.localeCompare(b, 'ru'));
    return ['Все', ...(hasUncategorized ? ['Без категории'] : []), ...sorted];
  }, [rows]);

  const effectiveCategoryFilter = categoryOptions.includes(categoryFilter) ? categoryFilter : 'Все';

  const displayedMonths = useMemo(() => {
    if (viewMode === 'cohort') {
      return [effectiveCohortMonth, addCalendarMonths(effectiveCohortMonth, 1), addCalendarMonths(effectiveCohortMonth, 2)];
    }
    return monthsInYear(effectiveYear);
  }, [viewMode, effectiveCohortMonth, effectiveYear]);

  const filteredRows = useMemo(() => {
    const q = searchTerm.trim();
    const hasSearch = Boolean(normalizeSearchText(q) || q.replace(/\D/g, ''));

    let list = rows.filter((row) => {
      if (!matchesSupplierSearch(row, q)) return false;

      if (effectiveManagerFilter !== 'Все') {
        if (effectiveManagerFilter === 'Не назначен') {
          if (row.managerName) return false;
        } else if (row.managerName !== effectiveManagerFilter) {
          return false;
        }
      }

      if (effectiveCategoryFilter !== 'Все') {
        if (effectiveCategoryFilter === 'Без категории') {
          if (row.categoryName) return false;
        } else if (row.categoryName !== effectiveCategoryFilter) {
          return false;
        }
      }

      if (viewMode === 'year') {
        return hasOrdersInYear(row, effectiveYear);
      }
      if (!hasSearch) {
        return row.firstOrderMonth === effectiveCohortMonth;
      }
      return true;
    });

    list = [...list].sort((a, b) => {
      const key = sortConfig.key;
      let av: string | number | null;
      let bv: string | number | null;

      if (key === 'totalTurnover') {
        av = sumDisplayedMonthsAmount(a, displayedMonths);
        bv = sumDisplayedMonthsAmount(b, displayedMonths);
      } else if (key === 'managerName') {
        av = a.managerName ?? '';
        bv = b.managerName ?? '';
      } else {
        av = a[key];
        bv = b[key];
      }

      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return sortConfig.direction === 'asc' ? -1 : 1;
      if (av > bv) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [
    rows,
    searchTerm,
    viewMode,
    effectiveCohortMonth,
    effectiveYear,
    effectiveManagerFilter,
    effectiveCategoryFilter,
    sortConfig,
    displayedMonths,
  ]);

  const handleSort = (key: SortKey) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: key === 'totalTurnover' ? 'desc' : 'asc' };
    });
  };

  const openModal = (supplier: SupplierRegistryRow, monthKey: string, orders: SupplierRegistryRow['ordersByMonth'][string]) => {
    setModalData({
      supplier,
      monthKey,
      monthLabel: formatRegistryMonthLabel(monthKey),
      orders,
    });
  };

  const clientByBin = useMemo(() => {
    const m = new Map<string, UiClient>();
    for (const c of clients) m.set(c.bin, c);
    return m;
  }, [clients]);

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortConfig.key === col ? (
      sortConfig.direction === 'asc' ? (
        <ChevronUp size={14} className="ml-1 text-blue-600" />
      ) : (
        <ChevronDown size={14} className="ml-1 text-blue-600" />
      )
    ) : null;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <Building2 size={22} className="text-blue-600" />
            Реестр поставщиков
          </h2>
          <p className="text-gray-500 text-sm mt-1">Управление и анализ активности контрагентов</p>
        </div>

        <div className="flex gap-3 items-center flex-wrap justify-end">
          <div className="flex items-center bg-gray-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setViewMode('cohort')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                viewMode === 'cohort' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Когорты
            </button>
            <button
              type="button"
              onClick={() => setViewMode('year')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                viewMode === 'year' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              За год
            </button>
          </div>

          {viewMode === 'cohort' ? (
            <div className="flex items-center gap-2 bg-white px-3 py-2 border border-gray-200 rounded-xl shadow-sm">
              <label className="text-xs text-gray-500 font-medium whitespace-nowrap">Старт:</label>
              <select
                className="text-xs font-bold text-blue-700 bg-transparent outline-none cursor-pointer"
                value={effectiveCohortMonth}
                onChange={(e) => setCohortMonth(e.target.value)}
              >
                {monthOptions.map((m) => (
                  <option key={m} value={m}>
                    {formatRegistryMonthLabel(m)}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-white px-3 py-2 border border-gray-200 rounded-xl shadow-sm">
              <label className="text-xs text-gray-500 font-medium whitespace-nowrap">Год:</label>
              <select
                className="text-xs font-bold text-blue-700 bg-transparent outline-none cursor-pointer"
                value={effectiveYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            onClick={() => exportSupplierRegistryCsv(filteredRows, displayedMonths)}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-500 transition-colors text-xs font-bold uppercase tracking-wider"
          >
            <Download size={14} className="mr-2" />
            Экспорт
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 flex flex-col sm:flex-row gap-3 flex-wrap">
        <select
          value={effectiveManagerFilter}
          onChange={(e) => setManagerFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-medium bg-gray-50 min-w-[180px] shrink-0"
        >
          {managerOptions.map((m) => (
            <option key={m} value={m}>
              {m === 'Все' ? 'Все менеджеры' : m}
            </option>
          ))}
        </select>
        <select
          value={effectiveCategoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-medium bg-gray-50 min-w-[180px] shrink-0"
        >
          {categoryOptions.map((c) => (
            <option key={c} value={c}>
              {c === 'Все' ? 'Все категории' : c}
            </option>
          ))}
        </select>
        <div className="relative flex-1 min-w-[220px]">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Поиск по названию или БИН..."
            className="block w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-x-auto text-left">
          <table className="w-full text-left border-collapse min-w-[1100px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th
                  className="p-4 text-xs font-black text-gray-500 uppercase tracking-tight cursor-pointer hover:bg-gray-100 w-1/4"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center">
                    Название поставщика
                    <SortIcon col="name" />
                  </div>
                </th>
                <th
                  className="p-4 text-xs font-black text-gray-500 uppercase tracking-tight cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('managerName')}
                >
                  <div className="flex items-center">
                    Менеджер
                    <SortIcon col="managerName" />
                  </div>
                </th>
                <th
                  className="p-4 text-xs font-black text-gray-500 uppercase tracking-tight cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('monthsWithUs')}
                >
                  <div className="flex items-center">
                    Мес. с нами
                    <SortIcon col="monthsWithUs" />
                  </div>
                </th>
                {displayedMonths.map((month) => (
                  <th
                    key={month}
                    className="p-4 text-xs font-black text-blue-800 text-right bg-blue-50/50 border-l border-gray-100 whitespace-nowrap pr-6"
                  >
                    {formatRegistryMonthLabel(month)}
                  </th>
                ))}
                <th className="p-4 text-xs font-black text-gray-500 uppercase text-center border-l border-gray-200 bg-gray-50">
                  Всего заказов
                </th>
                <th
                  className="p-4 text-xs font-black text-gray-500 uppercase text-right bg-gray-50 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('totalTurnover')}
                >
                  <div className="flex items-center justify-end">
                    Суммарный оборот
                    <SortIcon col="totalTurnover" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRows.map((supplier) => {
                let totalOrders = 0;
                let grandAmount = 0;
                let grandCommission = 0;
                let hasGrandCommission = false;

                displayedMonths.forEach((month) => {
                  const orders = supplier.ordersByMonth[month] ?? [];
                  totalOrders += countOrderLinesInMonth(orders);
                  grandAmount += sumMonthAmount(orders);
                  const c = sumMonthCommission(orders);
                  if (c != null) {
                    grandCommission += c;
                    hasGrandCommission = true;
                  }
                });

                return (
                  <tr key={supplier.bin} className="hover:bg-gray-50/80 transition-colors">
                    <td
                      className="p-4"
                      onMouseEnter={(e) => showDossierFromCell(supplier, e.currentTarget)}
                      onMouseLeave={scheduleHideDossier}
                    >
                      <div className="flex items-center">
                        <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold mr-3 shrink-0">
                          {supplier.name.charAt(0) || '?'}
                        </div>
                        <div>
                          <div className="font-bold text-gray-800 text-sm">{supplier.name}</div>
                          <div className="text-[11px] text-gray-400 font-mono mt-0.5">БИН: {supplier.bin}</div>
                          {supplier.categoryName && (
                            <div className="text-xs text-gray-500 mt-0.5">{supplier.categoryName}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-sm text-gray-700">
                      <div className="flex items-center">
                        <div className="w-7 h-7 rounded-full bg-gray-100 border border-gray-200 text-gray-600 flex items-center justify-center text-[10px] font-bold mr-2">
                          {(supplier.managerName ?? '?').charAt(0)}
                        </div>
                        {supplier.managerName ?? '—'}
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-800">
                        {supplier.monthsWithUs != null ? `${supplier.monthsWithUs} мес.` : '—'}
                      </span>
                    </td>

                    {displayedMonths.map((month) => {
                      const orders = supplier.ordersByMonth[month] ?? [];
                      const lineCount = countOrderLinesInMonth(orders);
                      const totalAmount = sumMonthAmount(orders);
                      const totalCommission = sumMonthCommission(orders);

                      return (
                        <td key={`${supplier.bin}-${month}`} className="p-4 border-l border-gray-50 align-middle bg-blue-50/10">
                          {lineCount > 0 ? (
                            <div className="flex items-center justify-end gap-3">
                              <button
                                type="button"
                                onClick={() => openModal(supplier, month, orders)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-xl text-gray-600 font-bold hover:bg-gray-200 text-xs"
                              >
                                <List size={14} className="text-gray-400" />
                                {lineCount}
                              </button>
                              <div className="text-right min-w-[120px]">
                                <div className="text-emerald-600 font-bold text-sm">{formatRegistryMoney(totalAmount)}</div>
                                <div className="text-purple-700 text-[10px] font-bold mt-0.5">
                                  Ком.: {formatRegistryMoney(totalCommission)}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-300 block text-center">—</span>
                          )}
                        </td>
                      );
                    })}

                    <td className="p-4 text-center border-l border-gray-200 bg-gray-50/50">
                      <span className="inline-flex items-center justify-center min-w-[2rem] px-2 h-8 rounded-xl bg-blue-100 text-blue-700 font-bold text-sm">
                        {totalOrders || '—'}
                      </span>
                    </td>
                    <td className="p-4 text-right bg-gray-50/50">
                      <div className="text-emerald-600 font-extrabold text-sm">
                        {grandAmount > 0 ? formatRegistryMoney(grandAmount) : '—'}
                      </div>
                      {hasGrandCommission && (
                        <div className="text-purple-700 text-[10px] font-bold mt-0.5">
                          Общая ком.: {formatRegistryMoney(grandCommission)}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={4 + displayedMonths.length} className="p-10 text-center text-gray-500 text-sm">
                    Поставщики не найдены. Попробуйте изменить параметры поиска или фильтр.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
      </div>

      {dossierAnchor ? (
        <SupplierDossierPopover
          anchor={dossierAnchor}
          clientByBin={clientByBin}
          onOpenClient={onOpenClient}
          onDismiss={dismissDossier}
          onPointerEnter={() => {
            dossierOverPopoverRef.current = true;
            cancelHideDossier();
          }}
          onPointerLeave={() => {
            dossierOverPopoverRef.current = false;
            scheduleHideDossier();
          }}
        />
      ) : null}

      <RegistryOrderModal data={modalData} clientKtpByBin={clientKtpByBin} onClose={() => setModalData(null)} />
    </div>
  );
}
