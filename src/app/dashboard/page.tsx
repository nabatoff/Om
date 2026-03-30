import { DailyReportForm } from "@/components/DailyReportForm";
import type { RollingContext } from "@/components/DailyReportForm";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import {
  monthStartISO,
  sumCallsBeforeDateInMonth,
  workingDaysRemainingInMonth,
} from "@/lib/crm-formulas";
import { localISODate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const { profile } = await requireProfile();
  const supabase = await createClient();
  const today = localISODate();

  const { data: fullProfile } = await supabase
    .from("profiles")
    .select("monthly_calls_target")
    .eq("id", profile.id)
    .single();

  const monthlyCallsTarget = fullProfile?.monthly_calls_target ?? 660;

  const start = monthStartISO(today);
  const [y, m] = today.split("-").map(Number);
  const lastD = new Date(y, m, 0).getDate();
  const end = `${y}-${String(m).padStart(2, "0")}-${String(lastD).padStart(2, "0")}`;

  const { data: monthRows } = await supabase
    .from("daily_reports")
    .select("report_date, calls_count, gep_planned, gep_done, cp_sent, confirmed_sum")
    .eq("manager_id", profile.id)
    .gte("report_date", start)
    .lte("report_date", end);

  const sumBefore = sumCallsBeforeDateInMonth(monthRows ?? [], today);
  const workingDaysRemaining = workingDaysRemainingInMonth(today);

  const initialRolling: RollingContext = {
    monthlyCallsTarget,
    sumCallsBeforeThisDay: sumBefore,
    workingDaysRemaining,
  };

  const { data: todayReport } = await supabase
    .from("daily_reports")
    .select("*")
    .eq("manager_id", profile.id)
    .eq("report_date", today)
    .maybeSingle();

  const initialValues = todayReport
    ? {
        report_date: todayReport.report_date,
        calls_count: todayReport.calls_count,
        gep_planned: todayReport.gep_planned,
        gep_done: todayReport.gep_done,
        cp_sent: todayReport.cp_sent,
        confirmed_sum: String(todayReport.confirmed_sum),
      }
    : undefined;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Дашборд менеджера</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Цель по звонкам считается от вашего monthly_calls_target и прогресса за
          месяц; бонус G5 снижает дневной лимит при ГЭП факт &gt; 2.
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
      <DailyReportForm
        defaultDate={today}
        initialValues={initialValues}
        initialRolling={initialRolling}
      />
    </div>
  );
}
