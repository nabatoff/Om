"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { clientSchema, monthMetricSchema } from "@/lib/schemas/crm";
import type { Tables } from "@/types/database";

type Client = Tables<"clients">;
type ActionResult = { ok: true; data?: Client } | { ok: false; error: string };

function asNull(v?: string) {
  return v && v.trim() ? v.trim() : null;
}

export async function insertSupplier(input: unknown): Promise<ActionResult> {
  const parsed = clientSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Ошибка валидации" };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Не авторизован" };

  const v = parsed.data;
  const { data, error } = await supabase
    .from("clients")
    .insert({
      manager_id: user.id,
      company_name: v.company_name.trim(),
      bin: v.bin.trim(),
      bitrix_url: asNull(v.bitrix_url),
      client_category: asNull(v.client_category),
      sales_volume_2025: v.sales_volume_2025,
      status: v.status,
      yearly_plan: v.yearly_plan,
      em_plan: v.em_plan,
      sales_department_description: asNull(v.sales_department_description),
      nkt_status: v.nkt_status,
      nkt_submitted_at: v.nkt_submitted_at || null,
      omarket_status: v.omarket_status ?? null,
      current_work_comment: asNull(v.current_work_comment),
      missing_requirement: v.missing_requirement ?? null,
      missing_requirement_comment: asNull(v.missing_requirement_comment),
      sales_legal_entity: asNull(v.sales_legal_entity),
      sku_count: v.sku_count,
    })
    .select("*")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/suppliers");
  revalidatePath("/dashboard");
  revalidatePath("/admin");
  return { ok: true, data };
}

export async function updateSupplierStatus(
  clientId: string,
  status: Client["status"],
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .update({ status })
    .eq("id", clientId)
    .select("*")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/suppliers");
  return { ok: true, data };
}

export async function upsertClientMonthMetric(input: unknown) {
  const parsed = monthMetricSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Ошибка валидации" };
  }
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("client_month_metrics").upsert(
    {
      client_id: v.client_id,
      month: v.month,
      delivered_amount: v.delivered_amount,
      potential_amount: v.potential_amount,
    },
    { onConflict: "client_id,month" },
  );
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/suppliers");
  revalidatePath("/dashboard");
  revalidatePath("/admin");
  return { ok: true as const };
}
