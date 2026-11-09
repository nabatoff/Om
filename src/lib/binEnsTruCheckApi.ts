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
  codesSource?: BinCodesSource;
  share?: BinShareTotals;
  seasonality?: BinSeasonality;
  codes: BinEnsTruCodeResult[];
  message?: string;
};

/**
 * «Проверка по БИН»: коды ЕНС ТРУ поставщика (из реестров e-ondiris.gov.kz) +
 * количество/сумма договоров по каждому коду за год на zakup.gov.kz (см. docs/BUSINESS_LOGIC.md).
 */
export async function checkBinEnsTruContractsApi(bin: string): Promise<BinEnsTruCheckResponse> {
  const { data, error } = await getSupabase().functions.invoke<BinEnsTruCheckResponse & { error?: string }>(
    'bin-ens-tru-check',
    { body: { bin: bin.trim() } },
  );
  if (data?.error) throw new Error(data.error);
  if (error) {
    let message = (data as { error?: string } | null)?.error;
    if (!message) {
      // supabase-js не кладёт тело non-2xx ответа в data — достаём его из error.context.
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        message = ((await ctx.json().catch(() => null)) as { error?: string } | null)?.error;
      }
    }
    message = message || error.message;
    throw new Error(message || 'Не удалось выполнить проверку по БИН');
  }
  if (!data?.ok) throw new Error('Не удалось выполнить проверку по БИН');
  return data;
}
