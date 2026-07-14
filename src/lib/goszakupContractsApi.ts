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

type ListRow = Omit<GoszakupContractRow, 'planSum' | 'finalSum'>;

type ListPageResult = {
  ok?: boolean;
  action?: string;
  page?: number;
  hasMore?: boolean;
  total?: number | null;
  rows?: ListRow[];
  error?: string;
};

type EnrichResult = {
  ok?: boolean;
  action?: string;
  rows?: GoszakupContractRow[];
  error?: string;
};

/** Совпадает с MAX_ENRICH на edge — больше → 546 WORKER_RESOURCE_LIMIT */
const ENRICH_CHUNK = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

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

function isTransientInvokeError(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes('546') ||
    m.includes('worker_resource_limit') ||
    m.includes('resource limit') ||
    m.includes('failed to send') ||
    m.includes('network') ||
    m.includes('fetch') ||
    m.includes('gateway') ||
    m.includes('timeout') ||
    m.includes('503') ||
    m.includes('502') ||
    m.includes('504')
  );
}

async function invokeJson<T extends { ok?: boolean; error?: string }>(
  body: Record<string, unknown>,
  attempts = 4,
): Promise<T> {
  let lastErr: Error | null = null;
  for (let a = 1; a <= attempts; a++) {
    try {
      const { data, error } = await getSupabase().functions.invoke<T>('goszakup-contracts-export', {
        body,
      });
      const payload = data as T | null;
      if (payload?.error) throw new Error(payload.error);
      if (payload && payload.ok === false) throw new Error(payload.error ?? 'Ошибка выгрузки');
      if (error) {
        const ctx = (error as { context?: Response }).context;
        const status = ctx?.status;
        const statusHint = status ? ` HTTP ${status}` : '';
        throw new Error(`${payload?.error || error.message || 'Ошибка edge function'}${statusHint}`);
      }
      if (!payload?.ok) throw new Error('Ошибка выгрузки договоров');
      return payload;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (a < attempts && isTransientInvokeError(lastErr.message)) {
        await sleep(600 * a);
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr ?? new Error('Ошибка edge function');
}

async function fetchListPage(supplierBin: string, page: number): Promise<ListPageResult> {
  return invokeJson<ListPageResult>({ action: 'list', supplierBin, page });
}

async function enrichChunk(items: ListRow[]): Promise<GoszakupContractRow[]> {
  const res = await invokeJson<EnrichResult>({ action: 'enrich', items });
  return res.rows ?? [];
}

export async function exportAllGoszakupContractsByBin(
  supplierBin: string,
  options: {
    signal?: AbortSignal;
    onProgress?: (p: {
      page: number;
      loaded: number;
      total: number | null;
      phase: 'list' | 'enrich';
    }) => void;
  } = {},
): Promise<{ rows: GoszakupContractRow[]; total: number | null }> {
  const bin = supplierBin.replace(/\D/g, '');
  if (bin.length !== 12) throw new Error('БИН должен состоять из 12 цифр');

  const listed: ListRow[] = [];
  let page = 1;
  let total: number | null = null;
  let hasMore = true;

  while (hasMore) {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const res = await fetchListPage(bin, page);
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const rows = res.rows ?? [];
    listed.push(...rows);
    total = res.total ?? total;
    hasMore = Boolean(res.hasMore);
    options.onProgress?.({ page, loaded: listed.length, total, phase: 'list' });
    if (!hasMore || rows.length === 0) break;
    page += 1;
    if (page > 500) break;
  }

  const enriched: GoszakupContractRow[] = [];
  for (let i = 0; i < listed.length; i += ENRICH_CHUNK) {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const chunk = listed.slice(i, i + ENRICH_CHUNK);
    let part: GoszakupContractRow[];
    try {
      part = await enrichChunk(chunk);
    } catch (e) {
      // Последний шанс: по одной карточке (меньше шанс 546)
      if (chunk.length === 1) throw e;
      part = [];
      for (const item of chunk) {
        if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        part.push(...(await enrichChunk([item])));
        await sleep(120);
      }
    }
    enriched.push(...part);
    options.onProgress?.({
      page,
      loaded: enriched.length,
      total: total ?? listed.length,
      phase: 'enrich',
    });
    if (i + ENRICH_CHUNK < listed.length) await sleep(80);
  }

  return { rows: enriched, total };
}
