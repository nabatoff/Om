import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildTelegramReportText } from "./_shared/reportText.ts";
import { renderTelegramReportPng } from "./_shared/renderReportPng.ts";
import type { ReportManagerRow, TelegramReportPayload } from "./_shared/telegramReportTypes.ts";

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

function errText(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key",
};

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function reportAsImageEnabled(): boolean {
  const raw = (Deno.env.get("TELEGRAM_REPORT_AS_IMAGE") ?? "true").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "no";
}

async function sendTelegramMessage(botToken: string, chatId: string, text: string): Promise<void> {
  const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  const tg = await tgRes.json();
  if (!tg?.ok) throw new Error(`telegram sendMessage failed: ${JSON.stringify(tg)}`);
}

async function sendTelegramPhoto(
  botToken: string,
  chatId: string,
  png: Uint8Array,
  caption?: string,
): Promise<void> {
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("photo", new Blob([png], { type: "image/png" }), "crm-report.png");
  if (caption) form.append("caption", caption);
  const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
    method: "POST",
    body: form,
  });
  const tg = await tgRes.json();
  if (!tg?.ok) throw new Error(`telegram sendPhoto failed: ${JSON.stringify(tg)}`);
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

  const { data: prof } = await userClient.from("profiles").select("role, admin_write").eq("id", user.id).maybeSingle();
  return prof?.role === "admin" && prof?.admin_write !== false;
}

async function loadReportPayload(
  supabase: ReturnType<typeof createClient>,
  reportDate: string,
  tz: string,
  reportDateLabel: string,
): Promise<TelegramReportPayload> {
  const [
    { data, error },
    { data: forecastData, error: forecastError },
    { data: totalsData, error: totalsError },
  ] = await Promise.all([
    supabase.rpc("telegram_daily_analytics_rows", { p_date: reportDate }),
    supabase.rpc("get_crm_telegram_weekly_forecast"),
    supabase.rpc("telegram_confirmed_orders_totals", { p_tz: tz, p_date: reportDate }),
  ]);
  if (error) throw error;
  if (forecastError) throw forecastError;
  if (totalsError) throw totalsError;

  const rows = (data ?? []) as ReportManagerRow[];
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

  return {
    reportDateLabel,
    weeklyForecast,
    todayOrdersSum,
    weekOrdersSum,
    total,
    rows,
  };
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

    const url = new URL(req.url);
    const previewPng = url.searchParams.get("preview") === "png";

    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
    const chatId = Deno.env.get("TELEGRAM_CHAT_ID") ?? "";
    if (!previewPng && (!botToken || !chatId)) {
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
    const urlDate = (url.searchParams.get("report_date") ?? url.searchParams.get("p_date") ?? "").trim();
    if (urlDate && isYmd(urlDate)) reportDate = urlDate;
    try {
      const ct = (req.headers.get("content-type") ?? "").toLowerCase();
      if (ct.includes("application/json")) {
        const j = (await req.json()) as { report_date?: string; p_date?: string; preview?: boolean };
        const raw = (j.report_date ?? j.p_date ?? "").trim();
        if (raw && isYmd(raw)) reportDate = raw;
      }
    } catch {
      /* пустое тело — отчёт за сегодня */
    }
    const reportDateLabel = formatDateDisplay(reportDate);
    const payload = await loadReportPayload(supabase, reportDate, tz, reportDateLabel);
    const text = buildTelegramReportText(payload);
    const caption = `Сводка за ${reportDateLabel}`;

    if (previewPng) {
      const png = await renderTelegramReportPng(payload);
      return new Response(png, {
        headers: {
          ...corsHeaders,
          "Content-Type": "image/png",
          "Cache-Control": "no-store",
        },
      });
    }

    let delivery: "photo" | "text" = "text";
    let imageError: string | undefined;
    if (reportAsImageEnabled()) {
      try {
        const png = await renderTelegramReportPng(payload);
        await sendTelegramPhoto(botToken, chatId, png, caption);
        delivery = "photo";
      } catch (imgErr) {
        imageError = errText(imgErr);
        console.error("[telegram-daily-report] image failed, fallback to text:", imageError);
        await sendTelegramMessage(botToken, chatId, text);
        delivery = "text";
      }
    } else {
      await sendTelegramMessage(botToken, chatId, text);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        reportDate,
        reportDateLabel,
        chatId,
        managers: payload.rows.length,
        delivery,
        imageError,
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
