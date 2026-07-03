import type { OrderRow } from './ordersGrouping';
import { formatMoneyKzt, orderLineAmounts, resolveOrderCommissionDisplay } from './commission';

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

  const xml = buildExcelXml(rows);
  const blob = new Blob([`\uFEFF${xml}`], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `zakazy-${new Date().toISOString().slice(0, 10)}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}
