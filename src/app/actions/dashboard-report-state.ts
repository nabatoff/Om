"use server";

import { createClient } from "@/lib/supabase/server";

export type ReportDateState = {
  hasReport: boolean;
  gep_scheduled: number;
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
    .from("manager_daily_kpi")
    .select("gep_scheduled, gep_done")
    .eq("manager_id", user.id)
    .eq("report_date", reportDate)
    .maybeSingle();

  if (report) {
    return {
      hasReport: true,
      gep_scheduled: report.gep_scheduled,
      gep_done: report.gep_done,
    };
  }

  return {
    hasReport: false,
    gep_scheduled: 0,
    gep_done: 0,
  };
}
