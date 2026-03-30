import { DailyReportForm } from "@/components/DailyReportForm";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

export default async function DashboardPage() {
  const { profile } = await requireProfile();
  const supabase = await createClient();
  const today = todayISODate();

  const { data: todayReport } = await supabase
    .from("daily_reports")
    .select("*")
    .eq("manager_id", profile.id)
    .eq("report_date", today)
    .maybeSingle();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
        Дашборд менеджера
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Заполните KPI за день. Одна строка на дату — при повторном сохранении
        данные обновятся.
      </p>
      {todayReport && (
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          Сегодня уже есть отчёт: звонки {todayReport.calls_count}, ГЭП{" "}
          {todayReport.gep_done}/{todayReport.gep_planned}, КП {todayReport.cp_sent},
          сумма {todayReport.confirmed_sum}.
        </p>
      )}
      <DailyReportForm managerId={profile.id} defaultDate={today} />
    </div>
  );
}
