import type { BinEnsTruCodeResult, BinSupplierStats } from './binEnsTruCheckApi';

type Cell = string | number | null | undefined;

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Числа пишем как Number (чтобы в Excel работали сумма/сортировка), остальное — строкой. */
function cellXml(value: Cell): string {
  if (value == null || value === '') return '<Cell/>';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`;
  }
  return `<Cell><Data ss:Type="String">${xmlEscape(String(value))}</Data></Cell>`;
}

function buildExcelXml(rows: Cell[][]): string {
  const rowXml = rows.map((cells) => `<Row>${cells.map(cellXml).join('')}</Row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Worksheet ss:Name="Проверка по БИН">
  <Table>${rowXml}</Table>
 </Worksheet>
</Workbook>`;
}

function downloadExcelXml(xml: string, filename: string): void {
  const blob = new Blob([`﻿${xml}`], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Выгрузка результата «Проверка по БИН»: сводка по поставщику + таблица кодов (в текущем порядке сортировки). */
export function exportBinCheckToExcel(opts: {
  bin: string;
  year: number | null;
  maxContractPrice: number | null;
  sumCap: number | null;
  supplier: BinSupplierStats | null;
  codes: BinEnsTruCodeResult[];
}): void {
  const { bin, year, maxContractPrice, sumCap, supplier, codes } = opts;
  const rows: Cell[][] = [];

  rows.push(['БИН/ИИН', bin]);
  if (supplier) rows.push(['Поставщик', supplier.name]);
  rows.push(['Год', year]);
  rows.push([]);

  if (supplier) {
    rows.push([`Договоры самого поставщика за ${year ?? ''}`]);
    rows.push(['', 'Количество', 'Сумма, ₸', 'Средний чек, ₸']);
    rows.push([
      'Все договоры',
      supplier.count,
      supplier.sum ?? 'не считали',
      supplier.avgCheck != null ? Math.round(supplier.avgCheck) : '',
    ]);
    rows.push([
      `Договоры до ${maxContractPrice ?? ''} ₸`,
      supplier.underCount,
      supplier.underSum ?? 'не считали',
      '',
    ]);
    rows.push([]);
  }

  rows.push([`Коды ЕНС ТРУ (договоры по стране за ${year ?? ''}${maxContractPrice != null ? `, до ${maxContractPrice} ₸` : ''})`]);
  rows.push(['Код ЕНС ТРУ', 'Наименование (ЕНС ТРУ)', 'Товар (по реестру)', `Договоров за ${year ?? ''}`, 'Сумма, ₸']);
  for (const c of codes) {
    const sum = c.error ? c.error : c.sumCapped ? `больше ${sumCap ?? ''} — не считали` : (c.contractSum ?? 0);
    rows.push([c.code, c.canonicalName ?? '', c.names.join('; '), c.contractCount, sum]);
  }

  downloadExcelXml(buildExcelXml(rows), `proverka-po-bin-${bin}-${new Date().toISOString().slice(0, 10)}.xls`);
}
