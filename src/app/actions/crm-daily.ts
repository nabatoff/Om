"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { crmDailySaveSchema } from "@/lib/schemas/crm";
import type { CrmDailySaveInput } from "@/lib/schemas/crm";
import type { Tables } from "@/types/database";

export type ActionResult = { ok: true } | { ok: false; error: string };

type MeetingRow = {
  client_id: string;
  date: string;
  kind: "new" | "repeat";
  result?: string;
};

type OrderRow = {
  client_id: string;
  order_count: number;
  amounts: number[];
};

export type CrmReportPayload = {
  report_date: string;
  stats: {
    processed_total: number;
    new_in_work: number;
    calls_total: number;
    validated_total: number;
  };
  assigned_meetings: MeetingRow[];
  conducted_meetings: (MeetingRow & { result: string })[];
  confirmed_orders: OrderRow[];
};

function collectClientIds(v: CrmDailySaveInput) {
  const ids = new Set<string>();
  for (const m of v.assigned_meetings) ids.add(m.client_id);
  for (const m of v.conducted_meetings) ids.add(m.client_id);
  for (const o of v.confirmed_orders) ids.add(o.client_id);
  return [...ids];
}

export async function saveCrmDailyReport(
  input: unknown,
): Promise<ActionResult> {
  const parsed = crmDailySaveSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Ошибка валидации",
    };
  }
  const v = parsed.data;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Не авторизован" };

  const clientIds = collectClientIds(v);
  if (clientIds.length > 0) {
    const { data: okClients, error: cErr } = await supabase
      .from("clients")
      .select("id")
      .in("id", clientIds)
      .eq("manager_id", user.id);
    if (cErr) return { ok: false, error: cErr.message };
    if (!okClients || okClients.length !== clientIds.length) {
      return { ok: false, error: "Некорректные клиенты (не ваши)" };
    }
  }

  const { data: rep, error: upErr } = await supabase
    .from("crm_daily_reports")
    .upsert(
      {
        manager_id: user.id,
        report_date: v.report_date,
        processed_total: v.processed_total,
        new_in_work: v.new_in_work,
        calls_total: v.calls_total,
        validated_total: v.validated_total,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "manager_id,report_date" },
    )
    .select("id")
    .single();

  if (upErr || !rep) {
    return { ok: false, error: upErr?.message ?? "Не удалось сохранить отчёт" };
  }
  const reportId = rep.id;

  const { error: d1 } = await supabase
    .from("crm_planned_meetings")
    .delete()
    .eq("report_id", reportId);
  if (d1) return { ok: false, error: d1.message };

  const { error: d2 } = await supabase
    .from("crm_conducted_meetings")
    .delete()
    .eq("report_id", reportId);
  if (d2) return { ok: false, error: d2.message };

  const { error: d3 } = await supabase
    .from("crm_order_groups")
    .delete()
    .eq("report_id", reportId);
  if (d3) return { ok: false, error: d3.message };

  if (v.assigned_meetings.length > 0) {
    const { error: e1 } = await supabase.from("crm_planned_meetings").insert(
      v.assigned_meetings.map((m, i) => ({
        report_id: reportId,
        client_id: m.client_id,
        meeting_date: m.date,
        meeting_kind: m.kind,
        sort_order: i,
      })),
    );
    if (e1) return { ok: false, error: e1.message };
  }

  if (v.conducted_meetings.length > 0) {
    const { error: e2 } = await supabase.from("crm_conducted_meetings").insert(
      v.conducted_meetings.map((m, i) => ({
        report_id: reportId,
        client_id: m.client_id,
        meeting_date: m.date,
        meeting_kind: m.kind,
        result: m.result,
        sort_order: i,
      })),
    );
    if (e2) return { ok: false, error: e2.message };
  }

  for (let gi = 0; gi < v.confirmed_orders.length; gi++) {
    const o = v.confirmed_orders[gi];
    const { data: group, error: gErr } = await supabase
      .from("crm_order_groups")
      .insert({
        report_id: reportId,
        client_id: o.client_id,
        sort_order: gi,
      })
      .select("id")
      .single();
    if (gErr || !group) return { ok: false, error: gErr?.message ?? "Заказ" };
    const { error: lErr } = await supabase.from("crm_order_lines").insert(
      o.amounts.map((amount, li) => ({
        order_group_id: group.id,
        line_index: li,
        amount,
      })),
    );
    if (lErr) return { ok: false, error: lErr.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/admin");
  return { ok: true };
}

type DbPlanned = Tables<"crm_planned_meetings">;
type DbConducted = Tables<"crm_conducted_meetings">;
type DbGroup = Tables<"crm_order_groups"> & {
  crm_order_lines: Tables<"crm_order_lines">[] | null;
};

export async function loadMyCrmReportForDate(
  reportDate: string,
): Promise<CrmReportPayload | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("crm_daily_reports")
    .select(
      "id, report_date, processed_total, new_in_work, calls_total, validated_total, crm_planned_meetings(*), crm_conducted_meetings(*), crm_order_groups(*, crm_order_lines(*))",
    )
    .eq("manager_id", user.id)
    .eq("report_date", reportDate)
    .maybeSingle();

  if (error || !data) return null;

  const planned = (data.crm_planned_meetings as DbPlanned[] | null) ?? [];
  const conducted = (data.crm_conducted_meetings as DbConducted[] | null) ?? [];
  const groups = (data.crm_order_groups as DbGroup[] | null) ?? [];

  return {
    report_date: data.report_date,
    stats: {
      processed_total: data.processed_total,
      new_in_work: data.new_in_work,
      calls_total: data.calls_total,
      validated_total: data.validated_total,
    },
    assigned_meetings: planned
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((m) => ({
        client_id: m.client_id,
        date: m.meeting_date,
        kind: m.meeting_kind,
      })),
    conducted_meetings: conducted
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((m) => ({
        client_id: m.client_id,
        date: m.meeting_date,
        kind: m.meeting_kind,
        result: m.result,
      })),
    confirmed_orders: groups
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((g) => {
        const lines = [...(g.crm_order_lines ?? [])].sort(
          (a, b) => a.line_index - b.line_index,
        );
        const amounts = lines.map((l) => Number(l.amount));
        return {
          client_id: g.client_id,
          order_count: amounts.length,
          amounts: amounts.length ? amounts : [0],
        };
      }),
  };
}
