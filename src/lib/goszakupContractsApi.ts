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

/** Батч на edge (MAX_ENRICH=3) × параллельные invoke; пустые суммы — добор */
const ENRICH_CHUNK = 3;
const ENRICH_CONCURRENCY = 2;

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

export async function exportGoszakupContractsToExcel(
  rows: GoszakupContractRow[],
  supplierBin: string,
): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Om CRM';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Договоры', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = [
    { header: '#', key: 'id', width: 12 },
    { header: 'Номер договора', key: 'contractNumber', width: 24 },
    { header: 'Номер закупки', key: 'buyNumber', width: 16 },
    { header: 'Тип договора', key: 'contractType', width: 18 },
    { header: 'Статус договора', key: 'status', width: 22 },
    { header: 'Дата создания', key: 'createdAt', width: 20 },
    { header: 'Общая плановая сумма договора', key: 'planSum', width: 18 },
    { header: 'Общая итоговая сумма договора', key: 'finalSum', width: 18 },
    { header: 'Заказчик', key: 'customer', width: 36 },
    { header: 'Поставщик', key: 'supplier', width: 28 },
    { header: 'Способ закупки', key: 'tradeMethod', width: 28 },
  ];

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { vertical: 'middle', wrapText: true };

  for (const r of rows) {
    sheet.addRow({
      id: r.id,
      contractNumber: r.contractNumber,
      buyNumber: r.buyNumber,
      contractType: r.contractType,
      status: r.status,
      createdAt: r.createdAt,
      planSum: r.planSum == null || !Number.isFinite(r.planSum) ? null : r.planSum,
      finalSum: r.finalSum == null || !Number.isFinite(r.finalSum) ? null : r.finalSum,
      customer: r.customer,
      supplier: r.supplier,
      tradeMethod: r.tradeMethod,
    });
  }

  sheet.getColumn('planSum').numFmt = '#,##0.00';
  sheet.getColumn('finalSum').numFmt = '#,##0.00';

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `goszakup-contracts-${supplierBin}-${new Date().toISOString().slice(0, 10)}.xlsx`;
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

  // Добор карточек, где суммы не вытащились (таймаут/рейтлимит goszakup)
  const missingIdx = enriched
    .map((r, i) => (r.planSum == null && r.finalSum == null ? i : -1))
    .filter((i) => i >= 0);
  if (missingIdx.length > 0) {
    options.onProgress?.({
      page,
      loaded: enriched.length - missingIdx.length,
      total: total ?? listed.length,
      phase: 'enrich',
    });
    await mapPool(
      missingIdx,
      2,
      async (idx) => {
        if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        const row = enriched[idx]!;
        const { planSum: _p, finalSum: _f, ...base } = row;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const [fixed] = await enrichChunk([base]);
            if (fixed && (fixed.planSum != null || fixed.finalSum != null)) {
              enriched[idx] = fixed;
              break;
            }
          } catch {
            /* retry */
          }
          await sleep(500 * attempt);
        }
        options.onProgress?.({
          page,
          loaded: enriched.filter((r) => r.planSum != null || r.finalSum != null).length,
          total: total ?? listed.length,
          phase: 'enrich',
        });
        return null;
      },
      undefined,
      options.signal,
    );
  }

  options.onProgress?.({
    page,
    loaded: enriched.length,
    total: total ?? listed.length,
    phase: 'enrich',
  });

  return { rows: enriched, total };
}
