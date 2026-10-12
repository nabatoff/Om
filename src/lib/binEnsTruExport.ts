import type { BinEnsTruCodeResult, BinPurchaseMethodStat, BinSupplierStats } from './binEnsTruCheckApi';

/** Принадлежность кода к справочникам «Нацизъятие» и ООИ (вкладка «Проверка ЕНС ТРУ»). */
export type CodeRegime = { nat: boolean; ooi: boolean };

type Style =
  | 'title'
  | 'subtitle'
  | 'section'
  | 'label'
  | 'head'
  | 'text'
  | 'textAlt'
  | 'center'
  | 'centerAlt'
  | 'int'
  | 'intAlt'
  | 'money'
  | 'moneyAlt'
  | 'pct'
  | 'pctAlt'
  | 'note'
  | 'regNat'
  | 'regOoi'
  | 'regBoth'
  | 'regNone';

type Cell = { v?: string | number | null; s?: Style; span?: number };
type Row = { cells: Cell[]; height?: number };

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cellXml(c: Cell): string {
  const style = c.s ? ` ss:StyleID="${c.s}"` : '';
  const merge = c.span && c.span > 1 ? ` ss:MergeAcross="${c.span - 1}"` : '';
  const v = c.v;
  if (v == null || v === '') return `<Cell${style}${merge}/>`;
  if (typeof v === 'number' && Number.isFinite(v)) {
    return `<Cell${style}${merge}><Data ss:Type="Number">${v}</Data></Cell>`;
  }
  return `<Cell${style}${merge}><Data ss:Type="String">${xmlEscape(String(v))}</Data></Cell>`;
}

const BORDER =
  '<Borders>' +
  ['Bottom', 'Left', 'Right', 'Top']
    .map((p) => `<Border ss:Position="${p}" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>`)
    .join('') +
  '</Borders>';

function style(
  id: Style,
  o: {
    bold?: boolean;
    size?: number;
    color?: string;
    bg?: string;
    h?: 'Left' | 'Center' | 'Right';
    wrap?: boolean;
    fmt?: string;
    border?: boolean;
    italic?: boolean;
  },
): string {
  return (
    `<Style ss:ID="${id}">` +
    `<Alignment ss:Horizontal="${o.h ?? 'Left'}" ss:Vertical="Center"${o.wrap ? ' ss:WrapText="1"' : ''}/>` +
    (o.border ? BORDER : '') +
    `<Font ss:FontName="Calibri" ss:Size="${o.size ?? 11}" ss:Color="${o.color ?? '#111827'}"${o.bold ? ' ss:Bold="1"' : ''}${o.italic ? ' ss:Italic="1"' : ''}/>` +
    (o.bg ? `<Interior ss:Color="${o.bg}" ss:Pattern="Solid"/>` : '') +
    (o.fmt ? `<NumberFormat ss:Format="${o.fmt}"/>` : '') +
    '</Style>'
  );
}

const MONEY_FMT = '#,##0\\ &quot;₸&quot;';
const ALT = '#F9FAFB';

const STYLES = [
  style('title', { bold: true, size: 18, color: '#312E81' }),
  style('subtitle', { size: 11, color: '#6B7280' }),
  style('section', { bold: true, size: 13, color: '#FFFFFF', bg: '#4F46E5' }),
  style('label', { bold: true, color: '#374151', bg: '#EEF2FF', border: true }),
  style('head', { bold: true, color: '#FFFFFF', bg: '#1F2937', h: 'Center', wrap: true, border: true }),
  style('text', { wrap: true, border: true }),
  style('textAlt', { wrap: true, border: true, bg: ALT }),
  style('center', { h: 'Center', wrap: true, border: true }),
  style('centerAlt', { h: 'Center', wrap: true, border: true, bg: ALT }),
  style('int', { h: 'Center', border: true, fmt: '#,##0', bold: true }),
  style('intAlt', { h: 'Center', border: true, fmt: '#,##0', bold: true, bg: ALT }),
  style('money', { h: 'Right', border: true, fmt: MONEY_FMT, bold: true, color: '#047857' }),
  style('moneyAlt', { h: 'Right', border: true, fmt: MONEY_FMT, bold: true, color: '#047857', bg: ALT }),
  style('pct', { h: 'Center', border: true, fmt: '0.00&quot;%&quot;' }),
  style('pctAlt', { h: 'Center', border: true, fmt: '0.00&quot;%&quot;', bg: ALT }),
  style('note', { size: 10, italic: true, color: '#B45309' }),
  style('regNat', { bold: true, color: '#BE123C', bg: '#FFE4E6', h: 'Center', border: true }),
  style('regOoi', { bold: true, color: '#B45309', bg: '#FEF3C7', h: 'Center', border: true }),
  style('regBoth', { bold: true, color: '#7E22CE', bg: '#F3E8FF', h: 'Center', border: true }),
  style('regNone', { color: '#9CA3AF', h: 'Center', border: true }),
].join('');

function buildExcelXml(rows: Row[], colWidths: number[]): string {
  const cols = colWidths.map((w) => `<Column ss:Width="${w}"/>`).join('');
  const rowXml = rows
    .map((r) => `<Row${r.height ? ` ss:Height="${r.height}"` : ''}>${r.cells.map(cellXml).join('')}</Row>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>${STYLES}</Styles>
 <Worksheet ss:Name="Проверка по БИН">
  <Table>${cols}${rowXml}</Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <DoNotDisplayGridlines/>
  </WorksheetOptions>
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

function regimeCell(r: CodeRegime | undefined): Cell {
  if (!r) return { v: '—', s: 'regNone' };
  if (r.nat && r.ooi) return { v: 'Нацизъятие + ООИ', s: 'regBoth' };
  if (r.nat) return { v: 'Нацизъятие', s: 'regNat' };
  if (r.ooi) return { v: 'ООИ', s: 'regOoi' };
  return { v: 'Нет', s: 'regNone' };
}

const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 10000) / 100 : 0);

/**
 * Выгрузка результата «Проверка по БИН»: сводка по поставщику, способы закупки и таблица кодов
 * (в текущем порядке сортировки). Формат — Excel XML 2003 со стилями: открывается в Excel без доп. библиотек.
 */
export function exportBinCheckToExcel(opts: {
  bin: string;
  year: number | null;
  maxContractPrice: number | null;
  sumCap: number | null;
  supplier: BinSupplierStats | null;
  methods: BinPurchaseMethodStat[];
  regimes: Record<string, CodeRegime>;
  codes: BinEnsTruCodeResult[];
}): void {
  const { bin, year, maxContractPrice, sumCap, supplier, methods, regimes, codes } = opts;
  const y = year ?? '';
  const COLS = 6;
  const rows: Row[] = [];
  const blank = (): Row => ({ cells: [{}], height: 10 });

  rows.push({ cells: [{ v: 'Проверка по БИН', s: 'title', span: COLS }], height: 30 });
  rows.push({
    cells: [
      {
        v: `${supplier?.name ? `${supplier.name} · ` : ''}БИН/ИИН ${bin} · ${y} год`,
        s: 'subtitle',
        span: COLS,
      },
    ],
    height: 20,
  });
  rows.push(blank());

  if (supplier) {
    rows.push({ cells: [{ v: `Договоры самого поставщика за ${y}`, s: 'section', span: COLS }], height: 24 });
    rows.push({
      cells: [
        { v: '', s: 'head' },
        { v: 'Количество', s: 'head' },
        { v: 'Сумма', s: 'head' },
        { v: 'Средний чек', s: 'head' },
      ],
      height: 22,
    });
    rows.push({
      cells: [
        { v: 'Все договоры', s: 'label' },
        { v: supplier.count, s: 'int' },
        supplier.sum != null ? { v: supplier.sum, s: 'money' } : { v: 'не считали', s: 'center' },
        supplier.avgCheck != null ? { v: Math.round(supplier.avgCheck), s: 'money' } : { v: '—', s: 'center' },
      ],
      height: 20,
    });
    rows.push({
      cells: [
        { v: `Договоры до ${maxContractPrice != null ? maxContractPrice.toLocaleString('ru-RU') : ''} ₸`, s: 'label' },
        { v: supplier.underCount, s: 'intAlt' },
        supplier.underSum != null ? { v: supplier.underSum, s: 'moneyAlt' } : { v: 'не считали', s: 'centerAlt' },
        { v: '', s: 'textAlt' },
      ],
      height: 20,
    });
    rows.push(blank());
  }

  if (methods.length > 0) {
    const totalSum = methods.reduce((a, m) => a + m.sum, 0);
    const totalCount = methods.reduce((a, m) => a + m.count, 0);
    rows.push({ cells: [{ v: `Способы закупки за ${y}`, s: 'section', span: COLS }], height: 24 });
    rows.push({
      cells: [
        { v: 'Способ закупки', s: 'head' },
        { v: 'Договоров', s: 'head' },
        { v: 'Доля по кол-ву', s: 'head' },
        { v: 'Сумма', s: 'head' },
        { v: 'Доля по сумме', s: 'head' },
      ],
      height: 22,
    });
    methods.forEach((m, i) => {
      const alt = i % 2 === 1;
      rows.push({
        cells: [
          { v: m.name, s: alt ? 'textAlt' : 'text' },
          { v: m.count, s: alt ? 'intAlt' : 'int' },
          { v: pct(m.count, totalCount), s: alt ? 'pctAlt' : 'pct' },
          { v: Math.round(m.sum), s: alt ? 'moneyAlt' : 'money' },
          { v: pct(m.sum, totalSum), s: alt ? 'pctAlt' : 'pct' },
        ],
        height: 20,
      });
    });
    rows.push({
      cells: [
        { v: 'Итого', s: 'label' },
        { v: totalCount, s: 'int' },
        { v: 100, s: 'pct' },
        { v: Math.round(totalSum), s: 'money' },
        { v: 100, s: 'pct' },
      ],
      height: 20,
    });
    rows.push(blank());
  }

  const priceNote = maxContractPrice != null ? `, до ${maxContractPrice.toLocaleString('ru-RU')} ₸` : '';
  rows.push({
    cells: [{ v: `Коды ЕНС ТРУ (договоры по стране за ${y}${priceNote})`, s: 'section', span: COLS }],
    height: 24,
  });
  rows.push({
    cells: [
      { v: 'Код ЕНС ТРУ', s: 'head' },
      { v: 'Наименование (ЕНС ТРУ)', s: 'head' },
      { v: 'Товар (по реестру)', s: 'head' },
      { v: 'Нацизъятие / ООИ', s: 'head' },
      { v: `Договоров за ${y}`, s: 'head' },
      { v: 'Сумма', s: 'head' },
    ],
    height: 30,
  });
  codes.forEach((c, i) => {
    const alt = i % 2 === 1;
    const sumCell: Cell = c.error
      ? { v: c.error, s: alt ? 'textAlt' : 'text' }
      : c.sumCapped
        ? { v: `больше ${sumCap ?? ''} — не считали`, s: alt ? 'centerAlt' : 'center' }
        : { v: c.contractSum ?? 0, s: alt ? 'moneyAlt' : 'money' };
    rows.push({
      cells: [
        { v: c.code, s: alt ? 'centerAlt' : 'center' },
        { v: c.canonicalName ?? '', s: alt ? 'textAlt' : 'text' },
        { v: c.names.join('; '), s: alt ? 'textAlt' : 'text' },
        regimeCell(regimes[c.code]),
        { v: c.contractCount, s: alt ? 'intAlt' : 'int' },
        sumCell,
      ],
    });
  });

  rows.push(blank());
  rows.push({
    cells: [
      {
        v: 'ООИ — код есть в справочнике вкладки «Проверка ЕНС ТРУ»; Нацизъятие — в справочнике «Нацизъятие». «—» — не удалось проверить.',
        s: 'note',
        span: COLS,
      },
    ],
  });

  const widths = [170, 260, 300, 130, 100, 150];
  downloadExcelXml(buildExcelXml(rows, widths), `proverka-po-bin-${bin}-${new Date().toISOString().slice(0, 10)}.xls`);
}
