import { getSupabase } from './supabase';

export type BinEnsTruCodeResult = {
  code: string;
  names: string[];
  canonicalName: string | null;
  contractCount: number;
  contractSum: number | null;
  sumCapped: boolean;
  /** Договоры самого поставщика по коду (за год, в рамках лимита суммы). */
  supplierCount?: number;
  supplierSum?: number;
  /** Место поставщика среди поставщиков кода по сумме (1 — первый) и число поставщиков кода. */
  supplierRank?: number | null;
  suppliersTotal?: number;
  error?: string;
};

/** Собственные договоры поставщика (он — сторона-поставщик) за год. */
export type BinSupplierStats = {
  name: string;
  count: number;
  sum: number | null;
  avgCheck: number | null;
  underCount: number;
  underSum: number | null;
  capped: boolean;
};

/** Разбивка договоров по способу закупки (по кодам, у которых суммы считались). */
export type BinPurchaseMethodStat = { name: string; count: number; sum: number };

/** Откуда взяты коды: реестры товаропроизводителей (КТП), договоры поставщика или ничего не нашлось. */
export type BinCodesSource = 'ktp' | 'contracts' | 'none';

/** Суммы для долей поставщика на рынке (только коды, где суммы посчитаны). */
export type BinShareTotals = {
  /** Рынок по всем кодам поставщика. */
  marketSum: number;
  /** Сумма самого поставщика по этим кодам. */
  supplierSum: number;
  /** Рынок только по кодам, где у поставщика есть договоры. */
  nicheMarketSum: number;
  nicheCodes: number;
};

/** Рынок по месяцам года (индекс 0..11) без договоров самого поставщика. */
export type BinSeasonality = { months: Array<{ count: number; sum: number }>; count: number; sum: number };

/** Статистика закупок для презентации: основные договоры (без допсоглашений) с датой заключения в году. */
export type BinPurchaseStats = {
  year: number;
  /** Дата выгрузки, YYYY-MM-DD. */
  asOf: string;
  methods: BinPurchaseMethodStat[];
  /** Топ-5 заказчиков Электронного магазина по сумме (только по кодам поставщика). */
  emCustomers: BinPurchaseMethodStat[];
  emCustomersTotal: number;
};

export type BinEnsTruCheckResponse = {
  ok: true;
  bin: string;
  year: number;
  sumCap: number;
  maxContractPrice: number;
  supplier: BinSupplierStats | null;
  /** Название компании: zakup.gov.kz, иначе реестры e-ondiris. */
  companyName?: string;
  methods?: BinPurchaseMethodStat[];
  purchaseStats?: BinPurchaseStats;
  codesSource?: BinCodesSource;
  share?: BinShareTotals;
  seasonality?: BinSeasonality;
  codes: BinEnsTruCodeResult[];
  message?: string;
};

/** Сообщение для пользователя вместо общего «Edge Function returned a non-2xx status code». */
const TOO_HEAVY_MSG =
  'Слишком много данных по этому поставщику — сервер не успел всё посчитать. Попробуйте ещё раз; если повторяется, сообщите разработчику.';

class CpuLimitError extends Error {}

/** Один вызов функции; достаёт из ответа текст ошибки, а лимит CPU (546) превращает в CpuLimitError. */
async function invokeBinFn<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabase().functions.invoke<T & { error?: string }>('bin-ens-tru-check', { body });
  if ((data as { error?: string } | null)?.error) throw new Error((data as { error: string }).error);
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const status = ctx && typeof ctx.status === 'number' ? ctx.status : 0;
    let message: string | undefined;
    if (ctx && typeof ctx.json === 'function') {
      message = ((await ctx.json().catch(() => null)) as { error?: string; message?: string } | null)?.error;
    }
    if (!message && (status === 546 || status === 504 || status === 502 || status === 500)) throw new CpuLimitError(TOO_HEAVY_MSG);
    throw new Error(message || (status ? `${TOO_HEAVY_MSG} (код ${status})` : error.message) || 'Не удалось выполнить проверку по БИН');
  }
  if (!data) throw new Error('Не удалось выполнить проверку по БИН');
  return data as T;
}

type PlanResponse = {
  ok: true;
  plan?: true;
  bin: string;
  year: number;
  sumCap: number;
  maxContractPrice: number;
  supplier: BinSupplierStats | null;
  companyName?: string;
  supplierOrgId: number | null;
  codesSource: BinCodesSource;
  codeList: Array<{ code: string; names: string[] }>;
};

type ChunkResponse = {
  ok: true;
  codes: BinEnsTruCodeResult[];
  methods: BinPurchaseMethodStat[];
  months: Array<{ count: number; sum: number }>;
  /** Договоры для статистики закупок: [id, способ, сумма, заказчик ЭМ или null]. */
  purchaseRows: Array<[number, string, number, string | null]>;
  /** Коды, до которых сервер не дошёл в рамках своего бюджета времени. */
  remaining: string[];
};

/** Сколько кодов считаем за один вызов функции (при ошибке лимита — делим пополам). */
const CHUNK_SIZE = 12;
/** Сколько порций считаем параллельно. */
const CHUNK_PARALLEL = 3;

function addTo(map: Map<string, { count: number; sum: number }>, rows: BinPurchaseMethodStat[]) {
  for (const r of rows) {
    const cur = map.get(r.name) ?? { count: 0, sum: 0 };
    cur.count += r.count;
    cur.sum += r.sum;
    map.set(r.name, cur);
  }
}

/**
 * «Проверка по БИН»: коды ЕНС ТРУ поставщика (из реестров e-ondiris.gov.kz) +
 * количество/сумма договоров по каждому коду за год на zakup.gov.kz (см. docs/BUSINESS_LOGIC.md).
 *
 * Считаем порциями: сначала «план» (поставщик и список кодов), затем коды по несколько штук за вызов —
 * иначе на тяжёлых поставщиках функция упирается в лимит CPU Supabase (ошибка 546).
 */
export async function checkBinEnsTruContractsApi(
  bin: string,
  year?: number,
  /** Тот же набор кодов, что у базового года (если коды взяты не из КТП, а из договоров). */
  codes?: string[],
): Promise<BinEnsTruCheckResponse> {
  const base = { bin: bin.trim(), ...(year ? { year } : {}) };
  const plan = await invokeBinFn<PlanResponse | BinEnsTruCheckResponse>({
    ...base,
    mode: 'plan',
    ...(codes && codes.length > 0 ? { codes } : {}),
  });
  // Кодов нет («Нет данных для анализа рынка») или старая версия функции вернула готовый ответ.
  if (!('plan' in plan) || !plan.plan) return plan as BinEnsTruCheckResponse;

  const methodTotals = new Map<string, { count: number; sum: number }>();
  const purchaseMethods = new Map<string, { count: number; sum: number }>();
  const emCustomers = new Map<string, { count: number; sum: number }>();
  const months = Array.from({ length: 12 }, () => ({ count: 0, sum: 0 }));
  const seenIds = new Set<number>();
  const results = new Map<string, BinEnsTruCodeResult>();
  const names = new Map(plan.codeList.map((c) => [c.code, c.names]));

  const queue: string[][] = [];
  let inFlight = 0;
  const runChunk = async (chunk: string[]): Promise<void> => {
    try {
      const r = await invokeBinFn<ChunkResponse>({
        ...base,
        mode: 'chunk',
        codes: chunk,
        supplierOrgId: plan.supplierOrgId,
      });
      addTo(methodTotals, r.methods);
      r.months.forEach((m, i) => {
        months[i].count += m.count;
        months[i].sum += m.sum;
      });
      // Договор с несколькими кодами может прийти из разных порций — считаем его один раз.
      for (const [id, method, value, customer] of r.purchaseRows) {
        if (seenIds.has(id)) continue;
        seenIds.add(id);
        addTo(purchaseMethods, [{ name: method, count: 1, sum: value }]);
        if (customer != null) addTo(emCustomers, [{ name: customer, count: 1, sum: value }]);
      }
      for (const c of r.codes) results.set(c.code, { ...c, names: names.get(c.code) ?? c.names });
      if (r.remaining.length > 0) queue.push(r.remaining);
    } catch (e) {
      if (e instanceof CpuLimitError && chunk.length > 1) {
        const mid = Math.ceil(chunk.length / 2);
        queue.push(chunk.slice(0, mid), chunk.slice(mid));
        return;
      }
      if (e instanceof CpuLimitError) {
        // Один код не помещается в лимит — помечаем его ошибкой, остальные считаем дальше.
        results.set(chunk[0], {
          code: chunk[0],
          names: names.get(chunk[0]) ?? [],
          canonicalName: null,
          contractCount: 0,
          contractSum: null,
          sumCapped: false,
          error: 'Слишком много данных по коду',
        });
        return;
      }
      throw e;
    }
  };

  const all = plan.codeList.map((c) => c.code);
  for (let i = 0; i < all.length; i += CHUNK_SIZE) queue.push(all.slice(i, i + CHUNK_SIZE));
  let failure: unknown = null;
  await Promise.all(
    Array.from({ length: CHUNK_PARALLEL }, async () => {
      while (!failure) {
        const next = queue.shift();
        if (!next) {
          // Другой воркер ещё может вернуть остаток в очередь — коротко ждём, пока все не закончат.
          if (inFlight === 0) return;
          await new Promise((r) => setTimeout(r, 50));
          continue;
        }
        inFlight += 1;
        try {
          await runChunk(next);
        } catch (e) {
          failure = e;
        } finally {
          inFlight -= 1;
        }
      }
    }),
  );
  if (failure) throw failure;

  const list = all.map((c) => results.get(c)).filter((c): c is BinEnsTruCodeResult => !!c);
  if (list.length > 0 && list.every((r) => r.error)) {
    throw new Error(`Сайт zakup.gov.kz сейчас недоступен (${list[0].error ?? 'ошибка или таймаут'}). Попробуйте позже.`);
  }
  list.sort((a, b) => (b.contractCount || 0) - (a.contractCount || 0));

  let marketSum = 0;
  let supplierSum = 0;
  let nicheMarketSum = 0;
  let nicheCodes = 0;
  for (const r of list) {
    if (r.error || r.sumCapped || r.contractSum == null) continue;
    marketSum += r.contractSum;
    if ((r.supplierCount ?? 0) > 0) {
      supplierSum += r.supplierSum ?? 0;
      nicheMarketSum += r.contractSum;
      nicheCodes += 1;
    }
  }
  const toList = (m: Map<string, { count: number; sum: number }>) =>
    Array.from(m, ([name, v]) => ({ name, count: v.count, sum: v.sum })).sort((a, b) => b.sum - a.sum);

  return {
    ok: true,
    bin: plan.bin,
    year: plan.year,
    sumCap: plan.sumCap,
    maxContractPrice: plan.maxContractPrice,
    supplier: plan.supplier,
    companyName: plan.companyName,
    codesSource: plan.codesSource,
    methods: toList(methodTotals),
    purchaseStats: {
      year: plan.year,
      // Дата выгрузки по Астане/Алматы (UTC+5), как на сервере.
      asOf: new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10),
      methods: toList(purchaseMethods),
      emCustomers: toList(emCustomers).slice(0, 5),
      emCustomersTotal: emCustomers.size,
    },
    share: { marketSum, supplierSum, nicheMarketSum, nicheCodes },
    seasonality: {
      months,
      count: months.reduce((a, m) => a + m.count, 0),
      sum: months.reduce((a, m) => a + m.sum, 0),
    },
    codes: list,
  };
}
