"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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

export type ManagerDailyPoint = {
  date: string;
  qualifiedPct: number;
  gepScheduledPct: number;
  workStartedPct: number;
  cpSentPct: number;
};

type Props = {
  managerName: string;
  data: ManagerDailyPoint[];
};

export function AdminManagerDailyChart({ managerName, data }: Props) {
  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">{managerName}</CardTitle>
        <CardDescription>Динамика по дням текущего месяца, % от факта звонков</CardDescription>
      </CardHeader>
      <CardContent className="pl-0">
        <div className="h-[280px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name]}
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                  color: "var(--card-foreground)",
                }}
              />
              <Legend />
              <Bar dataKey="qualifiedPct" name="Прошли квал" fill="var(--chart-2)" maxBarSize={16} />
              <Bar dataKey="gepScheduledPct" name="Назначено ГЭП" fill="var(--chart-1)" maxBarSize={16} />
              <Bar dataKey="workStartedPct" name="Начата работа (ОМаркет)" fill="var(--chart-3)" maxBarSize={16} />
              <Bar dataKey="cpSentPct" name="Выставлены ЦП" fill="var(--chart-4)" maxBarSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
