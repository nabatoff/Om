import { AdminGepBarChart } from "@/components/admin/AdminGepBarChart";
import { AdminSalesChart } from "@/components/admin/AdminSalesChart";
import type { SalesChartPoint } from "@/components/admin/AdminSalesChart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth";
import { addDaysISO, currentWeekRangeISO, localISODate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

function buildLast7DaysSales(
  rows: { report_date: string; confirmed_sum: number | string }[],
): SalesChartPoint[] {
  const byDate = new Map<string, number>();
  for (const r of rows) {
    const d = r.report_date;
    const v = Number(r.confirmed_sum);
    byDate.set(d, (byDate.get(d) ?? 0) + (Number.isFinite(v) ? v : 0));
  }
  const today = localISODate();
  const out: SalesChartPoint[] = [];
  for (let i = 6; i >= 0; i--) {
    const date = addDaysISO(today, -i);
    const dt = new Date(date + "T12:00:00");
    out.push({
      date,
      label: dt.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }),
      total: byDate.get(date) ?? 0,
    });
  }
  return out;
}

export default async function AdminPage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data: suppliers, error: sErr } = await supabase
    .from("suppliers")
    .select("id, status, manager_id");

  const { data: reports, error: rErr } = await supabase
    .from("daily_reports")
    .select("gep_planned, gep_done, cp_sent, confirmed_sum, report_date");

  const week = currentWeekRangeISO();
  const { data: weekReports, error: wErr } = await supabase
    .from("daily_reports")
    .select("manager_id, gep_done, report_date")
    .gte("report_date", week.start)
    .lte("report_date", week.end);

  if (sErr || rErr || wErr) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <p className="text-sm text-destructive">
          {sErr?.message ?? rErr?.message ?? wErr?.message}
        </p>
      </div>
    );
  }

  const list = suppliers ?? [];
  const total = list.length;
  const qualified = list.filter((s) => s.status === "qualified").length;
  const conversionPct =
    total === 0 ? 0 : Math.round((qualified / total) * 1000) / 10;

  const byStatus = {
    new: list.filter((s) => s.status === "new").length,
    in_progress: list.filter((s) => s.status === "in_progress").length,
    qualified: qualified,
  };

  const repList = reports ?? [];
  const chartData = buildLast7DaysSales(repList);

  const gepPlannedSum = repList.reduce((a, r) => a + r.gep_planned, 0);
  const gepDoneSum = repList.reduce((a, r) => a + r.gep_done, 0);
  const gepConversionPct =
    gepPlannedSum === 0
      ? 0
      : Math.round((gepDoneSum / gepPlannedSum) * 1000) / 10;
  const cpTotal = repList.reduce((a, r) => a + r.cp_sent, 0);
  const sumConfirmed = repList.reduce(
    (a, r) => a + Number(r.confirmed_sum),
    0,
  );

  const managerIds = [...new Set(list.map((s) => s.manager_id).filter(Boolean))];
  const perManager = managerIds.map((mid) => {
    const mine = list.filter((s) => s.manager_id === mid);
    const q = mine.filter((s) => s.status === "qualified").length;
    const t = mine.length;
    return {
      id: mid as string,
      total: t,
      qualified: q,
      conv: t === 0 ? 0 : Math.round((q / t) * 1000) / 10,
    };
  });

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, role");

  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id, p.full_name || p.id.slice(0, 8)]),
  );

  const gepByManager = new Map<string, number>();
  for (const r of weekReports ?? []) {
    const mid = r.manager_id;
    gepByManager.set(mid, (gepByManager.get(mid) ?? 0) + r.gep_done);
  }
  const gepBarData = [...gepByManager.entries()]
    .map(([id, gep_done]) => ({
      name: nameById.get(id) ?? id.slice(0, 8),
      gep_done,
    }))
    .sort((a, b) => b.gep_done - a.gep_done);

  const weekStartFmt = new Date(week.start + "T12:00:00").toLocaleDateString(
    "ru-RU",
    { day: "numeric", month: "short" },
  );
  const weekEndFmt = new Date(week.end + "T12:00:00").toLocaleDateString(
    "ru-RU",
    { day: "numeric", month: "short" },
  );
  const weekLabel = `${weekStartFmt} — ${weekEndFmt}`;

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Админ: аналитика</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Воронка поставщиков и агрегаты по ежедневным отчётам.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>Конверсия в qualified</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{conversionPct}%</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {qualified} / {total}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>По статусам</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Новые: {byStatus.new}</p>
            <p>В работе: {byStatus.in_progress}</p>
            <p>Квалифицированы: {byStatus.qualified}</p>
          </CardContent>
        </Card>
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>ГЭП (сумма по отчётам)</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {gepConversionPct}%
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {gepDoneSum} / {gepPlannedSum} факт / план
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>КП и суммы</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>КП отправлено: {cpTotal}</p>
            <p>
              Подтверждённые суммы:{" "}
              {sumConfirmed.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}
            </p>
          </CardContent>
        </Card>
      </section>

      <AdminSalesChart data={chartData} />

      <AdminGepBarChart data={gepBarData} weekLabel={weekLabel} />

      <section>
        <h2 className="text-lg font-semibold tracking-tight">
          Конверсия по менеджерам
        </h2>
        <Card className="mt-4 border-border/80 shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Менеджер</TableHead>
                <TableHead>Всего</TableHead>
                <TableHead>Qualified</TableHead>
                <TableHead>Конверсия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {perManager.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-muted-foreground"
                  >
                    Нет данных по поставщикам
                  </TableCell>
                </TableRow>
              ) : (
                perManager.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      {nameById.get(row.id) ?? row.id.slice(0, 8)}
                    </TableCell>
                    <TableCell>{row.total}</TableCell>
                    <TableCell>{row.qualified}</TableCell>
                    <TableCell>{row.conv}%</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </section>
    </div>
  );
}
