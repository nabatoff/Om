import React from "https://esm.sh/react@18.3.1";
import type { CSSProperties, ReactElement } from "https://esm.sh/react@18.3.1";
import type { ReportManagerRow, TelegramReportPayload } from "./telegramReportTypes.ts";
import { money, parseBreakdown } from "./reportText.ts";

const WIDTH = 1080;

const c = {
  page: "#f8fafc",
  white: "#ffffff",
  border: "#f1f5f9",
  borderBlue: "#dbeafe",
  text: "#1e293b",
  textDark: "#0f172a",
  muted: "#94a3b8",
  muted2: "#64748b",
  blue: "#2563eb",
  blueSoft: "#eff6ff",
  blueDot: "#60a5fa",
  chipBg: "#f1f5f9",
};

type Style = CSSProperties;

function box(style: Style, ...children: React.ReactNode[]): ReactElement {
  return React.createElement("div", { style }, ...children);
}

function text(value: string, style: Style): ReactElement {
  return React.createElement("div", { style }, value);
}

function kpiCard(label: string, value: string, valueColor: string): ReactElement {
  return box(
    {
      display: "flex",
      flexDirection: "column",
      flex: 1,
      backgroundColor: c.white,
      padding: "20px 22px",
      borderRadius: 16,
      border: `1px solid ${c.border}`,
    },
    text(label, {
      fontSize: 13,
      fontWeight: 600,
      color: c.muted,
      textTransform: "uppercase",
      letterSpacing: 1.2,
      marginBottom: 10,
    }),
    text(value, {
      fontSize: 28,
      fontWeight: 800,
      color: valueColor,
    }),
  );
}

function managerCard(r: ReportManagerRow): ReactElement {
  const name = (r.manager ?? "").trim() || "Без имени";
  const assigned = Number(r.assigned_meetings ?? 0);
  const conducted = Number(r.conducted_fact ?? 0);
  const ordersCount = Number(r.confirmed_orders_count ?? 0);
  const ordersSum = Number(r.confirmed_orders_sum ?? 0);
  const br = parseBreakdown(r.confirmed_orders_breakdown) ?? [];
  const hasOrders = br.length > 0;
  const sumColor = ordersSum > 0 ? c.blue : c.textDark;

  const body = !hasOrders
    ? box(
      {
        display: "flex",
        flexDirection: "column",
        padding: "18px 22px",
      },
      text("Заказы отсутствуют", {
        fontSize: 16,
        color: c.muted,
        fontStyle: "italic",
      }),
    )
    : box(
      {
        display: "flex",
        flexDirection: "column",
        padding: "18px 22px",
        width: "100%",
      },
      text("Детализация", {
        fontSize: 12,
        fontWeight: 700,
        color: c.muted,
        textTransform: "uppercase",
        letterSpacing: 1.2,
        marginBottom: 14,
      }),
      ...br.map((o, idx) => {
        const rawName = (o?.name ?? "").trim();
        const label = rawName || `БИН ${(o?.bin ?? "").trim() || "—"}`;
        const cnt = Number(o?.order_count ?? 0);
        const isLast = idx === br.length - 1;
        return box(
          {
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            width: "100%",
            paddingBottom: isLast ? 0 : 12,
            marginBottom: isLast ? 0 : 12,
            borderBottom: isLast ? "none" : `1px solid ${c.border}`,
          },
          box(
            {
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              flex: 1,
            },
            box({
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: c.blueDot,
            }),
            text(label, {
              fontSize: 16,
              fontWeight: 500,
              color: "#334155",
            }),
            box(
              {
                display: "flex",
                backgroundColor: c.chipBg,
                borderRadius: 6,
                padding: "2px 8px",
              },
              text(`${cnt} зак.`, {
                fontSize: 12,
                color: c.muted2,
              }),
            ),
          ),
          text(`${money(Number(o?.total ?? 0))} ₸`, {
            fontSize: 16,
            fontWeight: 700,
            color: c.textDark,
          }),
        );
      }),
    );

  return box(
    {
      display: "flex",
      flexDirection: "column",
      width: "100%",
      backgroundColor: c.white,
      borderRadius: 16,
      border: `1px solid ${c.border}`,
      overflow: "hidden",
    },
    box(
      {
        display: "flex",
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        width: "100%",
        padding: "18px 22px",
        backgroundColor: "#f8fafc",
        borderBottom: `1px solid ${c.border}`,
      },
      text(name, {
        fontSize: 18,
        fontWeight: 600,
        color: c.textDark,
        width: 280,
      }),
      box(
        {
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: "#f1f5f980",
          borderRadius: 8,
          padding: "6px 12px",
        },
        text(`Встречи: ${assigned} / ${conducted}`, {
          fontSize: 13,
          fontWeight: 500,
          color: c.muted2,
        }),
      ),
      text(`${ordersCount} на ${money(ordersSum)} ₸`, {
        fontSize: 17,
        fontWeight: 700,
        color: sumColor,
        textAlign: "right",
        width: 280,
      }),
    ),
    body,
  );
}

/** Точная оценка высоты под светлый макет — без лишнего белого низа. */
export function estimateReportHeight(payload: TelegramReportPayload): number {
  const sorted = [...payload.rows].sort((a, b) => (a.manager ?? "").localeCompare(b.manager ?? "", "ru"));

  // padding 32+40 + header ~100 + gap 24 + kpi ~100 + gap 24 + summary ~88 + gap 28 + title ~44
  let height = 32 + 40 + 100 + 24 + 100 + 24 + 88 + 28 + 44;

  if (sorted.length === 0) {
    height += 48;
  } else {
    for (let i = 0; i < sorted.length; i++) {
      const br = parseBreakdown(sorted[i].confirmed_orders_breakdown) ?? [];
      // header row ~64 + body
      let card = 64;
      if (br.length === 0) {
        card += 56; // italic empty
      } else {
        card += 18 + 14 + 18 + br.length * 44; // padding + label + rows
      }
      height += card;
      if (i < sorted.length - 1) height += 16; // gap
    }
  }

  return Math.max(700, Math.min(height + 8, 20000));
}

export function buildTelegramReportElement(payload: TelegramReportPayload): ReactElement {
  const { reportDateLabel, weeklyForecast, todayOrdersSum, weekOrdersSum, monthOrdersSum, total, rows } = payload;
  const sorted = [...rows].sort((a, b) => (a.manager ?? "").localeCompare(b.manager ?? "", "ru"));

  const managersBlock = sorted.length === 0
    ? text("Нет отчётов за день", { fontSize: 16, color: c.muted, marginTop: 8 })
    : box(
      {
        display: "flex",
        flexDirection: "column",
        width: "100%",
        gap: 16,
      },
      ...sorted.map((r) => managerCard(r)),
    );

  return box(
    {
      display: "flex",
      flexDirection: "column",
      width: WIDTH,
      backgroundColor: c.page,
      padding: "32px 36px 40px",
      fontFamily: "Noto Sans",
      color: c.text,
    },
    // Header
    box(
      {
        display: "flex",
        flexDirection: "column",
        borderBottom: "1px solid #e2e8f0",
        paddingBottom: 18,
        marginBottom: 24,
      },
      text("Omarket Отдел Привлечения Крупного Бизнеса", {
        fontSize: 18,
        fontWeight: 700,
        color: c.blue,
        textTransform: "uppercase",
        letterSpacing: 1.5,
        marginBottom: 8,
      }),
      text(`Сводка за ${reportDateLabel}`, {
        fontSize: 30,
        fontWeight: 800,
        color: c.textDark,
      }),
    ),
    // KPI row
    box(
      {
        display: "flex",
        flexDirection: "row",
        gap: 16,
        width: "100%",
        marginBottom: 24,
      },
      kpiCard("Прогноз на неделю", `${money(weeklyForecast)} ₸`, c.blue),
      kpiCard("Заказы за день", `${money(todayOrdersSum)} ₸`, c.textDark),
      kpiCard("Заказы за неделю", `${money(weekOrdersSum)} ₸`, c.textDark),
      kpiCard("Заказы за месяц", `${money(monthOrdersSum)} ₸`, c.textDark),
    ),
    // General summary
    box(
      {
        display: "flex",
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        width: "100%",
        backgroundImage: "linear-gradient(90deg, #eff6ff 0%, #ffffff 100%)",
        border: `1px solid ${c.borderBlue}`,
        borderRadius: 16,
        padding: "18px 22px",
        marginBottom: 28,
      },
      text("Общая сводка", {
        fontSize: 17,
        fontWeight: 700,
        color: c.text,
      }),
      box(
        {
          display: "flex",
          flexDirection: "row",
          gap: 12,
        },
        box(
          {
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            backgroundColor: c.white,
            borderRadius: 12,
            border: `1px solid ${c.blueSoft}`,
            padding: "8px 14px",
          },
          text("Встречи (назн./факт):", { fontSize: 14, color: c.muted2 }),
          text(`${total.assigned} / ${total.conductedFact}`, {
            fontSize: 14,
            fontWeight: 700,
            color: c.textDark,
          }),
        ),
        box(
          {
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            backgroundColor: c.white,
            borderRadius: 12,
            border: `1px solid ${c.blueSoft}`,
            padding: "8px 14px",
          },
          text("Заказы:", { fontSize: 14, color: c.muted2 }),
          text(`${total.ordersCount} на ${money(total.ordersSum)} ₸`, {
            fontSize: 14,
            fontWeight: 700,
            color: "#1d4ed8",
          }),
        ),
      ),
    ),
    // Managers
    box(
      {
        display: "flex",
        flexDirection: "column",
        width: "100%",
      },
      text("По менеджерам", {
        fontSize: 20,
        fontWeight: 700,
        color: c.text,
        marginBottom: 16,
        lineHeight: 1.3,
      }),
      managersBlock,
    ),
  );
}

export const REPORT_IMAGE_WIDTH = WIDTH;
