import React from "https://esm.sh/react@18.3.1";
import type { CSSProperties, ReactElement } from "https://esm.sh/react@18.3.1";
import type { TelegramReportPayload } from "./telegramReportTypes.ts";
import { money, parseBreakdown } from "./reportText.ts";

const WIDTH = 1200;

const palette = {
  bg: "#0b1220",
  surface: "#111827",
  card: "#1f2937",
  border: "#374151",
  text: "#f9fafb",
  muted: "#9ca3af",
  success: "#10b981",
};

type Style = CSSProperties;

function box(style: Style, ...children: React.ReactNode[]): ReactElement {
  return React.createElement("div", { style }, ...children);
}

function text(value: string, style: Style): ReactElement {
  return React.createElement("div", { style }, value);
}

function metric(label: string, value: string, accent = false): ReactElement {
  return box(
    {
      display: "flex",
      flexDirection: "column",
      flex: 1,
      padding: "16px 20px",
      backgroundColor: palette.card,
      borderRadius: 16,
      border: `1px solid ${palette.border}`,
    },
    text(label, { fontSize: 22, color: palette.muted, marginBottom: 8 }),
    text(value, {
      fontSize: 30,
      fontWeight: 700,
      color: accent ? palette.success : palette.text,
    }),
  );
}

function rowMetric(label: string, value: string): ReactElement {
  return box(
    { display: "flex", flexDirection: "row", justifyContent: "space-between", marginBottom: 12, width: "100%" },
    text(label, { fontSize: 24, color: palette.muted }),
    text(value, { fontSize: 24, fontWeight: 700, color: palette.text }),
  );
}

/** Высота canvas для Satori — с запасом, иначе низ обрезается. */
export function estimateReportHeight(payload: TelegramReportPayload): number {
  const sorted = [...payload.rows].sort((a, b) => (a.manager ?? "").localeCompare(b.manager ?? "", "ru"));

  // шапка + 3 метрики + общая сводка + заголовок секции менеджеров
  let height = 620;

  if (sorted.length === 0) {
    height += 80;
  } else {
    for (const r of sorted) {
      const br = parseBreakdown(r.confirmed_orders_breakdown);
      // карточка менеджера: имя + 3 строки + padding + border
      let card = 300;
      if (br.length === 0) {
        card += 44;
      } else {
        card += 52 + br.length * 38;
      }
      height += card + 24; // gap между карточками
    }
  }

  return Math.max(1100, Math.min(height + 160, 20000));
}

function buildManagerCard(r: TelegramReportPayload["rows"][number]): ReactElement {
  const name = (r.manager ?? "").trim() || "Без имени";
  const br = parseBreakdown(r.confirmed_orders_breakdown);
  const orderLines = br.length === 0
    ? [text("Заказы: нет", { fontSize: 22, color: palette.muted, marginTop: 12 })]
    : [
      text("Подтверждённые заказы:", {
        fontSize: 22,
        color: palette.muted,
        marginTop: 16,
        marginBottom: 10,
      }),
      ...br.map((o) => {
        const rawName = (o?.name ?? "").trim();
        const label = rawName || `БИН ${(o?.bin ?? "").trim() || "—"}`;
        const cnt = Number(o?.order_count ?? 0);
        return text(`— ${label}: ${money(Number(o?.total ?? 0))} ₸ · ${cnt} зак.`, {
          fontSize: 21,
          color: palette.text,
          marginBottom: 8,
          paddingLeft: 12,
        });
      }),
    ];

  return box(
    {
      display: "flex",
      flexDirection: "column",
      width: "100%",
      backgroundColor: palette.surface,
      borderRadius: 20,
      border: `1px solid ${palette.border}`,
      padding: "24px 28px",
    },
    text(name, { fontSize: 30, fontWeight: 700, color: palette.text, marginBottom: 18 }),
    rowMetric("Назначено встреч", String(r.assigned_meetings ?? 0)),
    rowMetric("Факт проведено", String(r.conducted_fact ?? 0)),
    rowMetric(
      "Подтверждённых заказов",
      `${Number(r.confirmed_orders_count ?? 0)} на ${money(Number(r.confirmed_orders_sum ?? 0))} ₸`,
    ),
    ...orderLines,
  );
}

export function buildTelegramReportElement(payload: TelegramReportPayload): ReactElement {
  const { reportDateLabel, weeklyForecast, todayOrdersSum, weekOrdersSum, total, rows } = payload;
  const sorted = [...rows].sort((a, b) => (a.manager ?? "").localeCompare(b.manager ?? "", "ru"));

  const managerSection = sorted.length === 0
    ? text("Нет отчётов за день", { fontSize: 26, color: palette.muted, paddingTop: 12 })
    : box(
      {
        display: "flex",
        flexDirection: "column",
        width: "100%",
        gap: 24,
      },
      ...sorted.map((r) => buildManagerCard(r)),
    );

  return box(
    {
      display: "flex",
      flexDirection: "column",
      width: WIDTH,
      backgroundColor: palette.bg,
      padding: "40px 48px 56px",
      fontFamily: "Noto Sans",
      color: palette.text,
    },
    box(
      {
        display: "flex",
        flexDirection: "column",
        marginBottom: 28,
        paddingBottom: 24,
        borderBottom: `2px solid ${palette.border}`,
      },
      text("CRM Om", { fontSize: 20, color: palette.muted, letterSpacing: 2, marginBottom: 8 }),
      text(`Сводка за ${reportDateLabel}`, { fontSize: 44, fontWeight: 700, color: palette.text }),
    ),
    box(
      {
        display: "flex",
        flexDirection: "row",
        gap: 16,
        marginBottom: 28,
        width: "100%",
      },
      metric("Прогноз на неделю", `${money(weeklyForecast)} ₸`, true),
      metric("Заказы за день", `${money(todayOrdersSum)} ₸`),
      metric("Заказы за неделю", `${money(weekOrdersSum)} ₸`),
    ),
    box(
      {
        display: "flex",
        flexDirection: "column",
        width: "100%",
        backgroundColor: palette.surface,
        borderRadius: 20,
        border: `1px solid ${palette.border}`,
        padding: "24px 28px",
        marginBottom: 36,
      },
      text("Общая сводка", { fontSize: 28, fontWeight: 700, marginBottom: 16 }),
      rowMetric("Назначено встреч", String(total.assigned)),
      rowMetric("Факт проведено", String(total.conductedFact)),
      rowMetric(
        "Подтверждённых заказов",
        `${total.ordersCount} на ${money(total.ordersSum)} ₸`,
      ),
    ),
    box(
      {
        display: "flex",
        flexDirection: "column",
        width: "100%",
        marginBottom: 28,
      },
      text("По менеджерам", {
        fontSize: 28,
        fontWeight: 700,
        color: palette.text,
        marginBottom: 24,
        lineHeight: 1.3,
      }),
      managerSection,
    ),
  );
}

export const REPORT_IMAGE_WIDTH = WIDTH;
