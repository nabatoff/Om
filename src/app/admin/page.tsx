import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AdminManagerDailyChart,
  type ManagerDailyPoint,
} from "@/components/admin/AdminManagerDailyChart";
import { getDashboardCards } from "@/app/actions/dashboard-metrics";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function AdminPage() {
  await requireAdmin();
  const cards = await getDashboardCards();
  const supabase = await createClient();
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
  const monthEnd = `${y}-${String(m).padStart(2, "0")}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("role", "manager")
    .order("full_name", { ascending: true });

  const { data: kpiRows } = await supabase
    .from("manager_daily_kpi")
    .select(
      "manager_id, report_date, actual_calls, qualified_count, gep_scheduled, repeat_meetings, cp_sent",
    )
    .gte("report_date", monthStart)
    .lte("report_date", monthEnd)
    .order("report_date", { ascending: true });

  const byManager = new Map<string, typeof kpiRows>();
  for (const row of kpiRows ?? []) {
    const arr = byManager.get(row.manager_id) ?? [];
    arr.push(row);
    byManager.set(row.manager_id, arr);
  }

  const managerCharts: { id: string; name: string; data: ManagerDailyPoint[] }[] = (profiles ?? []).map(
    (p) => {
      const rows = byManager.get(p.id) ?? [];
      const data = rows.map((r) => {
        const base = Math.max(r.actual_calls, 1);
        return {
          date: r.report_date.slice(5),
          qualifiedPct: Math.round((r.qualified_count / base) * 1000) / 10,
          gepScheduledPct: Math.round((r.gep_scheduled / base) * 1000) / 10,
          workStartedPct: Math.round((r.repeat_meetings / base) * 1000) / 10,
          cpSentPct: Math.round((r.cp_sent / base) * 1000) / 10,
        };
      });
      return {
        id: p.id,
        name: p.full_name || p.id.slice(0, 8),
        data,
      };
    },
  );

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Админ: аналитика</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          KPI по новой normalized-схеме.
        </p>
      </div>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>Поставщики 10млн+</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{cards?.suppliers10mCount ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>Поставщики SKU 100+</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{cards?.suppliersSku100Count ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>План 10млн+ (%)</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{cards?.plan10mPercent ?? 0}%</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>План SKU 100+ (%)</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{cards?.planSku100Percent ?? 0}%</CardTitle>
          </CardHeader>
          <CardContent><p className="text-xs text-muted-foreground">Формула: count / 5 * 100</p></CardContent>
        </Card>
      </section>
      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Графики по менеджерам</h2>
        <p className="text-sm text-muted-foreground">
          Как на примере: дневная динамика KPI в процентах.
        </p>
        <div className="grid gap-4">
          {managerCharts.map((m) => (
            <AdminManagerDailyChart key={m.id} managerName={m.name} data={m.data} />
          ))}
        </div>
      </section>
    </div>
  );
}
