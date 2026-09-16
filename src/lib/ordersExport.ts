import type { GroupedCounterpartyOrder, OrderRow } from './ordersGrouping';
import { formatMoneyKzt, orderLineAmounts, resolveOrderCommissionDisplay, resolveOrderCommissionTotal } from './commission';

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function xmlStringCell(value: string | null | undefined): string {
  const s = value == null ? '' : String(value);
  if (!s) return '<Cell/>';
  return `<Cell><Data ss:Type="String">${xmlEscape(s)}</Data></Cell>`;
}

function formatMoneyCell(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return '';
  return formatMoneyKzt(Number(value));
}

function formatReportDate(ymd: string): string {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function normalizeBin(value: string | null | undefined): string {
  return value == null ? '' : String(value).trim();
}

/** Excel 2003 XML — открывается без диалога преобразования CSV. */
function buildExcelXml(rows: string[][]): string {
  const rowXml = rows
    .map(
      (cells) =>
        `<Row>${cells.map((cell) => xmlStringCell(cell)).join('')}</Row>`,
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Worksheet ss:Name="Заказы">
  <Table>${rowXml}</Table>
 </Worksheet>
</Workbook>`;
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

  const rows: string[][] = [header];

  for (const o of sorted) {
    const lineAmounts = orderLineAmounts(o.amounts, o.totalAmount);
    const commissionLines = options.includeCommission
      ? resolveOrderCommissionDisplay(o, options.clientKtpByBin).lines
      : [];

    for (let i = 0; i < lineAmounts.length; i++) {
      const row = [
        formatReportDate(o.date),
        o.manager,
        normalizeBin(o.bin),
        o.entityName,
        o.viaEntityName,
        normalizeBin(o.viaBin),
        formatMoneyCell(lineAmounts[i]),
      ];
      if (options.includeCommission) {
        row.push(formatMoneyCell(commissionLines[i]));
      }
      rows.push(row);
    }
  }

  downloadExcelXml(buildExcelXml(rows), `zakazy-${new Date().toISOString().slice(0, 10)}.xls`);
}

/** \u042D\u043A\u0441\u043F\u043E\u0440\u0442 \u0432\u0438\u0434\u0430 \u00AB\u041F\u043E \u043A\u043E\u043D\u0442\u0440\u0430\u0433\u0435\u043D\u0442\u0430\u043C\u00BB \u2014 \u043E\u0434\u043D\u0430 \u0441\u0442\u0440\u043E\u043A\u0430 \u043D\u0430 \u043A\u043E\u043D\u0442\u0440\u0430\u0433\u0435\u043D\u0442\u0430 (\u0430\u0433\u0440\u0435\u0433\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0435 \u043A\u043E\u043B-\u0432\u043E/\u0441\u0443\u043C\u043C\u0430/\u043A\u043E\u043C\u0438\u0441\u0441\u0438\u044F). */
export function exportGroupedOrdersToExcel(
  groups: GroupedCounterpartyOrder[],
  options: {
    clientKtpByBin: Map<string, boolean>;
    includeCommission: boolean;
  },
): void {
  const header = [
    '\u0414\u0430\u0442\u0430',
    '\u041C\u0435\u043D\u0435\u0434\u0436\u0435\u0440',
    '\u0411\u0418\u041D/\u0418\u0418\u041D',
    '\u041A\u043E\u043D\u0442\u0440\u0430\u0433\u0435\u043D\u0442',
    '\u041A\u043E\u043B-\u0432\u043E',
    '\u0421\u0443\u043C\u043C\u0430',
    ...(options.includeCommission ? ['\u041A\u043E\u043C\u0438\u0441\u0441\u0438\u044F'] : []),
  ];

  const sorted = [...groups].sort((a, b) => {
    const dateCmp = b.date.localeCompare(a.date);
    if (dateCmp !== 0) return dateCmp;
    return a.entityName.localeCompare(b.entityName, 'ru');
  });

  const rows: string[][] = [header];

  for (const g of sorted) {
    let commissionSum: number | null = null;
    if (options.includeCommission) {
      let sum = 0;
      let hasAny = false;
      for (const o of g.sourceOrders) {
        const total = resolveOrderCommissionTotal(o, options.clientKtpByBin);
        if (total != null) {
          sum += total;
          hasAny = true;
        }
      }
      commissionSum = hasAny ? sum : null;
    }

    const row = [
      formatReportDate(g.date),
      g.manager,
      normalizeBin(g.bin),
      g.entityName,
      String(g.orderCount),
      formatMoneyCell(g.totalAmount),
    ];
    if (options.includeCommission) {
      row.push(formatMoneyCell(commissionSum));
    }
    rows.push(row);
  }

  downloadExcelXml(buildExcelXml(rows), `zakazy-po-kontragentam-${new Date().toISOString().slice(0, 10)}.xls`);
}

function downloadExcelXml(xml: string, filename: string): void {
  const blob = new Blob([`\uFEFF${xml}`], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
