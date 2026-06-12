import { useMemo, useState } from 'react';
import {
  Building2,
  ChevronDown,
  ChevronUp,
  Download,
  Edit2,
  List,
  Search,
  TrendingUp,
  X,
} from 'lucide-react';
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
  monthsInYear,
  sumMonthAmount,
  sumMonthCommission,
  type RegistryMonthModalData,
  type SupplierRegistryRow,
} from '../lib/supplierRegistry';

type SortKey = 'name' | 'managerName' | 'monthsWithUs';
type ViewMode = 'cohort' | 'year';

type Props = {
  clients: UiClient[];
  reports: FullReport[];
  clientKtpByBin: Map<string, boolean>;
  onOpenClient?: (client: UiClient) => void;
};

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
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
    key: 'name',
    direction: 'asc',
  });
  const [viewMode, setViewMode] = useState<ViewMode>('cohort');
  const [cohortMonth, setCohortMonth] = useState(() => monthOptions[0] ?? currentYearMonth());
  const [selectedYear, setSelectedYear] = useState(() => yearOptions[0] ?? new Date().getFullYear());
  const [modalData, setModalData] = useState<RegistryMonthModalData | null>(null);

  const effectiveCohortMonth = monthOptions.includes(cohortMonth) ? cohortMonth : (monthOptions[0] ?? currentYearMonth());
  const effectiveYear = yearOptions.includes(selectedYear) ? selectedYear : (yearOptions[0] ?? new Date().getFullYear());

  const displayedMonths = useMemo(() => {
    if (viewMode === 'cohort') {
      return [effectiveCohortMonth, addCalendarMonths(effectiveCohortMonth, 1), addCalendarMonths(effectiveCohortMonth, 2)];
    }
    return monthsInYear(effectiveYear);
  }, [viewMode, effectiveCohortMonth, effectiveYear]);

  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');

    let list = rows.filter((row) => {
      const matchesSearch =
        !q ||
        row.name.toLowerCase().includes(q) ||
        row.bin.includes(qDigits) ||
        (row.managerName ?? '').toLowerCase().includes(q);
      if (!matchesSearch) return false;
      if (viewMode === 'cohort') {
        return row.firstOrderMonth === effectiveCohortMonth;
      }
      return true;
    });

    list = [...list].sort((a, b) => {
      const key = sortConfig.key;
      let av: string | number | null = a[key];
      let bv: string | number | null = b[key];
      if (key === 'managerName') {
        av = a.managerName ?? '';
        bv = b.managerName ?? '';
      }
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return sortConfig.direction === 'asc' ? -1 : 1;
      if (av > bv) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [rows, searchTerm, viewMode, effectiveCohortMonth, sortConfig]);

  const handleSort = (key: SortKey) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
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

      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200">
        <div className="relative max-w-md">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Поиск по названию, БИН или менеджеру..."
            className="block w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 min-h-[60vh] overflow-hidden">
        <div className="overflow-x-auto pb-8">
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
                <th className="p-4 text-xs font-black text-gray-500 uppercase text-right bg-gray-50">
                  Суммарный оборот
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
                    <td className="p-4 relative group/company">
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

                      <div className="absolute left-14 top-[75%] z-50 w-72 bg-white rounded-2xl shadow-xl border border-gray-100 p-5 opacity-0 invisible group-hover/company:opacity-100 group-hover/company:visible transition-all duration-200 pointer-events-none group-hover/company:pointer-events-auto">
                        <div className="absolute -top-2 left-8 w-4 h-4 bg-white border-t border-l border-gray-100 rotate-45" />
                        <div className="relative z-10">
                          <h4 className="font-bold text-gray-800 mb-3 flex items-center justify-between text-sm">
                            Досье
                            {onOpenClient && clientByBin.has(supplier.bin) && (
                              <button
                                type="button"
                                onClick={() => onOpenClient(clientByBin.get(supplier.bin)!)}
                                className="text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 pointer-events-auto"
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
                          </div>
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
      </div>

      <RegistryOrderModal data={modalData} clientKtpByBin={clientKtpByBin} onClose={() => setModalData(null)} />
    </div>
  );
}
