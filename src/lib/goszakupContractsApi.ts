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

/** Батч на edge (MAX_ENRICH=4) × параллельные invoke */
const ENRICH_CHUNK = 4;
const ENRICH_CONCURRENCY = 4;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
  onItemDone?: () => void,
  signal?: AbortSignal,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
      onItemDone?.();
    }
  });
  await Promise.all(workers);
  return out;
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
    m.includes('fetch failed') ||
    m.includes('gateway') ||
    m.includes('timeout') ||
    m.includes('abort') ||
    m.includes('goszakup list fetch failed') ||
    m.includes('503') ||
    m.includes('502') ||
    m.includes('504') ||
    m.includes('500')
  );
}

async function readInvokeErrorBody(error: { message?: string; context?: Response }): Promise<string> {
  const ctx = error.context;
  if (ctx) {
    try {
      const j = (await ctx.clone().json()) as { error?: string; message?: string; code?: string };
      if (j?.error) return String(j.error);
      if (j?.message) return `${j.code ? `${j.code}: ` : ''}${j.message}`;
    } catch {
      /* ignore */
    }
    if (ctx.status) return `${error.message || 'Ошибка edge function'} HTTP ${ctx.status}`;
  }
  return error.message || 'Ошибка edge function';
}

async function invokeJson<T extends { ok?: boolean; error?: string }>(
  body: Record<string, unknown>,
  attempts = 3,
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
        throw new Error(await readInvokeErrorBody(error as { message?: string; context?: Response }));
      }
      if (!payload?.ok) throw new Error('Ошибка выгрузки договоров');
      return payload;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (a < attempts && isTransientInvokeError(lastErr.message)) {
        await sleep(400 * a);
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

  const chunks: ListRow[][] = [];
  for (let i = 0; i < listed.length; i += ENRICH_CHUNK) {
    chunks.push(listed.slice(i, i + ENRICH_CHUNK));
  }

  let enrichedCount = 0;
  const bump = (n: number) => {
    enrichedCount += n;
    options.onProgress?.({
      page,
      loaded: Math.min(enrichedCount, listed.length),
      total: total ?? listed.length,
      phase: 'enrich',
    });
  };

  const chunkResults = await mapPool(
    chunks,
    ENRICH_CONCURRENCY,
    async (chunk) => {
      try {
        const rows = await enrichChunk(chunk);
        bump(rows.length);
        return rows;
      } catch {
        const singles: GoszakupContractRow[] = [];
        for (const item of chunk) {
          if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
          try {
            const rows = await enrichChunk([item]);
            singles.push(...rows);
            bump(rows.length);
          } catch {
            singles.push({ ...item, planSum: null, finalSum: null });
            bump(1);
          }
        }
        return singles;
      }
    },
    undefined,
    options.signal,
  );

  const enriched = chunkResults.flat();
  options.onProgress?.({
    page,
    loaded: enriched.length,
    total: total ?? listed.length,
    phase: 'enrich',
  });

  return { rows: enriched, total };
}
