"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type SalesChartPoint = {
  date: string;
  label: string;
  total: number;
};

type Props = {
  data: SalesChartPoint[];
};

export function AdminSalesChart({ data }: Props) {
  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Продажи за 7 дней</CardTitle>
        <CardDescription>
          Сумма «подтверждённая сумма» по всем отчётам за календарный день.
        </CardDescription>
      </CardHeader>
      <CardContent className="pl-0">
        <div className="h-[280px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) =>
                  Number(v).toLocaleString("ru-RU", { maximumFractionDigits: 0 })
                }
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                  color: "var(--card-foreground)",
                }}
                formatter={(value) => {
                  const n =
                    typeof value === "number"
                      ? value
                      : value != null
                        ? Number(value)
                        : 0;
                  return [
                    Number.isFinite(n)
                      ? n.toLocaleString("ru-RU", { maximumFractionDigits: 2 })
                      : "—",
                    "Сумма",
                  ];
                }}
              />
              <Line
                type="monotone"
                dataKey="total"
                stroke="var(--chart-1)"
                strokeWidth={2}
                dot={{ r: 3, fill: "var(--chart-1)" }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
