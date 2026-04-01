import { DailyReportForm } from "@/components/DailyReportForm";
import {
  Card,
  CardDescription,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { localISODate } from "@/lib/dates";
import { getDashboardCards } from "@/app/actions/dashboard-metrics";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const { profile } = await requireProfile();
  const supabase = await createClient();
  const today = localISODate();
  const cards = await getDashboardCards();
  const [y, m] = today.split("-").map(Number);
  const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
  const monthEnd = `${y}-${String(m).padStart(2, "0")}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;

  const { data: todayReport } = await supabase
    .from("manager_daily_kpi")
    .select("*")
    .eq("manager_id", profile.id)
    .eq("report_date", today)
    .maybeSingle();
  const { data: monthRows } = await supabase
    .from("manager_daily_kpi")
    .select(
      "report_date, planned_calls, actual_calls, qualified_count, gep_scheduled, gep_done, cp_sent, repeat_meetings, confirmed_orders_sum, carry_to_next_day",
    )
    .eq("manager_id", profile.id)
    .gte("report_date", monthStart)
    .lte("report_date", monthEnd)
    .order("report_date", { ascending: true });
  const { data: clients } = await supabase
    .from("clients")
    .select("id, company_name")
    .eq("manager_id", profile.id)
    .order("company_name", { ascending: true });

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Дашборд менеджера</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          KPI по клиентам и ежедневный отчет.
        </p>
      </div>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2"><CardDescription>Поставщики 10млн+</CardDescription></CardHeader>
          <CardContent><CardTitle>{cards?.suppliers10mCount ?? 0}</CardTitle></CardContent>
        </Card>
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2"><CardDescription>Поставщики SKU 100+</CardDescription></CardHeader>
          <CardContent><CardTitle>{cards?.suppliersSku100Count ?? 0}</CardTitle></CardContent>
        </Card>
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2"><CardDescription>План 10млн+ (%)</CardDescription></CardHeader>
          <CardContent><CardTitle>{cards?.plan10mPercent ?? 0}%</CardTitle></CardContent>
        </Card>
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2"><CardDescription>План SKU 100+ (%)</CardDescription></CardHeader>
          <CardContent><CardTitle>{cards?.planSku100Percent ?? 0}%</CardTitle></CardContent>
        </Card>
      </section>
      {todayReport && (
        <Card className="border-border/80 bg-muted/30 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Сегодня в базе</CardTitle>
            <CardDescription>
              План звонков {todayReport.planned_calls} · Факт {todayReport.actual_calls} · ГЭП {todayReport.gep_done} · перенос {todayReport.carry_to_next_day}
            </CardDescription>
          </CardHeader>
        </Card>
      )}
      <DailyReportForm
        defaultDate={today}
        monthRows={monthRows ?? []}
        clients={(clients ?? []).map((c) => ({ id: c.id, name: c.company_name }))}
      />
    </div>
  );
}
