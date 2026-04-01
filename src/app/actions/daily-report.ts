"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { dailyKpiSchema } from "@/lib/schemas/crm";

export type ActionResult =
  | { ok: true; planned_calls: number; carry_to_next_day: number }
  | { ok: false; error: string };

export type AddGepResult =
  | { ok: true; report_date: string; gep_done: number; planned_calls: number; carry_to_next_day: number }
  | { ok: false; error: string };

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function previousDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return isoDate(d);
}

async function calcPlanAndCarry(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  reportDate: string;
  gepDone: number;
  actualCalls: number;
}) {
  const { supabase, userId, reportDate, gepDone, actualCalls } = params;
  const { data: profile } = await supabase
    .from("profiles")
    .select("default_daily_calls_plan")
    .eq("id", userId)
    .single();
  const basePlan = profile?.default_daily_calls_plan ?? 22;

  const prevDate = previousDate(reportDate);
  const { data: prevDay } = await supabase
    .from("manager_daily_kpi")
    .select("carry_to_next_day")
    .eq("manager_id", userId)
    .eq("report_date", prevDate)
    .maybeSingle();
  const sameMonthAsPrev = prevDate.slice(0, 7) === reportDate.slice(0, 7);
  const prevCarry = sameMonthAsPrev ? (prevDay?.carry_to_next_day ?? 0) : 0;
  const gepBonus = gepDone > 2 ? 10 : 0;
  const plannedCalls = Math.max(0, basePlan - gepBonus + prevCarry);
  const carryToNextDay = Math.max(0, plannedCalls - actualCalls);
  return { plannedCalls, carryToNextDay };
}

export async function upsertDailyReport(
  input: unknown,
): Promise<ActionResult> {
  const parsed = dailyKpiSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Ошибка валидации" };
  }
  const v = parsed.data;
  if (v.gep_done > v.gep_scheduled) {
    return { ok: false, error: "Проведен ГЭП не может быть больше назначено ГЭП" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Не авторизован" };

  const { plannedCalls, carryToNextDay } = await calcPlanAndCarry({
    supabase,
    userId: user.id,
    reportDate: v.report_date,
    gepDone: v.gep_done,
    actualCalls: v.actual_calls,
  });

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

export async function addGepDoneEvent(input: {
  report_date: string;
  client_id: string;
}): Promise<AddGepResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Не авторизован" };

  const { data: client, error: cErr } = await supabase
    .from("clients")
    .select("id, manager_id")
    .eq("id", input.client_id)
    .single();
  if (cErr || !client || client.manager_id !== user.id) {
    return { ok: false, error: "Клиент не найден или нет доступа" };
  }

  const { data: existing } = await supabase
    .from("manager_daily_kpi")
    .select("*")
    .eq("manager_id", user.id)
    .eq("report_date", input.report_date)
    .maybeSingle();

  const gepScheduled = existing?.gep_scheduled ?? 0;
  const { count: currentCount, error: cntErr } = await supabase
    .from("client_gep_events")
    .select("id", { count: "exact", head: true })
    .eq("manager_id", user.id)
    .eq("event_date", input.report_date);
  if (cntErr) return { ok: false, error: cntErr.message };
  const nextGepDone = (currentCount ?? 0) + 1;
  if (nextGepDone > gepScheduled) {
    return { ok: false, error: "Нельзя добавить: проведен ГЭП станет больше назначенного на день" };
  }
  const { error: insErr } = await supabase.from("client_gep_events").insert({
    manager_id: user.id,
    client_id: input.client_id,
    event_date: input.report_date,
  });
  if (insErr) return { ok: false, error: insErr.message };
  const gepDone = nextGepDone;

  const actualCalls = existing?.actual_calls ?? 0;
  const qualifiedCount = existing?.qualified_count ?? 0;
  const cpSent = existing?.cp_sent ?? 0;
  const repeatMeetings = existing?.repeat_meetings ?? 0;
  const confirmedOrdersSum = existing?.confirmed_orders_sum ?? 0;

  const { plannedCalls, carryToNextDay } = await calcPlanAndCarry({
    supabase,
    userId: user.id,
    reportDate: input.report_date,
    gepDone,
    actualCalls,
  });

  const { error: upsertErr } = await supabase.from("manager_daily_kpi").upsert(
    {
      manager_id: user.id,
      report_date: input.report_date,
      planned_calls: plannedCalls,
      actual_calls: actualCalls,
      qualified_count: qualifiedCount,
      gep_scheduled: gepScheduled,
      gep_done: gepDone,
      cp_sent: cpSent,
      repeat_meetings: repeatMeetings,
      confirmed_orders_sum: confirmedOrdersSum,
      carry_to_next_day: carryToNextDay,
    },
    { onConflict: "manager_id,report_date" },
  );
  if (upsertErr) return { ok: false, error: upsertErr.message };

  revalidatePath("/dashboard");
  return {
    ok: true,
    report_date: input.report_date,
    gep_done: gepDone,
    planned_calls: plannedCalls,
    carry_to_next_day: carryToNextDay,
  };
}
