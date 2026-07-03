import type { OrderRow } from './ordersGrouping';
import { resolveOrderCommissionTotal } from './commission';

function csvEscape(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  if (/[",;\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function formatReportDate(ymd: string): string {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

export function exportOrdersToExcel(
  orders: OrderRow[],
  options: {
    clientKtpByBin: Map<string, boolean>;
    includeCommission: boolean;
  },
): void {
  const header = [
    'Дата отчёта',
    'Менеджер',
    'БИН/ИИН',
    'Контрагент',
    'Заказ через (ЮЛ)',
    'БИН юр. лица',
    'Кол-во заказов',
    'Сумма',
    ...(options.includeCommission ? ['Комиссия'] : []),
  ];

  const sorted = [...orders].sort((a, b) => {
    const dateCmp = b.date.localeCompare(a.date);
    if (dateCmp !== 0) return dateCmp;
    const mgr = a.manager.localeCompare(b.manager, 'ru');
    if (mgr !== 0) return mgr;
    return a.entityName.localeCompare(b.entityName, 'ru');
  });

  const body = sorted.map((o) => {
    const commission = options.includeCommission
      ? resolveOrderCommissionTotal(o, options.clientKtpByBin)
      : null;
    const row: (string | number)[] = [
      formatReportDate(o.date),
      o.manager,
      o.bin,
      o.entityName,
      o.viaEntityName,
      o.viaBin,
      o.orderCount,
      o.totalAmount,
    ];
    if (options.includeCommission) {
      row.push(commission ?? '');
    }
    return row.map(csvEscape).join(';');
  });

  const csv = `\uFEFF${header.map(csvEscape).join(';')}\n${body.join('\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `zakazy-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
