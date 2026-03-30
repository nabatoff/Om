"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { localISODate } from "@/lib/dates";

export type ActionResult =
  | { ok: true; gep_done: number }
  | { ok: false; error: string };

export async function addGepEvent(input: {
  event_date: string;
  supplier_id: string;
}): Promise<ActionResult> {
  const today = localISODate();
  if (input.event_date > today) {
    return { ok: false, error: "Дата презентации не может быть в будущем" };
  }
  if (!input.supplier_id?.trim()) {
    return { ok: false, error: "Выберите поставщика" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Не авторизован" };

  const { data: supplier, error: sErr } = await supabase
    .from("suppliers")
    .select("id, manager_id")
    .eq("id", input.supplier_id)
    .single();
  if (sErr || !supplier || supplier.manager_id !== user.id) {
    return { ok: false, error: "Поставщик не найден или нет доступа" };
  }

  const { data: report, error: rErr } = await supabase
    .from("daily_reports")
    .select("id, gep_planned, gep_done")
    .eq("manager_id", user.id)
    .eq("report_date", input.event_date)
    .maybeSingle();

  if (rErr) return { ok: false, error: rErr.message };
  if (!report) {
    return {
      ok: false,
      error:
        "Сначала сохраните отчёт за эту дату и укажите план ГЭП (gep_planned)",
    };
  }

  const { count, error: cErr } = await supabase
    .from("gep_events")
    .select("id", { count: "exact", head: true })
    .eq("manager_id", user.id)
    .eq("event_date", input.event_date);

  if (cErr) return { ok: false, error: cErr.message };
  const current = count ?? 0;
  if (current >= report.gep_planned) {
    return {
      ok: false,
      error: "Лимит запланированных ГЭП исчерпан",
    };
  }

  const { error: iErr } = await supabase.from("gep_events").insert({
    manager_id: user.id,
    supplier_id: input.supplier_id,
    event_date: input.event_date,
  });
  if (iErr) return { ok: false, error: iErr.message };

  const nextDone = current + 1;
  const { error: uErr } = await supabase
    .from("daily_reports")
    .update({ gep_done: nextDone })
    .eq("id", report.id);
  if (uErr) return { ok: false, error: uErr.message };

  const { error: stErr } = await supabase
    .from("suppliers")
    .update({ status: "gep_done" })
    .eq("id", input.supplier_id);
  if (stErr) return { ok: false, error: stErr.message };

  revalidatePath("/dashboard");
  revalidatePath("/suppliers");
  revalidatePath("/admin");
  return { ok: true, gep_done: nextDone };
}

export async function countGepEventsForDate(
  reportDate: string,
): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;
  const { count, error } = await supabase
    .from("gep_events")
    .select("id", { count: "exact", head: true })
    .eq("manager_id", user.id)
    .eq("event_date", reportDate);
  if (error) return 0;
  return count ?? 0;
}
