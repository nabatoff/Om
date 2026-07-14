import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const LIST_URL = "https://goszakup.gov.kz/ru/registry/contract";
const SHOW_URL = "https://goszakup.gov.kz/ru/egzcontract/cpublic/show";

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

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "ru-RU,ru;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

function extractTableBody(html: string): string | null {
  const m = html.match(/id=["']search-result["'][\s\S]*?<tbody>([\s\S]*?)<\/tbody>/i);
  return m?.[1] ?? null;
}

function parseListRows(html: string): Array<Omit<GoszakupContractRow, "planSum" | "finalSum">> {
  const body = extractTableBody(html);
  if (!body) return [];
  const trs = body.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  const out: Array<Omit<GoszakupContractRow, "planSum" | "finalSum">> = [];

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
  const m = html.match(/Показано\s+c\s+(\d+)\s+по\s+(\d+)\s+из\s+(\d+)/i) ??
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

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
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
  const u = new URL(LIST_URL);
  u.searchParams.set("filter[supplier]", bin);
  if (page > 1) u.searchParams.set("page", String(page));
  return u.toString();
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
      supplierBin?: string;
      page?: number;
    };
    const bin = String(body.supplierBin ?? "").replace(/\D/g, "");
    if (bin.length !== 12) {
      return new Response(JSON.stringify({ ok: false, error: "БИН должен состоять из 12 цифр" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const page = Math.max(1, Math.floor(Number(body.page) || 1));

    const listHtml = await fetchText(buildListUrl(bin, page));
    const baseRows = parseListRows(listHtml);
    const range = parseListRange(listHtml);
    const hasMore = range ? range.to < range.total : baseRows.length >= 50;

    const enriched = await mapPool(baseRows, 3, async (row, idx) => {
      if (idx > 0) await sleep(120);
      try {
        const detailHtml = await fetchText(`${SHOW_URL}/${row.id}`);
        const sums = parseDetailSums(detailHtml);
        return { ...row, ...sums } satisfies GoszakupContractRow;
      } catch (e) {
        console.error(`[goszakup] detail ${row.id}:`, errText(e));
        return { ...row, planSum: null, finalSum: null } satisfies GoszakupContractRow;
      }
    });

    return new Response(
      JSON.stringify({
        ok: true,
        supplierBin: bin,
        page,
        hasMore,
        total: range?.total ?? null,
        from: range?.from ?? null,
        to: range?.to ?? null,
        rows: enriched,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: errText(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
