import { getSupabase } from './supabase';

export type GoszakupContractRow = {
  id: string;
  contractNumber: string;
  buyNumber: string;
  contractType: string;
  status: string;
  createdAt: string;
  planSum: number | null;
  finalSum: number | null;
  customer: string;
  supplier: string;
  tradeMethod: string;
};

export type GoszakupContractsPage = {
  ok?: boolean;
  supplierBin?: string;
  page?: number;
  hasMore?: boolean;
  total?: number | null;
  from?: number | null;
  to?: number | null;
  rows?: GoszakupContractRow[];
  error?: string;
};

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

function formatMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '';
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function buildExcelXml(rows: string[][]): string {
  const rowXml = rows
    .map((cells) => `<Row>${cells.map((cell) => xmlStringCell(cell)).join('')}</Row>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Worksheet ss:Name="Договоры">
  <Table>${rowXml}</Table>
 </Worksheet>
</Workbook>`;
}

export function exportGoszakupContractsToExcel(rows: GoszakupContractRow[], supplierBin: string): void {
  const header = [
    '#',
    'Номер договора',
    'Номер закупки',
    'Тип договора',
    'Статус договора',
    'Дата создания',
    'Общая плановая сумма договора',
    'Общая итоговая сумма договора',
    'Заказчик',
    'Поставщик',
    'Способ закупки',
  ];

  const data = rows.map((r) => [
    r.id,
    r.contractNumber,
    r.buyNumber,
    r.contractType,
    r.status,
    r.createdAt,
    formatMoney(r.planSum),
    formatMoney(r.finalSum),
    r.customer,
    r.supplier,
    r.tradeMethod,
  ]);

  const xml = buildExcelXml([header, ...data]);
  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `goszakup-contracts-${supplierBin}-${new Date().toISOString().slice(0, 10)}.xls`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function fetchGoszakupContractsPage(
  supplierBin: string,
  page: number,
): Promise<GoszakupContractsPage> {
  const { data, error } = await getSupabase().functions.invoke<GoszakupContractsPage>(
    'goszakup-contracts-export',
    {
      body: { supplierBin, page },
    },
  );
  if (data?.error) throw new Error(data.error);
  if (data && data.ok === false) throw new Error(data.error ?? 'Ошибка выгрузки');
  if (error) throw new Error((data as GoszakupContractsPage | null)?.error || error.message);
  if (!data?.ok) throw new Error('Ошибка выгрузки договоров');
  return data;
}

export async function exportAllGoszakupContractsByBin(
  supplierBin: string,
  options: {
    signal?: AbortSignal;
    onProgress?: (p: { page: number; loaded: number; total: number | null }) => void;
  } = {},
): Promise<{ rows: GoszakupContractRow[]; total: number | null }> {
  const bin = supplierBin.replace(/\D/g, '');
  if (bin.length !== 12) throw new Error('БИН должен состоять из 12 цифр');

  const all: GoszakupContractRow[] = [];
  let page = 1;
  let total: number | null = null;
  let hasMore = true;

  while (hasMore) {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const res = await fetchGoszakupContractsPage(bin, page);
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const rows = res.rows ?? [];
    all.push(...rows);
    total = res.total ?? total;
    hasMore = Boolean(res.hasMore);
    options.onProgress?.({ page, loaded: all.length, total });
    if (!hasMore || rows.length === 0) break;
    page += 1;
    if (page > 500) break;
  }

  return { rows: all, total };
}
