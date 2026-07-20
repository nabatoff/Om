export type ReportOrderBreakdown = {
  name?: string;
  bin?: string;
  total?: number;
  order_count?: number;
};

export type ReportManagerRow = {
  manager: string;
  assigned_meetings: number;
  conducted_fact: number;
  conducted_new?: number;
  confirmed_orders_sum: number;
  confirmed_orders_count: number;
  confirmed_orders_breakdown: ReportOrderBreakdown[] | null;
};

export type TelegramReportTotals = {
  assigned: number;
  conductedFact: number;
  ordersSum: number;
  ordersCount: number;
};

export type TelegramReportPayload = {
  reportDateLabel: string;
  weeklyForecast: number;
  todayOrdersSum: number;
  weekOrdersSum: number;
  monthOrdersSum: number;
  total: TelegramReportTotals;
  rows: ReportManagerRow[];
};
