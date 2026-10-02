import { getSupabase } from './supabase';

export type BinEnsTruCodeResult = {
  code: string;
  names: string[];
  canonicalName: string | null;
  contractCount: number;
  contractSum: number | null;
  sumCapped: boolean;
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

export type BinEnsTruCheckResponse = {
  ok: true;
  bin: string;
  year: number;
  sumCap: number;
  maxContractPrice: number;
  supplier: BinSupplierStats | null;
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
    const message = (data as { error?: string } | null)?.error || error.message;
    throw new Error(message || 'Не удалось выполнить проверку по БИН');
  }
  if (!data?.ok) throw new Error('Не удалось выполнить проверку по БИН');
  return data;
}
