import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const LIST_URL = "https://goszakup.gov.kz/ru/registry/contract";
const SHOW_URL = "https://goszakup.gov.kz/ru/egzcontract/cpublic/show";
/** 546 = CPU/memory isolate kill; держим батч крошечным */
const MAX_ENRICH = 2;
const FETCH_TIMEOUT_MS = 12_000;
const ENRICH_DEADLINE_MS = 20_000;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

type ListRow = Omit<GoszakupContractRow, "planSum" | "finalSum">;

function errText(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

function parseMoney(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, "").replace(/,/g, ".").replace(/[^\d.-]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function sliceAround(hay: string, needle: string, before = 0, after = 400): string {
  const i = hay.toLowerCase().indexOf(needle.toLowerCase());
  if (i < 0) return "";
  return hay.slice(Math.max(0, i - before), Math.min(hay.length, i + needle.length + after));
}

async function fetchText(url: string, attempts = 2): Promise<string> {
  let lastErr: unknown;
  for (let a = 1; a <= attempts; a++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "ru-RU,ru;q=0.9",
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      if (a < attempts) await sleep(250 * a);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function extractTableBody(html: string): string | null {
  const idIdx = html.search(/id=["']search-result["']/i);
  if (idIdx < 0) return null;
  const from = html.indexOf("<tbody", idIdx);
  if (from < 0) return null;
  const openEnd = html.indexOf(">", from);
  if (openEnd < 0) return null;
  const close = html.indexOf("</tbody>", openEnd);
  if (close < 0) return null;
  return html.slice(openEnd + 1, close);
}

function stripCell(td: string): string {
  return td
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseListRows(html: string): ListRow[] {
  const body = extractTableBody(html);
  if (!body) return [];
  const trs = body.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
  const out: ListRow[] = [];

  for (const tr of trs) {
    const tds = tr.match(/<td[\s\S]*?<\/td>/gi) ?? [];
    if (tds.length < 10) continue;
    const cells = tds.map(stripCell);
    const href = tds[1]?.match(/\/show\/(\d+)/)?.[1] ?? "";
    const id = cells[0] || href;
    if (!id) continue;
    out.push({
      id,
      contractNumber: cells[1] ?? "",
      buyNumber: cells[2] ?? "",
      contractType: cells[3] ?? "",
      status: cells[4] ?? "",
      createdAt: cells[5] ?? "",
      customer: cells[7] ?? "",
      supplier: cells[8] ?? "",
      tradeMethod: cells[9] ?? "",
    });
  }
  return out;
}

function parseListRange(html: string): { from: number; to: number; total: number } | null {
  const chunk = sliceAround(html, "Показано", 0, 80) || html.slice(0, 80_000);
  const m =
    chunk.match(/Показано\s+c\s+(\d+)\s+по\s+(\d+)\s+из\s+(\d+)/i) ??
    chunk.match(/Показано\s+с\s+(\d+)\s+по\s+(\d+)\s+из\s+(\d+)/i);
  if (!m) return null;
  return { from: Number(m[1]), to: Number(m[2]), total: Number(m[3]) };
}

function parseDetailSums(html: string): { planSum: number | null; finalSum: number | null } {
  // Карточка большая — ищем только окна вокруг нужных лейблов (CPU/memory)
  const planChunk = sliceAround(html, "Общая плановая сумма договора", 0, 250);
  const finalChunk = sliceAround(html, "Общая итоговая сумма договора", 0, 250);
  const planM = planChunk.match(
    /Общая\s+плановая\s+сумма\s+договора\s*<\/td>\s*<td[^>]*>\s*([^<]+)\s*<\/td>/i,
  );
  const finalM = finalChunk.match(
    /Общая\s+итоговая\s+сумма\s+договора\s*<\/td>\s*<td[^>]*>\s*([^<]+)\s*<\/td>/i,
  );
  return {
    planSum: planM ? parseMoney(planM[1]) : null,
    finalSum: finalM ? parseMoney(finalM[1]) : null,
  };
}

async function isAdminWrite(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return false;
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!supabaseUrl || !anon) return false;
  const userClient = createClient(supabaseUrl, anon, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return false;
  const { data: prof } = await userClient
    .from("profiles")
    .select("role, admin_write")
    .eq("id", user.id)
    .maybeSingle();
  return prof?.role === "admin" && prof?.admin_write !== false;
}

function buildListUrl(bin: string, page: number): string {
  const params = new URLSearchParams();
  params.set("filter[supplier]", bin);
  if (page > 1) params.set("page", String(page));
  return `${LIST_URL}?${params.toString()}`;
}

async function handleList(bin: string, page: number): Promise<Response> {
  const listHtml = await fetchText(buildListUrl(bin, page));
  const rows = parseListRows(listHtml);
  const range = parseListRange(listHtml);
  if (rows.length === 0 && page === 1) {
    const hasTable = /id=["']search-result["']/i.test(listHtml);
    throw new Error(
      `Пустой список договоров (page=${page}, table=${hasTable}, html=${listHtml.length} байт)`,
    );
  }
  const hasMore = range ? range.to < range.total : rows.length >= 50;
  return new Response(
    JSON.stringify({
      ok: true,
      action: "list",
      supplierBin: bin,
      page,
      hasMore,
      total: range?.total ?? null,
      from: range?.from ?? null,
      to: range?.to ?? null,
      rows,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

async function handleEnrich(items: ListRow[]): Promise<Response> {
  const slice = items.slice(0, MAX_ENRICH);
  const rows: GoszakupContractRow[] = [];
  const started = Date.now();

  for (let i = 0; i < slice.length; i++) {
    if (Date.now() - started > ENRICH_DEADLINE_MS) {
      // Не дотягиваем isolate до hard kill — клиент добьёт остаток
      for (let j = i; j < slice.length; j++) {
        rows.push({ ...slice[j], planSum: null, finalSum: null });
      }
      break;
    }
    const row = slice[i];
    try {
      const detailHtml = await fetchText(`${SHOW_URL}/${row.id}`, 2);
      const sums = parseDetailSums(detailHtml);
      rows.push({ ...row, ...sums });
    } catch (e) {
      console.error(`[goszakup] detail ${row.id}:`, errText(e));
      rows.push({ ...row, planSum: null, finalSum: null });
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      action: "enrich",
      rows,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!(await isAdminWrite(req))) {
      return new Response(JSON.stringify({ ok: false, error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      supplierBin?: string;
      page?: number;
      items?: ListRow[];
    };

    const action = (body.action ?? "list").trim().toLowerCase();

    if (action === "enrich") {
      const items = Array.isArray(body.items) ? body.items : [];
      if (items.length === 0) {
        return new Response(JSON.stringify({ ok: false, error: "items пустой" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return await handleEnrich(items);
    }

    const bin = String(body.supplierBin ?? "").replace(/\D/g, "");
    if (bin.length !== 12) {
      return new Response(JSON.stringify({ ok: false, error: "БИН должен состоять из 12 цифр" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const page = Math.max(1, Math.floor(Number(body.page) || 1));
    return await handleList(bin, page);
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: errText(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
