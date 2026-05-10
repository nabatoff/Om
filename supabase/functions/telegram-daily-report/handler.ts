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
  confirmed_orders_breakdown: Array<{ name?: string; bin?: string; total?: number }> | null;
};

function parseBreakdown(raw: unknown): RpcRow["confirmed_orders_breakdown"] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw as RpcRow["confirmed_orders_breakdown"];
  return [];
}

function money(n: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Number.isFinite(n) ? n : 0);
}

export async function handleCronReport(req: Request): Promise<Response> {
  try {
    const cronKey = Deno.env.get("TELEGRAM_CRON_SECRET") ?? "";
    if (!cronKey || (req.headers.get("x-cron-key") ?? "") !== cronKey) {
      return new Response(JSON.stringify({ ok: false, error: "forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
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

    const reportDate = dateYmdInTz(new Date(), tz);
    const reportDateLabel = formatDateDisplay(reportDate);

    const { data, error } = await supabase.rpc("telegram_daily_analytics_rows", { p_date: reportDate });
    if (error) throw error;

    const rows = (data ?? []) as RpcRow[];

    const total = rows.reduce(
      (acc, r) => ({
        assigned: acc.assigned + Number(r.assigned_meetings ?? 0),
        conductedFact: acc.conductedFact + Number(r.conducted_fact ?? 0),
        conductedNew: acc.conductedNew + Number(r.conducted_new ?? 0),
        ordersSum: acc.ordersSum + Number(r.confirmed_orders_sum ?? 0),
      }),
      { assigned: 0, conductedFact: 0, conductedNew: 0, ordersSum: 0 },
    );

    const lines: string[] = [];
    lines.push(`📊 <b>Сводка за ${escHtml(reportDateLabel)}</b>`);
    lines.push("━━━━━━━━━━━━━━━━━━━━");
    lines.push("");
    lines.push("<b>Общая сводка</b>");
    lines.push(`• Назначено встреч: <b>${total.assigned}</b>`);
    lines.push(`• Факт проведено: <b>${total.conductedFact}</b>`);
    lines.push(`• Проведено новых: <b>${total.conductedNew}</b>`);
    lines.push(`• Сумма подтверждённых заказов: <b>${money(total.ordersSum)} ₸</b>`);
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
        lines.push(`  Проведено новых: <b>${r.conducted_new ?? 0}</b>`);
        lines.push(`  Сумма подтверждённых заказов: <b>${money(Number(r.confirmed_orders_sum ?? 0))} ₸</b>`);
        const br = parseBreakdown(r.confirmed_orders_breakdown);
        if (br.length === 0) {
          lines.push("  Заказы: нет");
        } else {
          lines.push("  Подтверждённые заказы:");
          for (const o of br) {
            const rawName = (o?.name ?? "").trim();
            const label = rawName ? escHtml(rawName) : `БИН ${escHtml(String((o?.bin ?? "").trim()))}`;
            lines.push(`   — ${label}: <b>${money(Number(o?.total ?? 0))} ₸</b>`);
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
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: errText(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
