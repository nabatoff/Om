import { DailyReportForm } from "@/components/DailyReportForm";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { localISODate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const { profile } = await requireProfile();
  const supabase = await createClient();
  const today = localISODate();

  const { data: todayReport } = await supabase
    .from("daily_reports")
    .select("*")
    .eq("manager_id", profile.id)
    .eq("report_date", today)
    .maybeSingle();

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Дашборд менеджера</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Одна строка на дату — повторное сохранение обновляет KPI. Сумма продаж
          обязательна и не может быть отрицательной.
        </p>
      </div>
      {todayReport && (
        <Card className="border-border/80 bg-muted/30 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Сегодня в базе</CardTitle>
            <CardDescription>
              Звонки {todayReport.calls_count} · ГЭП {todayReport.gep_done}/
              {todayReport.gep_planned} · КП {todayReport.cp_sent} · сумма{" "}
              {Number(todayReport.confirmed_sum).toLocaleString("ru-RU")}
            </CardDescription>
          </CardHeader>
        </Card>
      )}
      <DailyReportForm managerId={profile.id} defaultDate={today} />
    </div>
  );
}
