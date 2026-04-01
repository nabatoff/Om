"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { dailyKpiSchema } from "@/lib/schemas/crm";

export type ActionResult =
  | { ok: true; planned_calls: number; carry_to_next_day: number }
  | { ok: false; error: string };

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function previousDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return isoDate(d);
}

export async function upsertDailyReport(
  input: unknown,
): Promise<ActionResult> {
  const parsed = dailyKpiSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Ошибка валидации" };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Не авторизован" };

  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("default_daily_calls_plan")
    .eq("id", user.id)
    .single();
  if (pErr) return { ok: false, error: pErr.message };

  const basePlan = profile?.default_daily_calls_plan ?? 22;
  const prevDate = previousDate(v.report_date);
  const { data: prevDay } = await supabase
    .from("manager_daily_kpi")
    .select("carry_to_next_day")
    .eq("manager_id", user.id)
    .eq("report_date", prevDate)
    .maybeSingle();

  const gepBonus = v.gep_done > 2 ? 10 : 0;
  const plannedCalls = Math.max(0, basePlan - gepBonus + (prevDay?.carry_to_next_day ?? 0));
  const carryToNextDay = Math.max(0, plannedCalls - v.actual_calls);

  const { error } = await supabase.from("manager_daily_kpi").upsert(
    {
      manager_id: user.id,
      report_date: v.report_date,
      planned_calls: plannedCalls,
      actual_calls: v.actual_calls,
      qualified_count: v.qualified_count,
      gep_scheduled: v.gep_scheduled,
      gep_done: v.gep_done,
      cp_sent: v.cp_sent,
      repeat_meetings: v.repeat_meetings,
      confirmed_orders_sum: v.confirmed_orders_sum,
      carry_to_next_day: carryToNextDay,
    },
    { onConflict: "manager_id,report_date" },
  );

  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  revalidatePath("/admin");
  return { ok: true, planned_calls: plannedCalls, carry_to_next_day: carryToNextDay };
}
