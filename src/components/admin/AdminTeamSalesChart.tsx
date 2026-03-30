"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
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

export type TeamSalesRow = {
  name: string;
  actual: number;
  target: number;
};

type Props = {
  data: TeamSalesRow[];
  monthLabel: string;
};

export function AdminTeamSalesChart({ data, monthLabel }: Props) {
  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Прогресс продаж команды</CardTitle>
        <CardDescription>
          Факт (confirmed_sum) vs план (monthly_sales_target) за {monthLabel}.
        </CardDescription>
      </CardHeader>
      <CardContent className="pl-0">
        <div className="h-[320px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                interval={0}
                angle={-25}
                textAnchor="end"
                height={70}
              />
              <YAxis
                tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
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
                formatter={(value, name) => {
                  const n =
                    typeof value === "number"
                      ? value
                      : value != null
                        ? Number(value)
                        : 0;
                  const label =
                    name === "actual" || name === "Факт" ? "Факт" : "План";
                  return [
                    Number.isFinite(n)
                      ? n.toLocaleString("ru-RU", { maximumFractionDigits: 0 })
                      : "—",
                    label,
                  ];
                }}
              />
              <Legend
                formatter={(v) => (v === "actual" ? "Факт" : "План")}
                wrapperStyle={{ fontSize: 12 }}
              />
              <Bar
                dataKey="actual"
                name="actual"
                fill="var(--chart-1)"
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              />
              <Line
                type="monotone"
                dataKey="target"
                name="target"
                stroke="var(--chart-3)"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
