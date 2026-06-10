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
