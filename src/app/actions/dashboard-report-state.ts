"use server";

import { createClient } from "@/lib/supabase/server";

export type ReportDateState = {
  hasReport: boolean;
  gep_planned: number;
  gep_done: number;
} | null;

export async function getReportDateState(
  reportDate: string,
): Promise<ReportDateState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: report } = await supabase
    .from("daily_reports")
    .select("gep_planned, gep_done")
    .eq("manager_id", user.id)
    .eq("report_date", reportDate)
    .maybeSingle();

  const { count } = await supabase
    .from("gep_events")
    .select("id", { count: "exact", head: true })
    .eq("manager_id", user.id)
    .eq("event_date", reportDate);

  const fromEvents = count ?? 0;

  if (report) {
    return {
      hasReport: true,
      gep_planned: report.gep_planned,
      gep_done: fromEvents,
    };
  }

  return {
    hasReport: false,
    gep_planned: 0,
    gep_done: fromEvents,
  };
}
