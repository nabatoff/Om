import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/**
 * «Проверка по БИН»: по БИН поставщика находит все его коды ЕНС ТРУ в реестрах
 * товаропроизводителей e-ondiris.gov.kz, затем по каждому коду узнаёт в публичном
 * API zakup.gov.kz количество и сумму договоров за 2025 год по всей стране
 * (не только договоров этого поставщика — рыночный срез по товарной группе).
 *
 * Если в реестрах товаропроизводителей (КТП) кодов нет, коды берутся из договоров самого поставщика за год.
 * Помимо суммы рынка считаются доля поставщика по каждому коду, его место среди поставщиков кода и
 * помесячная сезонность рынка (без договоров самого поставщика).
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
/** Годы, за которые можно запускать проверку. */
const ALLOWED_YEARS = [2025, 2026];
const DEFAULT_YEAR = 2025;
/** Учитываем только договоры дешевле этого порога (₸) — верхняя граница суммы договора. */
const MAX_CONTRACT_PRICE = 17_300_000;
/** Если за код в целевом году больше стольких договоров (после фильтра по сумме) — не считаем сумму, только количество. */
const SUM_CAP = 30000;
/** zakup.gov.kz не отдаёт записи глубже offset+limit > 10000 — большие коды режем по месяцам даты заключения. */
const API_DEPTH_LIMIT = 10000;
/** Для собственных договоров поставщика — до скольких договоров за год считаем суммы (по 100 на запрос). */
const SUPPLIER_SUM_CAP = 3000;
const FETCH_TIMEOUT_MS = 12000;
/** Сколько кодов ЕНС ТРУ обрабатываем одновременно. */
const CODE_CONCURRENCY = 10;
const CODE_RE = /\d{6}\.\d{3}\.\d{6}/g;

/** Параллельно, но не больше `limit` запросов одновременно — быстро, и без перегруза чужого сайта. */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

type CodeEntry = { code: string; names: Set<string> };

async function fetchJsonOnce<T>(url: string): Promise<T> {
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

/** Госсайты периодически отдают 503/таймауты — пробуем ещё раз, прежде чем сдаться. */
async function fetchJson<T>(url: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fetchJsonOnce<T>(url);
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }
  throw lastError;
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
async function collectFromRegistryFront(bin: string, codes: Map<string, CodeEntry>, nameBox: { name: string }): Promise<void> {
  const limit = 100;
  let page = 1;
  for (let guard = 0; guard < 20; guard++) {
    const url = `${ONDIRIS_BASE}/awp-api/registry-front?page=${page}&limit=${limit}&bin_iin=${encodeURIComponent(bin)}`;
    const data = await fetchJson<{
      success: boolean;
      data: Array<{ bin_iin: string; company_name?: string; product_name?: string; enstru_code?: string }>;
      meta: { hasNextPage: boolean };
    }>(url);
    for (const row of data.data ?? []) {
      if (row.bin_iin !== bin) continue;
      if (!nameBox.name && row.company_name?.trim()) nameBox.name = row.company_name.trim();
      for (const code of extractCodes(row.enstru_code)) {
        addCode(codes, code, row.product_name ?? "");
      }
    }
    if (!data.meta?.hasNextPage) break;
    page += 1;
  }
}

/** Реестр 2: "Полностью произведено в РК" — компании с вложенным списком товаров. */
async function collectFromFullKzRegistry(bin: string, codes: Map<string, CodeEntry>, nameBox: { name: string }): Promise<void> {
  const limit = 50;
  let page = 1;
  for (let guard = 0; guard < 20; guard++) {
    const url = `${ONDIRIS_BASE}/awp-api/ktp-registry-manufacturers?page=${page}&limit=${limit}&search=${encodeURIComponent(bin)}&registryType=full_kz`;
    const data = await fetchJson<{
      success: boolean;
      data: Array<{
        bin: string;
        companyName?: string;
        products?: Array<{ name?: string; ens_tru?: string[] }>;
      }>;
      meta: { hasNextPage: boolean };
    }>(url);
    for (const company of data.data ?? []) {
      if (company.bin !== bin) continue;
      if (!nameBox.name && company.companyName?.trim()) nameBox.name = company.companyName.trim();
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

type SupplierInfo = {
  stats: SupplierStats;
  orgId: number;
  /** Уникальные коды ЕНС ТРУ из договоров поставщика за год (пусто, если договоров слишком много). */
  contractCodes: string[];
};

type SupplierStats = {
  name: string;
  count: number;
  sum: number | null;
  avgCheck: number | null;
  /** Договоры не дороже MAX_CONTRACT_PRICE. */
  underCount: number;
  underSum: number | null;
  /** Договоров слишком много — суммы не считались, только количество. */
  capped: boolean;
};

/** Собственные договоры поставщика (он — сторона-поставщик) за год: количество, сумма, средний чек. */
async function fetchSupplierStats(bin: string, yearId: number): Promise<SupplierInfo | null> {
  const orgs = await fetchJson<Array<{ id: number; iin_bin?: string; name?: string }>>(
    `${ZAKUP_BASE}/api/core/api/public/organizations/?q=${encodeURIComponent(bin)}`,
  );
  const org = (Array.isArray(orgs) ? orgs : []).find((o) => o.iin_bin === bin);
  if (!org) return null;

  type Page = {
    count: number;
    results: Array<{ contract_price_with_vat?: number | string | null; enstru_code?: string[] | null }>;
  };
  const base = `${ZAKUP_BASE}/api/core/api/public/contracts/?supplier_organization_id=${org.id}&year_id=${yearId}`;
  const first = await fetchJson<Page>(`${base}&limit=1&offset=0`);
  const count = first.count ?? 0;
  const name = org.name ?? "";
  if (count === 0) {
    return {
      stats: { name, count: 0, sum: 0, avgCheck: null, underCount: 0, underSum: 0, capped: false },
      orgId: org.id,
      contractCodes: [],
    };
  }
  if (count > SUPPLIER_SUM_CAP) {
    const under = await fetchJson<Page>(`${base}&limit=1&offset=0&contract_price_with_vat__lte=${MAX_CONTRACT_PRICE}`);
    return {
      stats: { name, count, sum: null, avgCheck: null, underCount: under.count ?? 0, underSum: null, capped: true },
      orgId: org.id,
      contractCodes: [],
    };
  }

  let sum = 0;
  let underCount = 0;
  let underSum = 0;
  const contractCodes = new Set<string>();
  const offsets: number[] = [];
  for (let offset = 0; offset < count; offset += 100) offsets.push(offset);
  const pages = await mapPool(offsets, 5, (offset) => fetchJson<Page>(`${base}&limit=100&offset=${offset}`));
  for (const page of pages) {
    for (const row of page.results ?? []) {
      for (const c of row.enstru_code ?? []) {
        if (typeof c === "string" && /^\d{6}\.\d{3}\.\d{6}$/.test(c)) contractCodes.add(c);
      }
      const v = Number(row.contract_price_with_vat) || 0;
      sum += v;
      if (v <= MAX_CONTRACT_PRICE) {
        underCount += 1;
        underSum += v;
      }
    }
  }
  return {
    stats: { name, count, sum, avgCheck: count > 0 ? sum / count : null, underCount, underSum, capped: false },
    orgId: org.id,
    contractCodes: Array.from(contractCodes),
  };
}

/** Договоров слишком много для полной выгрузки — для запасного источника кодов берём первые SUPPLIER_SUM_CAP. */
async function fetchSupplierContractCodes(orgId: number, yearId: number): Promise<string[]> {
  type Page = { results: Array<{ enstru_code?: string[] | null }> };
  const base = `${ZAKUP_BASE}/api/core/api/public/contracts/?supplier_organization_id=${orgId}&year_id=${yearId}`;
  const offsets: number[] = [];
  for (let offset = 0; offset < SUPPLIER_SUM_CAP; offset += 100) offsets.push(offset);
  const pages = await mapPool(offsets, 5, (offset) => fetchJson<Page>(`${base}&limit=100&offset=${offset}`));
  const out = new Set<string>();
  for (const page of pages) {
    for (const row of page.results ?? []) {
      for (const c of row.enstru_code ?? []) {
        if (typeof c === "string" && /^\d{6}\.\d{3}\.\d{6}$/.test(c)) out.add(c);
      }
    }
  }
  return Array.from(out);
}

/** Известный id целевого года на zakup.gov.kz — запасной вариант, если справочник годов временно не отвечает. */
const FALLBACK_YEAR_IDS: Record<number, number> = { 2025: 10, 2026: 12 };
const yearIdCache = new Map<number, number>();

async function resolveYearId(year: number): Promise<number | null> {
  const cached = yearIdCache.get(year);
  if (cached != null) return cached;
  try {
    const years = await fetchJson<Array<{ id: number; year: number }>>(`${ZAKUP_BASE}/api/core/api/dicts/years/`);
    const id = years.find((y) => y.year === year)?.id ?? null;
    if (id != null) yearIdCache.set(year, id);
    return id;
  } catch (e) {
    const fallback = FALLBACK_YEAR_IDS[year];
    if (fallback != null) {
      console.warn("zakup.gov.kz years failed, using fallback year id", e);
      return fallback;
    }
    throw e;
  }
}

/** Способы закупки, которые не учитываем в рынке (другой бюджет, к нашим закупкам не относятся). */
const EXCLUDED_METHOD_RE = /^конкурс по приобретению|по питанию обучающихся/i;

type MethodTotals = Map<string, { count: number; sum: number }>;
/**
 * Статистика для презентации: только основные договоры (без допсоглашений) с датой заключения в целевом году,
 * каждый договор один раз (даже если у него несколько кодов поставщика).
 */
type PurchaseAcc = { seen: Set<number>; methods: MethodTotals; em: Map<string, { count: number; sum: number }> };
const EM_RE = /электронный магазин/i;
/** Сезонность рынка: помесячно (индекс 0..11) договоры целевого года без договоров самого поставщика. */
type MonthTotals = Array<{ count: number; sum: number }>;

type CodeMarket = {
  count: number;
  sum: number | null;
  capped: boolean;
  sampleContractId: number | null;
  /** Договоры самого поставщика по этому коду (в рамках того же года и лимита суммы). */
  supplierCount: number;
  supplierSum: number;
  /** Место поставщика по сумме среди поставщиков кода (1 — первый) и сколько всего поставщиков у кода. */
  supplierRank: number | null;
  suppliersTotal: number;
};

async function countAndSumContracts(
  code: string,
  yearId: number,
  methods: MethodTotals,
  months: MonthTotals,
  supplierOrgId: number | null,
  year: number,
  acc: PurchaseAcc,
): Promise<CodeMarket> {
  type ContractsPage = {
    count: number;
    results: Array<{
      id: number;
      contract_price_with_vat?: number | string | null;
      purchase_method_name?: string | null;
      sign_date?: string | null;
      supplier_organization_id?: number | null;
      contract_type_id?: number | null;
      customer_organization_id?: number | null;
      customer_organization_name?: string | null;
    }>;
  };
  const empty = { supplierCount: 0, supplierSum: 0, supplierRank: null, suppliersTotal: 0 };

  const priceFilter = `&contract_price_with_vat__lte=${MAX_CONTRACT_PRICE}`;
  const baseUrl = `${ZAKUP_BASE}/api/core/api/public/contracts/?enstru_code=${encodeURIComponent(code)}&year_id=${yearId}${priceFilter}`;
  const first = await fetchJson<ContractsPage>(`${baseUrl}&limit=1&offset=0`);
  const count = first.count ?? 0;
  const sampleContractId = first.results?.[0]?.id ?? null;
  if (count === 0) return { count: 0, sum: 0, capped: false, sampleContractId: null, ...empty };
  if (count > SUM_CAP) return { count, sum: null, capped: true, sampleContractId, ...empty };

  const pageSize = 100;
  let sum = 0;
  let excludedCount = 0;
  let supplierCount = 0;
  let supplierSum = 0;
  const bySupplier = new Map<number, number>();

  // Окна выборки: весь год одним куском, а если договоров больше глубины API — по месяцам даты заключения.
  let windows = [baseUrl];
  const windowCounts: number[] = [count];
  if (count > API_DEPTH_LIMIT) {
    windows = [];
    windowCounts.length = 0;
    for (let m = 1; m <= 12; m++) {
      const from = `${year}-${String(m).padStart(2, "0")}-01`;
      const to = m === 12 ? `${year + 1}-01-01` : `${year}-${String(m + 1).padStart(2, "0")}-01`;
      windows.push(`${baseUrl}&sign_date__gte=${from}T00:00:00&sign_date__lt=${to}T00:00:00`);
    }
    const counts = await mapPool(windows, 4, (w) => fetchJson<ContractsPage>(`${w}&limit=1&offset=0`));
    for (const c of counts) windowCounts.push(c.count ?? 0);
    // Даже один месяц глубже лимита API — выгрузить честно нельзя.
    if (windowCounts.some((c) => c > API_DEPTH_LIMIT)) return { count, sum: null, capped: true, sampleContractId, ...empty };
  }
  const jobs: string[] = [];
  windows.forEach((w, i) => {
    for (let offset = 0; offset < windowCounts[i]; offset += pageSize) jobs.push(`${w}&limit=${pageSize}&offset=${offset}`);
  });
  const pages = await mapPool(jobs, 5, (url) => fetchJson<ContractsPage>(url));
  for (const page of pages) {
    for (const row of page.results ?? []) {
      const method = row.purchase_method_name?.trim() || "Не указан";
      if (EXCLUDED_METHOD_RE.test(method)) {
        excludedCount += 1;
        continue;
      }
      const v = row.contract_price_with_vat;
      const value = v != null ? Number(v) || 0 : 0;
      sum += value;
      const m = methods.get(method) ?? { count: 0, sum: 0 };
      m.count += 1;
      m.sum += value;
      methods.set(method, m);

      if (row.contract_type_id === 1 && (row.sign_date ?? "").startsWith(`${year}-`) && !acc.seen.has(row.id)) {
        acc.seen.add(row.id);
        const pm = acc.methods.get(method) ?? { count: 0, sum: 0 };
        pm.count += 1;
        pm.sum += value;
        acc.methods.set(method, pm);
        if (EM_RE.test(method)) {
          const cname = row.customer_organization_name?.trim() || `Заказчик ${row.customer_organization_id ?? ""}`.trim();
          const cm = acc.em.get(cname) ?? { count: 0, sum: 0 };
          cm.count += 1;
          cm.sum += value;
          acc.em.set(cname, cm);
        }
      }

      const sid = row.supplier_organization_id ?? null;
      if (sid != null) bySupplier.set(sid, (bySupplier.get(sid) ?? 0) + value);
      if (supplierOrgId != null && sid === supplierOrgId) {
        supplierCount += 1;
        supplierSum += value;
      } else {
        // Сезонность — рынок без договоров самого поставщика, по дате заключения в целевом году.
        const d = row.sign_date ?? "";
        if (d.startsWith(`${year}-`)) {
          const mi = Number(d.slice(5, 7)) - 1;
          if (mi >= 0 && mi < 12) {
            months[mi].count += 1;
            months[mi].sum += value;
          }
        }
      }
    }
  }
  let supplierRank: number | null = null;
  if (supplierCount > 0) {
    supplierRank = 1;
    for (const [sid, v] of bySupplier) if (sid !== supplierOrgId && v > supplierSum) supplierRank += 1;
  }
  return {
    count: count - excludedCount,
    sum,
    capped: false,
    sampleContractId,
    supplierCount,
    supplierSum,
    supplierRank,
    suppliersTotal: bySupplier.size,
  };
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

  let body: { bin?: string; year?: number; codes?: unknown };
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

  const year = body.year == null ? DEFAULT_YEAR : Number(body.year);
  if (!ALLOWED_YEARS.includes(year)) {
    return new Response(JSON.stringify({ error: `Год должен быть одним из: ${ALLOWED_YEARS.join(", ")}` }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const codeMap = new Map<string, CodeEntry>();
    let yearId: number | null;
    try {
      yearId = await resolveYearId(year);
    } catch (e) {
      console.error("zakup.gov.kz years failed", e);
      return new Response(
        JSON.stringify({ error: "Сайт zakup.gov.kz сейчас недоступен (ошибка или таймаут). Попробуйте позже." }),
        { status: 502, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }
    if (yearId == null) {
      return new Response(JSON.stringify({ error: `Не удалось определить код года ${year} на zakup.gov.kz` }), {
        status: 502,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    let ktpFailures = 0;
    const nameBox = { name: "" };
    const [, , supplierInfo] = await Promise.all([
      collectFromRegistryFront(bin, codeMap, nameBox).catch((e) => {
        ktpFailures += 1;
        console.error("registry-front failed", e);
      }),
      collectFromFullKzRegistry(bin, codeMap, nameBox).catch((e) => {
        ktpFailures += 1;
        console.error("full_kz registry failed", e);
      }),
      fetchSupplierStats(bin, yearId).catch((e) => {
        console.error("supplier stats failed", e);
        return null;
      }),
    ]);
    const supplier = supplierInfo?.stats ?? null;
    // Название: zakup.gov.kz, а если поставщика там нет или имя пустое — из реестров e-ondiris.
    const companyName = supplier?.name?.trim() || nameBox.name;
    if (supplier && !supplier.name?.trim()) supplier.name = companyName;
    const supplierOrgId = supplierInfo?.orgId ?? null;

    // Основной источник — КТП (реестры e-ondiris). Если там пусто — уникальные коды из договоров поставщика за год.
    let codesSource: "ktp" | "contracts" | "none" = "ktp";
    // Набор кодов от клиента (для «Проверки по БИН» за второй год): если поставщика нет в КТП, коды берутся из его договоров
    // года, и без этого параметра 2026 считался бы по другим кодам, чем 2025.
    const givenCodes = Array.isArray(body.codes)
      ? body.codes.filter((c): c is string => typeof c === "string" && /^[0-9A-Za-z.\-]{6,40}$/.test(c)).slice(0, 2000)
      : [];
    if (codeMap.size === 0 && givenCodes.length > 0) {
      for (const code of givenCodes) addCode(codeMap, code, "");
      codesSource = "contracts";
    }
    if (codeMap.size === 0) {
      if (ktpFailures > 0) {
        return new Response(
          JSON.stringify({ error: "Реестр e-ondiris.gov.kz сейчас недоступен (ошибка или таймаут). Попробуйте позже." }),
          { status: 502, headers: { ...cors, "Content-Type": "application/json" } },
        );
      }
      let fallback = supplierInfo?.contractCodes ?? [];
      if (fallback.length === 0 && supplierInfo?.stats.capped) {
        fallback = await fetchSupplierContractCodes(supplierInfo.orgId, yearId).catch(() => []);
      }
      for (const code of fallback) addCode(codeMap, code, "");
      codesSource = codeMap.size > 0 ? "contracts" : "none";
    }

    if (codeMap.size === 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          bin,
          year,
          maxContractPrice: MAX_CONTRACT_PRICE,
          supplier,
          companyName,
          codesSource,
          codes: [],
          message: "Нет данных для анализа рынка",
        }),
        { headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    const codes = Array.from(codeMap.values());
    const methodTotals: MethodTotals = new Map();
    const monthTotals: MonthTotals = Array.from({ length: 12 }, () => ({ count: 0, sum: 0 }));
    const purchaseAcc: PurchaseAcc = { seen: new Set(), methods: new Map(), em: new Map() };
    // По нескольку кодов одновременно (не больше CODE_CONCURRENCY) — иначе десятки кодов × страниц идут цепочкой.
    const results = await mapPool(codes, CODE_CONCURRENCY, async (entry) => {
      try {
        const r = await countAndSumContracts(entry.code, yearId, methodTotals, monthTotals, supplierOrgId, year, purchaseAcc);
        let canonicalName: string | null = null;
        if (r.sampleContractId != null) {
          canonicalName = await fetchCanonicalCodeName(entry.code, r.sampleContractId).catch(() => null);
        }
        return {
          code: entry.code,
          names: Array.from(entry.names),
          canonicalName,
          contractCount: r.count,
          contractSum: r.sum,
          sumCapped: r.capped,
          supplierCount: r.supplierCount,
          supplierSum: r.supplierSum,
          supplierRank: r.supplierRank,
          suppliersTotal: r.suppliersTotal,
        };
      } catch (e) {
        return {
          code: entry.code,
          names: Array.from(entry.names),
          canonicalName: null,
          contractCount: 0,
          contractSum: null,
          sumCapped: false,
          supplierCount: 0,
          supplierSum: 0,
          supplierRank: null,
          suppliersTotal: 0,
          error: e instanceof Error ? e.message : "Ошибка запроса к zakup.gov.kz",
        };
      }
    });

    if (results.length > 0 && results.every((r) => r.error)) {
      const reason = (results[0].error ?? "").replace(/ at https?:\/\/\S+/, "");
      return new Response(
        JSON.stringify({ error: `Сайт zakup.gov.kz сейчас недоступен (${reason || "ошибка или таймаут"}). Попробуйте позже.` }),
        { status: 502, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    results.sort((a, b) => (b.contractCount || 0) - (a.contractCount || 0));

    // Способы закупки — только по кодам, у которых суммы считались (договоры подгружались целиком).
    const methods = Array.from(methodTotals, ([name, v]) => ({ name, count: v.count, sum: v.sum })).sort(
      (a, b) => b.sum - a.sum,
    );

    // Доли считаем только по кодам, где суммы посчитаны (коды с превышением лимита исключены с обеих сторон).
    let marketSum = 0;
    let supplierSum = 0;
    let nicheMarketSum = 0;
    let nicheCodes = 0;
    for (const r of results) {
      if (r.error || r.sumCapped || r.contractSum == null) continue;
      marketSum += r.contractSum;
      if (r.supplierCount > 0) {
        supplierSum += r.supplierSum;
        nicheMarketSum += r.contractSum;
        nicheCodes += 1;
      }
    }
    const seasonality = {
      months: monthTotals,
      count: monthTotals.reduce((a, m) => a + m.count, 0),
      sum: monthTotals.reduce((a, m) => a + m.sum, 0),
    };

    const purchaseStats = {
      year,
      // Дата выгрузки по Астане/Алматы (UTC+5).
      asOf: new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10),
      methods: Array.from(purchaseAcc.methods, ([name, v]) => ({ name, count: v.count, sum: v.sum })).sort(
        (a, b) => b.sum - a.sum,
      ),
      emCustomers: Array.from(purchaseAcc.em, ([name, v]) => ({ name, count: v.count, sum: v.sum }))
        .sort((a, b) => b.sum - a.sum)
        .slice(0, 5),
      emCustomersTotal: purchaseAcc.em.size,
    };

    return new Response(
      JSON.stringify({
        ok: true,
        bin,
        year,
        sumCap: SUM_CAP,
        maxContractPrice: MAX_CONTRACT_PRICE,
        supplier,
        companyName,
        codesSource,
        methods,
        purchaseStats,
        share: { marketSum, supplierSum, nicheMarketSum, nicheCodes },
        seasonality,
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
