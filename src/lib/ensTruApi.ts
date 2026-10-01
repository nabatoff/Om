import { getSupabase } from './supabase';

const CODE_RE = /\d{6}\.\d{3}\.\d{6}/g;

export type EnsTruCheckResult = {
  inputCode: string;
  found: boolean;
  names: string[];
};

export type ParsedEnsTruInput = {
  codes: string[];
  invalid: string[];
};

/** Разбор ввода: столбец из Excel, строки, точка с запятой. */
export function parseEnsTruInput(raw: string): ParsedEnsTruInput {
  const codes: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  const parts = raw
    .split(/[\n\r,;\t]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const part of parts) {
    const matches = part.match(CODE_RE);
    if (matches && matches.length > 0) {
      for (const m of matches) {
        if (!seen.has(m)) {
          seen.add(m);
          codes.push(m);
        }
      }
      continue;
    }
    const cleaned = part.replace(/;+\s*$/, '').trim();
    if (CODE_RE.test(cleaned)) {
      const m = cleaned.match(CODE_RE)?.[0];
      if (m && !seen.has(m)) {
        seen.add(m);
        codes.push(m);
      }
    } else if (cleaned) {
      invalid.push(cleaned);
    }
  }

  return { codes, invalid };
}

export type NationalExemptionCheckResult = {
  inputCode: string;
  found: boolean;
  entries: Array<{ name: string; characteristic: string; industry: string }>;
};

/** Проверка по справочнику "Нацизъятие" (отдельная база, см. docs/BUSINESS_LOGIC.md). */
export async function checkEnsTruNationalExemptionCodesApi(
  codes: string[],
): Promise<NationalExemptionCheckResult[]> {
  if (codes.length === 0) return [];
  const { data, error } = await getSupabase().rpc('check_ens_tru_national_exemption_codes', { p_codes: codes });
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    input_code: string;
    found: boolean;
    name: string | null;
    characteristic: string | null;
    industry: string | null;
  }>;

  const byCode = new Map<string, Array<{ name: string; characteristic: string; industry: string }>>();
  for (const r of rows) {
    if (!r.found || !r.name) continue;
    const list = byCode.get(r.input_code) ?? [];
    list.push({ name: r.name, characteristic: r.characteristic ?? '', industry: r.industry ?? '' });
    byCode.set(r.input_code, list);
  }

  return codes.map((code) => {
    const entries = byCode.get(code);
    if (entries && entries.length > 0) {
      return { inputCode: code, found: true, entries };
    }
    return { inputCode: code, found: false, entries: [] };
  });
}

export async function checkEnsTruCodesApi(codes: string[]): Promise<EnsTruCheckResult[]> {
  if (codes.length === 0) return [];
  const { data, error } = await getSupabase().rpc('check_ens_tru_codes', { p_codes: codes });
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    input_code: string;
    found: boolean;
    name: string | null;
  }>;

  const byCode = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.found || !r.name) continue;
    const list = byCode.get(r.input_code) ?? [];
    if (!list.includes(r.name)) list.push(r.name);
    byCode.set(r.input_code, list);
  }

  const foundCodes = new Set(byCode.keys());
  const missingFromRpc = rows
    .filter((r) => !r.found && !foundCodes.has(r.input_code))
    .map((r) => r.input_code);

  return codes.map((code) => {
    const names = byCode.get(code);
    if (names && names.length > 0) {
      return { inputCode: code, found: true, names };
    }
    if (missingFromRpc.includes(code)) {
      return { inputCode: code, found: false, names: [] };
    }
    return { inputCode: code, found: false, names: [] };
  });
}
