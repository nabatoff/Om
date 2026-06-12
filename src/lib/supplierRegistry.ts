import type { FullReport, UiClient } from './crmApi';
import {
  formatMoneyKzt,
  orderLineAmounts,
  resolveOrderCommissionDisplay,
  resolveOrderCommissionTotal,
  type OrderCommissionFields,
} from './commission';

const SHORT_MONTHS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'] as const;

export type RegistryOrderLine = {
  reportDate: string;
  manager: string;
  amounts: number[];
  totalAmount: number;
  commissionTotal: number | null;
  orderFields: OrderCommissionFields;
};

export type SupplierRegistryRow = {
  bin: string;
  name: string;
  managerName: string | null;
  categoryName: string | null;
  gzTurnoverPrevYear: number | null;
  attractionMonth: string | null;
  firstOrderMonth: string | null;
  monthsWithUs: number | null;
  ordersByMonth: Record<string, RegistryOrderLine[]>;
};

export type RegistryMonthModalData = {
  supplier: SupplierRegistryRow;
  monthKey: string;
  monthLabel: string;
  orders: RegistryOrderLine[];
};

export function formatRegistryMonthLabel(ym: string): string {
  const m = ym.match(/^(\d{4})-(\d{2})$/);
  if (!m) return ym;
  const monthIdx = Number(m[2]) - 1;
  const label = SHORT_MONTHS[monthIdx] ?? m[2];
  return `${label} ${m[1]}`;
}

export function parseYearMonth(ym: string): { year: number; month: number } | null {
  const m = ym.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || month < 1 || month > 12) return null;
  return { year, month };
}

export function addCalendarMonths(ym: string, delta: number): string {
  const p = parseYearMonth(ym);
  if (!p) return ym;
  const d = new Date(p.year, p.month - 1 + delta, 1);
  const y = d.getFullYear();
  const mo = d.getMonth() + 1;
  return `${y}-${String(mo).padStart(2, '0')}`;
}

export function calendarMonthsBetween(fromYm: string, toYm: string): number {
  const a = parseYearMonth(fromYm);
  const b = parseYearMonth(toYm);
  if (!a || !b) return 0;
  return (b.year - a.year) * 12 + (b.month - a.month) + 1;
}

export function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function monthsInYear(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
}

export function hasOrdersInYear(row: SupplierRegistryRow, year: number): boolean {
  return monthsInYear(year).some((ym) => (row.ordersByMonth[ym]?.length ?? 0) > 0);
}

export function collectRegistryMonthOptions(rows: SupplierRegistryRow[]): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    if (row.firstOrderMonth) set.add(row.firstOrderMonth);
    for (const ym of Object.keys(row.ordersByMonth)) {
      if (row.ordersByMonth[ym]?.length) set.add(ym);
    }
    if (row.attractionMonth) set.add(row.attractionMonth.slice(0, 7));
  }
  return Array.from(set).sort();
}

export function collectRegistryYears(rows: SupplierRegistryRow[]): number[] {
  const set = new Set<number>();
  for (const row of rows) {
    for (const [ym, orders] of Object.entries(row.ordersByMonth)) {
      if (orders.length > 0) {
        const y = parseYearMonth(ym)?.year;
        if (y) set.add(y);
      }
    }
  }
  if (set.size === 0) {
    set.add(new Date().getFullYear());
  }
  return Array.from(set).sort((a, b) => b - a);
}

export function buildSupplierRegistryRows(
  clients: UiClient[],
  reports: FullReport[],
  clientKtpByBin: ReadonlyMap<string, boolean>,
): SupplierRegistryRow[] {
  const byBin = new Map<string, SupplierRegistryRow>();

  for (const c of clients) {
    const bin = String(c.bin).trim();
    if (!bin) continue;
    byBin.set(bin, {
      bin,
      name: c.name,
      managerName: c.managerName ?? null,
      categoryName: c.categoryName ?? null,
      gzTurnoverPrevYear: c.gzTurnoverPrevYear ?? null,
      attractionMonth: c.attractionMonth ?? null,
      firstOrderMonth: null,
      monthsWithUs: null,
      ordersByMonth: {},
    });
  }

  for (const report of reports) {
    for (const order of report.confirmedOrders) {
      const bin = String(order.bin).trim();
      if (!bin) continue;
      let row = byBin.get(bin);
      if (!row) {
        row = {
          bin,
          name: order.entityName || bin,
          managerName: null,
          categoryName: null,
          gzTurnoverPrevYear: null,
          attractionMonth: null,
          firstOrderMonth: null,
          monthsWithUs: null,
          ordersByMonth: {},
        };
        byBin.set(bin, row);
      }
      const monthKey = String(report.date).slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(monthKey)) continue;

      const orderFields: OrderCommissionFields = {
        amounts: order.amounts,
        totalAmount: order.totalAmount,
        bin: order.bin,
        viaBin: order.viaBin,
        isKtpApplied: order.isKtpApplied,
        mrpKztApplied: order.mrpKztApplied,
        commissionAmount: order.commissionAmount,
      };

      const line: RegistryOrderLine = {
        reportDate: report.date,
        manager: report.manager,
        amounts: orderLineAmounts(order.amounts, order.totalAmount),
        totalAmount: order.totalAmount,
        commissionTotal: resolveOrderCommissionTotal(orderFields, clientKtpByBin),
        orderFields,
      };

      if (!row.ordersByMonth[monthKey]) row.ordersByMonth[monthKey] = [];
      row.ordersByMonth[monthKey].push(line);
    }
  }

  const nowYm = currentYearMonth();
  const rows = Array.from(byBin.values());
  for (const row of rows) {
    const months = Object.keys(row.ordersByMonth)
      .filter((ym) => (row.ordersByMonth[ym]?.length ?? 0) > 0)
      .sort();
    row.firstOrderMonth = months[0] ?? null;
    row.monthsWithUs = row.firstOrderMonth ? calendarMonthsBetween(row.firstOrderMonth, nowYm) : null;
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

export function countOrderLinesInMonth(orders: RegistryOrderLine[]): number {
  return orders.reduce((sum, o) => sum + o.amounts.length, 0);
}

export function sumMonthAmount(orders: RegistryOrderLine[]): number {
  return orders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
}

export function sumMonthCommission(orders: RegistryOrderLine[]): number | null {
  let total = 0;
  let hasAny = false;
  let allKnown = true;
  for (const o of orders) {
    if (o.commissionTotal != null) {
      total += o.commissionTotal;
      hasAny = true;
    } else if (o.amounts.length > 0) {
      allKnown = false;
    }
  }
  if (!hasAny) return null;
  return allKnown ? total : total;
}

export function expandModalOrderLines(
  orders: RegistryOrderLine[],
  clientKtpByBin: ReadonlyMap<string, boolean>,
): { reportDate: string; amount: number; commission: number | null; index: number }[] {
  const out: { reportDate: string; amount: number; commission: number | null; index: number }[] = [];
  let idx = 0;
  for (const o of orders) {
    const { lines, total } = resolveOrderCommissionDisplay(o.orderFields, clientKtpByBin);
    const amounts = o.amounts;
    for (let i = 0; i < amounts.length; i++) {
      idx += 1;
      const commission =
        lines[i] != null ? lines[i] : total != null && amounts.length === 1 ? total : null;
      out.push({
        index: idx,
        reportDate: o.reportDate,
        amount: amounts[i],
        commission,
      });
    }
  }
  return out;
}

function csvEscape(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  if (/[",;\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportSupplierRegistryCsv(rows: SupplierRegistryRow[], displayedMonths: string[]): void {
  const header = [
    'Поставщик',
    'БИН',
    'Менеджер',
    'Мес. с нами',
    'Категория',
    'Обороты ГЗ (прошлый год)',
    ...displayedMonths.flatMap((ym) => [
      `${formatRegistryMonthLabel(ym)} — заказов`,
      `${formatRegistryMonthLabel(ym)} — сумма`,
      `${formatRegistryMonthLabel(ym)} — комиссия`,
    ]),
    'Всего заказов',
    'Суммарный оборот',
    'Суммарная комиссия',
  ];

  const body = rows.map((row) => {
    let totalOrders = 0;
    let grandAmount = 0;
    let grandCommission = 0;
    let hasCommission = false;

    const monthCells = displayedMonths.flatMap((ym) => {
      const orders = row.ordersByMonth[ym] ?? [];
      const cnt = countOrderLinesInMonth(orders);
      const amount = sumMonthAmount(orders);
      const commission = sumMonthCommission(orders);
      totalOrders += cnt;
      grandAmount += amount;
      if (commission != null) {
        grandCommission += commission;
        hasCommission = true;
      }
      return [
        cnt || '',
        amount || '',
        commission != null ? commission : '',
      ];
    });

    return [
      row.name,
      row.bin,
      row.managerName ?? '',
      row.monthsWithUs ?? '',
      row.categoryName ?? '',
      row.gzTurnoverPrevYear ?? '',
      ...monthCells,
      totalOrders || '',
      grandAmount || '',
      hasCommission ? grandCommission : '',
    ]
      .map(csvEscape)
      .join(';');
  });

  const csv = `\uFEFF${header.map(csvEscape).join(';')}\n${body.join('\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reestr-postavshchikov-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function formatRegistryMoney(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return '—';
  return `${formatMoneyKzt(amount)} ₸`;
}
