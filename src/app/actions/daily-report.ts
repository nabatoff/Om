"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  dailyReportFormSchema,
  parseConfirmedSumInput,
} from "@/lib/schemas/daily-report";
import { localISODate } from "@/lib/dates";

export type ActionResult = { ok: true; gep_done: number } | { ok: false; error: string };

export async function upsertDailyReport(
  input: unknown,
): Promise<ActionResult> {
  const parsed = dailyReportFormSchema.safeParse(input);
  if (!parsed.success) {
    const msg = parsed.error.flatten().fieldErrors;
    const first = Object.values(msg).flat()[0];
    return { ok: false, error: first ?? "Ошибка валидации" };
  }
  const v = parsed.data;
  let sum: number;
  try {
    sum = parseConfirmedSumInput(v.confirmed_sum);
    if (sum < 0) return { ok: false, error: "Сумма не может быть отрицательной" };
  } catch {
    return { ok: false, error: "Некорректная сумма" };
  }

  const today = localISODate();
  if (v.report_date > today) {
    return { ok: false, error: "Дата отчёта не может быть в будущем" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Не авторизован" };

  const { count, error: cErr } = await supabase
    .from("gep_events")
    .select("id", { count: "exact", head: true })
    .eq("manager_id", user.id)
    .eq("event_date", v.report_date);

  if (cErr) return { ok: false, error: cErr.message };
  const gepDone = count ?? 0;

  if (gepDone > v.gep_planned) {
    return {
      ok: false,
      error:
        "План ГЭП меньше числа уже зафиксированных презентаций. Увеличьте план или удалите лишние события (обратитесь к админу).",
    };
  }

  const { error } = await supabase.from("daily_reports").upsert(
    {
      manager_id: user.id,
      report_date: v.report_date,
      calls_count: v.calls_count,
      gep_planned: v.gep_planned,
      gep_done: gepDone,
      cp_sent: v.cp_sent,
      confirmed_sum: sum,
    },
    { onConflict: "manager_id,report_date" },
  );

  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  revalidatePath("/admin");
  return { ok: true, gep_done: gepDone };
}
