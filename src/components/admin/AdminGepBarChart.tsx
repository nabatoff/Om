"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
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

export type GepBarPoint = {
  name: string;
  gep_done: number;
};

type Props = {
  data: GepBarPoint[];
  weekLabel: string;
};

export function AdminGepBarChart({ data, weekLabel }: Props) {
  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">ГЭП факт по менеджерам</CardTitle>
        <CardDescription>
          Сумма gep_done за текущую неделю ({weekLabel}).
        </CardDescription>
      </CardHeader>
      <CardContent className="pl-0">
        <div className="h-[300px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="name"
                width={120}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                interval={0}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                  color: "var(--card-foreground)",
                }}
                formatter={(value) => [
                  typeof value === "number"
                    ? value.toLocaleString("ru-RU")
                    : value,
                  "ГЭП факт",
                ]}
              />
              <Bar
                dataKey="gep_done"
                fill="var(--chart-2)"
                radius={[0, 4, 4, 0]}
                maxBarSize={28}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
