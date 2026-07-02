import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/** Дата календаря в указанном IANA TZ → YYYY-MM-DD */
function dateYmdInTz(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const byType = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function formatDateDisplay(ymd: string): string {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function escHtml(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function errText(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

type RpcRow = {
  manager: string;
  assigned_meetings: number;
  conducted_fact: number;
  conducted_new: number;
  confirmed_orders_sum: number;
  confirmed_orders_count: number;
  confirmed_orders_breakdown: Array<{ name?: string; bin?: string; total?: number; order_count?: number }> | null;
};

function parseBreakdown(raw: unknown): RpcRow["confirmed_orders_breakdown"] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw as RpcRow["confirmed_orders_breakdown"];
  return [];
}

function money(n: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Number.isFinite(n) ? n : 0);
}

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key",
};

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** Cron (`x-cron-key`) или JWT администратора. */
async function isRequestAuthorized(req: Request): Promise<boolean> {
  const cronKey = Deno.env.get("TELEGRAM_CRON_SECRET") ?? "";
  if (cronKey && (req.headers.get("x-cron-key") ?? "") === cronKey) return true;

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

  const { data: prof } = await userClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return prof?.role === "admin";
}

export async function handleCronReport(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!(await isRequestAuthorized(req))) {
      return new Response(JSON.stringify({ ok: false, error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
    const chatId = Deno.env.get("TELEGRAM_CHAT_ID") ?? "";
    if (!botToken || !chatId) {
      throw new Error("TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing");
    }

    const tz = Deno.env.get("REPORT_TIMEZONE") ?? "Asia/Almaty";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let reportDate = dateYmdInTz(new Date(), tz);
    try {
      const ct = (req.headers.get("content-type") ?? "").toLowerCase();
      if (ct.includes("application/json")) {
        const j = (await req.json()) as { report_date?: string; p_date?: string };
        const raw = (j.report_date ?? j.p_date ?? "").trim();
        if (raw && isYmd(raw)) reportDate = raw;
      }
    } catch {
      /* пустое тело — отчёт за сегодня */
    }
    const reportDateLabel = formatDateDisplay(reportDate);

    const [
      { data, error },
      { data: forecastData, error: forecastError },
      { data: totalsData, error: totalsError },
    ] = await Promise.all([
      supabase.rpc("telegram_daily_analytics_rows", { p_date: reportDate }),
      supabase.rpc("get_crm_telegram_weekly_forecast"),
      supabase.rpc("telegram_confirmed_orders_totals", { p_tz: tz }),
    ]);
    if (error) throw error;
    if (forecastError) throw forecastError;
    if (totalsError) throw totalsError;

    const rows = (data ?? []) as RpcRow[];

    const weeklyForecast = Number(forecastData ?? 0);
    const totalsRow = (Array.isArray(totalsData) ? totalsData[0] : totalsData) as
      | { today_sum?: number; week_sum?: number }
      | null
      | undefined;
    const todayOrdersSum = Number(totalsRow?.today_sum ?? 0);
    const weekOrdersSum = Number(totalsRow?.week_sum ?? 0);

    const total = rows.reduce(
      (acc, r) => ({
        assigned: acc.assigned + Number(r.assigned_meetings ?? 0),
        conductedFact: acc.conductedFact + Number(r.conducted_fact ?? 0),
        ordersSum: acc.ordersSum + Number(r.confirmed_orders_sum ?? 0),
        ordersCount: acc.ordersCount + Number(r.confirmed_orders_count ?? 0),
      }),
      { assigned: 0, conductedFact: 0, ordersSum: 0, ordersCount: 0 },
    );

    const lines: string[] = [];
    lines.push(`📊 <b>Сводка за ${escHtml(reportDateLabel)}</b>`);
    lines.push("━━━━━━━━━━━━━━━━━━━━");
    lines.push("");
    lines.push(`Прогноз на неделю: <b>${money(weeklyForecast)} ₸</b>`);
    lines.push(`Сумма заказов на сегодняшний день: <b>${money(todayOrdersSum)} ₸</b>`);
    lines.push(`Сумма заказов за неделю (в текущем месяце): <b>${money(weekOrdersSum)} ₸</b>`);
    lines.push("");
    lines.push("<b>Общая сводка</b>");
    lines.push(`• Назначено встреч: <b>${total.assigned}</b>`);
    lines.push(`• Факт проведено: <b>${total.conductedFact}</b>`);
    lines.push(`• Подтверждённых заказов: <b>${total.ordersCount}</b> на <b>${money(total.ordersSum)} ₸</b>`);
    lines.push("");
    lines.push("<b>По менеджерам</b>");

    const sorted = [...rows].sort((a, b) => (a.manager ?? "").localeCompare(b.manager ?? "", "ru"));

    if (sorted.length === 0) {
      lines.push("• Нет отчётов за день");
    } else {
      for (const r of sorted) {
        const name = escHtml((r.manager ?? "").trim() || "Без имени");
        lines.push("");
        lines.push(`<b>${name}</b>`);
        lines.push(`  Назначено встреч: <b>${r.assigned_meetings ?? 0}</b>`);
        lines.push(`  Факт проведено: <b>${r.conducted_fact ?? 0}</b>`);
        const mgrOrdersCount = Number(r.confirmed_orders_count ?? 0);
        lines.push(
          `  Подтверждённых заказов: <b>${mgrOrdersCount}</b> на <b>${money(Number(r.confirmed_orders_sum ?? 0))} ₸</b>`,
        );
        const br = parseBreakdown(r.confirmed_orders_breakdown);
        if (br.length === 0) {
          lines.push("  Заказы: нет");
        } else {
          lines.push("  Подтверждённые заказы:");
          for (const o of br) {
            const rawName = (o?.name ?? "").trim();
            const label = rawName ? escHtml(rawName) : `БИН ${escHtml(String((o?.bin ?? "").trim()))}`;
            const cnt = Number(o?.order_count ?? 0);
            lines.push(`   — ${label}: <b>${money(Number(o?.total ?? 0))} ₸</b> · <b>${cnt}</b> зак.`);
          }
        }
      }
    }

    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: lines.join("\n"),
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    const tg = await tgRes.json();
    if (!tg?.ok) throw new Error(`telegram send failed: ${JSON.stringify(tg)}`);

    return new Response(
      JSON.stringify({
        ok: true,
        reportDate,
        reportDateLabel,
        chatId,
        managers: rows.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: errText(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
