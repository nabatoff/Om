import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const LIST_URL = "https://goszakup.gov.kz/ru/registry/contract";
const SHOW_URL = "https://goszakup.gov.kz/ru/egzcontract/cpublic/show";
const MAX_ENRICH = 8;

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

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
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

async function fetchText(url: string, attempts = 3): Promise<string> {
  let lastErr: unknown;
  for (let a = 1; a <= attempts; a++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "ru-RU,ru;q=0.9",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      if (a < attempts) await sleep(400 * a);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function extractTableBody(html: string): string | null {
  const m = html.match(/id=["']search-result["'][\s\S]*?<tbody>([\s\S]*?)<\/tbody>/i);
  return m?.[1] ?? null;
}

function parseListRows(html: string): ListRow[] {
  const body = extractTableBody(html);
  if (!body) return [];
  const trs = body.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  const out: ListRow[] = [];

  for (const tr of trs) {
    const tds = tr.match(/<td[^>]*>[\s\S]*?<\/td>/gi) ?? [];
    if (tds.length < 10) continue;
    const cells = tds.map((td) => stripTags(td));
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
  const m =
    html.match(/Показано\s+c\s+(\d+)\s+по\s+(\d+)\s+из\s+(\d+)/i) ??
    html.match(/Показано\s+с\s+(\d+)\s+по\s+(\d+)\s+из\s+(\d+)/i);
  if (!m) return null;
  return { from: Number(m[1]), to: Number(m[2]), total: Number(m[3]) };
}

function parseDetailSums(html: string): { planSum: number | null; finalSum: number | null } {
  const planM = html.match(
    /Общая\s+плановая\s+сумма\s+договора\s*<\/td>\s*<td[^>]*>\s*([^<]+)\s*<\/td>/i,
  );
  const finalM = html.match(
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
    // возможно капча/пустая выдача — отдаём кусок HTML для отладки длины
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
  for (let i = 0; i < slice.length; i++) {
    const row = slice[i];
    if (i > 0) await sleep(180);
    try {
      const detailHtml = await fetchText(`${SHOW_URL}/${row.id}`);
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
