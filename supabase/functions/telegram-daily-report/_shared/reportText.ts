import type { ReportManagerRow, TelegramReportPayload } from "./telegramReportTypes.ts";

export function escHtml(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function money(n: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Number.isFinite(n) ? n : 0);
}

export function parseBreakdown(raw: unknown): ReportManagerRow["confirmed_orders_breakdown"] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw as ReportManagerRow["confirmed_orders_breakdown"];
  return [];
}

export function buildTelegramReportText(payload: TelegramReportPayload): string {
  const { reportDateLabel, weeklyForecast, todayOrdersSum, weekOrdersSum, total, rows } = payload;
  const lines: string[] = [];

  lines.push(`📊 <b>Сводка за ${escHtml(reportDateLabel)}</b>`);
  lines.push("━━━━━━━━━━━━━━━━━━━━");
  lines.push("");
  lines.push(`Прогноз на неделю: <b>${money(weeklyForecast)} ₸</b>`);
  lines.push(`Сумма заказов за день: <b>${money(todayOrdersSum)} ₸</b>`);
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

  return lines.join("\n");
}
