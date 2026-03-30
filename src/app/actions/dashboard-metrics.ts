"use server";

import { createClient } from "@/lib/supabase/server";
import {
  monthStartISO,
  sumCallsBeforeDateInMonth,
  workingDaysRemainingInMonth,
} from "@/lib/crm-formulas";

export type RollingTargetContext = {
  monthlyCallsTarget: number;
  sumCallsBeforeThisDay: number;
  workingDaysRemaining: number;
} | null;

export async function getRollingTargetContext(
  reportDate: string,
): Promise<RollingTargetContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("monthly_calls_target")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  const start = monthStartISO(reportDate);
  const [y, m] = reportDate.split("-").map(Number);
  const lastD = new Date(y, m, 0).getDate();
  const end = `${y}-${String(m).padStart(2, "0")}-${String(lastD).padStart(2, "0")}`;

  const { data: rows } = await supabase
    .from("daily_reports")
    .select("report_date, calls_count")
    .eq("manager_id", user.id)
    .gte("report_date", start)
    .lte("report_date", end);

  const sumBefore = sumCallsBeforeDateInMonth(rows ?? [], reportDate);
  const workingDaysRemaining = workingDaysRemainingInMonth(reportDate);

  return {
    monthlyCallsTarget: profile.monthly_calls_target,
    sumCallsBeforeThisDay: sumBefore,
    workingDaysRemaining,
  };
}
