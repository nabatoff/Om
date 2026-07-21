import { getSupabase } from './supabase';
import {
  isEmptyDetailShell,
  parseDetailSums,
  parseListRange,
  parseListRows,
  type GoszakupListRow,
} from './goszakupParse';

export type GoszakupContractRow = GoszakupListRow & {
  planSum: number | null;
  finalSum: number | null;
};

type ListRow = GoszakupListRow;
type EnrichStatus = 'ok' | 'empty' | 'timeout' | 'error';
type Enriched = GoszakupContractRow & { _status?: EnrichStatus };

/**
 * Dev (Vite proxy, KZ IP): можно параллелить.
 * Prod (Supabase EU→goszakup): только 1 — иначе abort/504.
 * Vercel proxy на goszakup НЕ используем: стабильные 502/504.
 */
const USE_LOCAL_PROXY = import.meta.env.DEV;
const ENRICH_CONCURRENCY = USE_LOCAL_PROXY ? 4 : 1;
const REFILL_PASSES = USE_LOCAL_PROXY ? 2 : 3;
const LOCAL_CARD_TIMEOUT_MS = 20_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
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

/* ——— local Vite proxy (только DEV) ——— */

async function fetchLocalGoszakupHtml(pathAndQuery: string, signal?: AbortSignal): Promise<string> {
  const ac = new AbortController();
  const onAbort = () => ac.abort();
  signal?.addEventListener('abort', onAbort);
  const timer = setTimeout(() => ac.abort(), LOCAL_CARD_TIMEOUT_MS);
  try {
    const res = await fetch(`/goszakup-origin${pathAndQuery}`, {
      signal: ac.signal,
      headers: { Accept: 'text/html' },
    });
    if (!res.ok) throw new Error(`goszakup HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

function buildListPath(bin: string, page: number): string {
  const params = new URLSearchParams();
  params.set('filter[supplier]', bin);
  if (page > 1) params.set('page', String(page));
  return `/ru/registry/contract?${params.toString()}`;
}

async function fetchListPageLocal(
  bin: string,
  page: number,
  signal?: AbortSignal,
): Promise<{ rows: ListRow[]; hasMore: boolean; total: number | null }> {
  const html = await fetchLocalGoszakupHtml(buildListPath(bin, page), signal);
  const rows = parseListRows(html);
  const range = parseListRange(html);
  if (rows.length === 0 && page === 1) {
    const hasTable = /id=["']search-result["']/i.test(html);
    throw new Error(`Пустой список (table=${hasTable}, html=${html.length}). Сайт мог отдать капчу/блок.`);
  }
  return {
    rows,
    hasMore: range ? range.to < range.total : rows.length >= 50,
    total: range?.total ?? null,
  };
}

async function enrichOneLocal(row: ListRow, signal?: AbortSignal): Promise<Enriched> {
  try {
    const html = await fetchLocalGoszakupHtml(`/ru/egzcontract/cpublic/show/${row.id}`, signal);
    if (isEmptyDetailShell(html)) {
      return { ...row, planSum: null, finalSum: null, _status: 'empty' };
    }
    const sums = parseDetailSums(html);
    if (sums.planSum != null || sums.finalSum != null) {
      return { ...row, ...sums, _status: 'ok' };
    }
    return { ...row, planSum: null, finalSum: null, _status: 'empty' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const aborted =
      (e instanceof DOMException && e.name === 'AbortError') || /abort|timeout/i.test(msg);
    return {
      ...row,
      planSum: null,
      finalSum: null,
      _status: aborted ? 'timeout' : 'error',
    };
  }
}

/* ——— prod: Supabase edge ——— */

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

async function fetchListPageEdge(
  bin: string,
  page: number,
): Promise<{ rows: ListRow[]; hasMore: boolean; total: number | null }> {
  const res = await invokeJson<{
    ok?: boolean;
    error?: string;
    rows?: ListRow[];
    hasMore?: boolean;
    total?: number | null;
  }>({ action: 'list', supplierBin: bin, page });
  return {
    rows: res.rows ?? [],
    hasMore: Boolean(res.hasMore),
    total: res.total ?? null,
  };
}

async function enrichOneEdge(row: ListRow): Promise<Enriched> {
  try {
    const res = await invokeJson<{
      ok?: boolean;
      error?: string;
      rows?: (GoszakupContractRow & { enrichStatus?: EnrichStatus })[];
    }>({ action: 'enrich', items: [row] });
    const fixed = res.rows?.[0];
    if (!fixed) {
      return { ...row, planSum: null, finalSum: null, _status: 'error' };
    }
    const status: EnrichStatus =
      fixed.enrichStatus ??
      (fixed.planSum != null || fixed.finalSum != null ? 'ok' : 'timeout');
    return {
      ...fixed,
      planSum: fixed.planSum,
      finalSum: fixed.finalSum,
      _status: status,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const aborted = /abort|timeout|504|502|503/i.test(msg);
    return {
      ...row,
      planSum: null,
      finalSum: null,
      _status: aborted ? 'timeout' : 'error',
    };
  }
}

function stripStatus(row: Enriched): GoszakupContractRow {
  const { _status: _, ...rest } = row;
  return rest;
}

function toListRow(row: Enriched): ListRow {
  return {
    id: row.id,
    contractNumber: row.contractNumber,
    buyNumber: row.buyNumber,
    contractType: row.contractType,
    status: row.status,
    createdAt: row.createdAt,
    customer: row.customer,
    supplier: row.supplier,
    tradeMethod: row.tradeMethod,
  };
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
): Promise<{ rows: GoszakupContractRow[]; total: number | null; missingSums: number }> {
  const bin = supplierBin.replace(/\D/g, '');
  if (bin.length !== 12) throw new Error('БИН должен состоять из 12 цифр');

  const listed: ListRow[] = [];
  let page = 1;
  let total: number | null = null;
  let hasMore = true;

  while (hasMore) {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const pageRes = USE_LOCAL_PROXY
      ? await fetchListPageLocal(bin, page, options.signal)
      : await fetchListPageEdge(bin, page);
    listed.push(...pageRes.rows);
    total = pageRes.total ?? total;
    hasMore = pageRes.hasMore;
    options.onProgress?.({ page, loaded: listed.length, total, phase: 'list' });
    if (!hasMore || pageRes.rows.length === 0) break;
    page += 1;
    if (page > 500) break;
  }

  const enrichOne = USE_LOCAL_PROXY ? enrichOneLocal : enrichOneEdge;
  let enrichedCount = 0;

  const enriched = await mapPool(
    listed,
    ENRICH_CONCURRENCY,
    async (row) => {
      const out = await enrichOne(row, options.signal);
      enrichedCount += 1;
      options.onProgress?.({
        page,
        loaded: enrichedCount,
        total: total ?? listed.length,
        phase: 'enrich',
      });
      return out;
    },
    options.signal,
  );

  for (let pass = 0; pass < REFILL_PASSES; pass++) {
    const missingIdx = enriched
      .map((r, i) =>
        r.planSum == null && r.finalSum == null && r._status !== 'empty' ? i : -1,
      )
      .filter((i) => i >= 0);
    if (missingIdx.length === 0) break;

    await mapPool(
      missingIdx,
      1,
      async (idx) => {
        if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        const fixed = await enrichOne(toListRow(enriched[idx]!), options.signal);
        if (fixed.planSum != null || fixed.finalSum != null || fixed._status === 'empty') {
          enriched[idx] = fixed;
        } else {
          enriched[idx] = { ...enriched[idx]!, _status: fixed._status ?? 'timeout' };
        }
        options.onProgress?.({
          page,
          loaded: enriched.filter((r) => r.planSum != null || r.finalSum != null).length,
          total: total ?? listed.length,
          phase: 'enrich',
        });
        await sleep(300 + pass * 150);
        return null;
      },
      options.signal,
    );
  }

  const rows = enriched.map(stripStatus);
  const missingSums = rows.filter((r) => r.planSum == null && r.finalSum == null).length;

  options.onProgress?.({
    page,
    loaded: rows.length,
    total: total ?? listed.length,
    phase: 'enrich',
  });

  return { rows, total, missingSums };
}
