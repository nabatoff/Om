import { CrmReportWorkspace } from "@/components/crm/CrmReportWorkspace";
import { getDashboardCards } from "@/app/actions/dashboard-metrics";
import { requireProfile } from "@/lib/auth";
import { localISODate } from "@/lib/dates";
import { loadMyCrmReportForDate } from "@/app/actions/crm-daily";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const { profile } = await requireProfile();
  const supabase = await createClient();
  const today = localISODate();
  const cards = await getDashboardCards();

  const { data: clients } = await supabase
    .from("clients")
    .select("id, company_name")
    .eq("manager_id", profile.id)
    .order("company_name", { ascending: true });

  const initial = await loadMyCrmReportForDate(today);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="mx-auto max-w-7xl space-y-6 p-4 font-sans text-sm md:p-8">
        <CrmReportWorkspace
          userRole={profile.role === "admin" ? "admin" : "manager"}
          dailyCallGoal={profile.default_daily_calls_plan ?? 22}
          clients={(clients ?? []).map((c) => ({
            id: c.id,
            name: c.company_name,
          }))}
          defaultDate={today}
          initial={initial}
          kpiRow={
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Поставщики 10млн+", value: cards?.suppliers10mCount ?? 0 },
                { label: "Поставщики SKU 100+", value: cards?.suppliersSku100Count ?? 0 },
                { label: "План 10млн+ (%)", value: `${cards?.plan10mPercent ?? 0}%` },
                { label: "План SKU 100+ (%)", value: `${cards?.planSku100Percent ?? 0}%` },
              ].map((c) => (
                <div
                  key={c.label}
                  className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
                >
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                    {c.label}
                  </p>
                  <p className="mt-2 text-2xl font-bold tabular-nums text-gray-900">
                    {c.value}
                  </p>
                </div>
              ))}
            </section>
          }
        />
      </div>
    </div>
  );
}
