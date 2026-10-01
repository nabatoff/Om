import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/**
 * «Проверка по БИН»: по БИН поставщика находит все его коды ЕНС ТРУ в реестрах
 * товаропроизводителей e-ondiris.gov.kz, затем по каждому коду узнаёт в публичном
 * API zakup.gov.kz количество и сумму договоров за 2025 год по всей стране
 * (не только договоров этого поставщика — рыночный срез по товарной группе).
 *
 * Оба внешних сайта не отдают Access-Control-Allow-Origin, поэтому вызываются
 * только отсюда (сервер), а не напрямую из браузера.
 */

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ONDIRIS_BASE = "https://e-ondiris.gov.kz";
const ZAKUP_BASE = "https://zakup.gov.kz";
const TARGET_YEAR = 2025;
/** Учитываем только договоры дешевле этого порога (₸) — верхняя граница суммы договора. */
const MAX_CONTRACT_PRICE = 17_300_000;
/** Если за код в целевом году больше стольких договоров (после фильтра по сумме) — не считаем сумму, только количество. */
const SUM_CAP = 500;
const FETCH_TIMEOUT_MS = 12000;
const CODE_RE = /\d{6}\.\d{3}\.\d{6}/g;

type CodeEntry = { code: string; names: Set<string> };

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status} at ${url}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function extractCodes(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw) return [];
  return raw.match(CODE_RE) ?? [];
}

function addCode(map: Map<string, CodeEntry>, code: string, name: string) {
  const entry = map.get(code);
  if (entry) {
    if (name) entry.names.add(name);
  } else {
    map.set(code, { code, names: new Set(name ? [name] : []) });
  }
}

/** Реестр 1: "Казахстанские товаропроизводители" — плоские строки, один товар на строку. */
async function collectFromRegistryFront(bin: string, codes: Map<string, CodeEntry>): Promise<void> {
  const limit = 100;
  let page = 1;
  for (let guard = 0; guard < 20; guard++) {
    const url = `${ONDIRIS_BASE}/awp-api/registry-front?page=${page}&limit=${limit}&bin_iin=${encodeURIComponent(bin)}`;
    const data = await fetchJson<{
      success: boolean;
      data: Array<{ bin_iin: string; product_name?: string; enstru_code?: string }>;
      meta: { hasNextPage: boolean };
    }>(url);
    for (const row of data.data ?? []) {
      if (row.bin_iin !== bin) continue;
      for (const code of extractCodes(row.enstru_code)) {
        addCode(codes, code, row.product_name ?? "");
      }
    }
    if (!data.meta?.hasNextPage) break;
    page += 1;
  }
}

/** Реестр 2: "Полностью произведено в РК" — компании с вложенным списком товаров. */
async function collectFromFullKzRegistry(bin: string, codes: Map<string, CodeEntry>): Promise<void> {
  const limit = 50;
  let page = 1;
  for (let guard = 0; guard < 20; guard++) {
    const url = `${ONDIRIS_BASE}/awp-api/ktp-registry-manufacturers?page=${page}&limit=${limit}&search=${encodeURIComponent(bin)}&registryType=full_kz`;
    const data = await fetchJson<{
      success: boolean;
      data: Array<{
        bin: string;
        products?: Array<{ name?: string; ens_tru?: string[] }>;
      }>;
      meta: { hasNextPage: boolean };
    }>(url);
    for (const company of data.data ?? []) {
      if (company.bin !== bin) continue;
      for (const product of company.products ?? []) {
        for (const raw of product.ens_tru ?? []) {
          for (const code of extractCodes(raw)) {
            addCode(codes, code, product.name ?? "");
          }
        }
      }
    }
    if (!data.meta?.hasNextPage) break;
    page += 1;
  }
}

async function resolveYearId(year: number): Promise<number | null> {
  const years = await fetchJson<Array<{ id: number; year: number }>>(`${ZAKUP_BASE}/api/core/api/dicts/years/`);
  return years.find((y) => y.year === year)?.id ?? null;
}

async function countAndSumContracts(
  code: string,
  yearId: number,
): Promise<{ count: number; sum: number | null; capped: boolean; sampleContractId: number | null }> {
  type ContractsPage = {
    count: number;
    results: Array<{ id: number; contract_price_with_vat?: number | string | null }>;
  };

  const priceFilter = `&contract_price_with_vat__lte=${MAX_CONTRACT_PRICE}`;
  const firstUrl = `${ZAKUP_BASE}/api/core/api/public/contracts/?limit=1&offset=0&enstru_code=${encodeURIComponent(code)}&year_id=${yearId}${priceFilter}`;
  const first = await fetchJson<ContractsPage>(firstUrl);
  const count = first.count ?? 0;
  const sampleContractId = first.results?.[0]?.id ?? null;
  if (count === 0) return { count: 0, sum: 0, capped: false, sampleContractId: null };
  if (count > SUM_CAP) return { count, sum: null, capped: true, sampleContractId };

  const pageSize = 100;
  let sum = 0;
  let offset = 0;
  while (offset < count) {
    const url = `${ZAKUP_BASE}/api/core/api/public/contracts/?limit=${pageSize}&offset=${offset}&enstru_code=${encodeURIComponent(code)}&year_id=${yearId}${priceFilter}`;
    const page = await fetchJson<ContractsPage>(url);
    for (const row of page.results ?? []) {
      const v = row.contract_price_with_vat;
      if (v != null) sum += Number(v) || 0;
    }
    offset += pageSize;
  }
  return { count, sum, capped: false, sampleContractId };
}

/**
 * Официальное название кода ЕНС ТРУ берётся не из списка договоров (там его нет), а из
 * позиций ("предметов") одного конкретного договора, где этот код встречается —
 * название в справочнике одно и то же для всех договоров, доставать его из каждого смысла нет.
 */
async function fetchCanonicalCodeName(code: string, contractId: number): Promise<string | null> {
  type Subject = { plan_item?: { enstru?: { code?: string; name_ru?: string; short_description_ru?: string } } };
  const subjects = await fetchJson<Subject[]>(`${ZAKUP_BASE}/api/core/api/public/contracts/${contractId}/subjects/`);
  const match = subjects.find((s) => s.plan_item?.enstru?.code === code);
  const enstru = match?.plan_item?.enstru;
  if (!enstru?.name_ru) return null;
  return enstru.short_description_ru ? `${enstru.name_ru} — ${enstru.short_description_ru}` : enstru.name_ru;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!supabaseUrl || !anon) {
    return new Response(JSON.stringify({ error: "Server config" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(supabaseUrl, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { data: prof } = await userClient.from("profiles").select("role, is_active").eq("id", user.id).maybeSingle();
  if (!prof || prof.is_active === false || prof.role === "admin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let body: { bin?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const bin = (body.bin ?? "").trim();
  if (!/^\d{12}$/.test(bin)) {
    return new Response(JSON.stringify({ error: "БИН/ИИН должен состоять из 12 цифр" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const codeMap = new Map<string, CodeEntry>();
    await Promise.all([
      collectFromRegistryFront(bin, codeMap).catch((e) => {
        console.error("registry-front failed", e);
      }),
      collectFromFullKzRegistry(bin, codeMap).catch((e) => {
        console.error("full_kz registry failed", e);
      }),
    ]);

    if (codeMap.size === 0) {
      return new Response(
        JSON.stringify({ ok: true, bin, codes: [], message: "В реестрах товаропроизводителей по этому БИН ничего не найдено" }),
        { headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    const yearId = await resolveYearId(TARGET_YEAR);
    if (yearId == null) {
      return new Response(JSON.stringify({ error: `Не удалось определить код года ${TARGET_YEAR} на zakup.gov.kz` }), {
        status: 502,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const codes = Array.from(codeMap.values());
    const results: Array<{
      code: string;
      names: string[];
      canonicalName: string | null;
      contractCount: number;
      contractSum: number | null;
      sumCapped: boolean;
      error?: string;
    }> = [];

    // Последовательно, по одному коду — не перегружаем внешний сайт параллельными запросами.
    for (const entry of codes) {
      try {
        const { count, sum, capped, sampleContractId } = await countAndSumContracts(entry.code, yearId);
        let canonicalName: string | null = null;
        if (sampleContractId != null) {
          canonicalName = await fetchCanonicalCodeName(entry.code, sampleContractId).catch(() => null);
        }
        results.push({
          code: entry.code,
          names: Array.from(entry.names),
          canonicalName,
          contractCount: count,
          contractSum: sum,
          sumCapped: capped,
        });
      } catch (e) {
        results.push({
          code: entry.code,
          names: Array.from(entry.names),
          canonicalName: null,
          contractCount: 0,
          contractSum: null,
          sumCapped: false,
          error: e instanceof Error ? e.message : "Ошибка запроса к zakup.gov.kz",
        });
      }
    }

    results.sort((a, b) => (b.contractCount || 0) - (a.contractCount || 0));

    return new Response(
      JSON.stringify({
        ok: true,
        bin,
        year: TARGET_YEAR,
        sumCap: SUM_CAP,
        maxContractPrice: MAX_CONTRACT_PRICE,
        codes: results,
      }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Внутренняя ошибка" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
