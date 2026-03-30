"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

export type ActionResult = { ok: true; data?: Tables<"suppliers"> } | { ok: false; error: string };

async function canAccessSupplier(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  supplierId: string,
): Promise<boolean> {
  const { data: prof } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  if (prof?.role === "admin") return true;
  const { data: s } = await supabase
    .from("suppliers")
    .select("manager_id")
    .eq("id", supplierId)
    .single();
  return s?.manager_id === userId;
}

export async function updateSupplierStatus(
  supplierId: string,
  status: string,
): Promise<ActionResult> {
  const allowed = ["new", "in_progress", "gep_done", "qualified"];
  if (!allowed.includes(status)) {
    return { ok: false, error: "Недопустимый статус" };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Не авторизован" };
  const ok = await canAccessSupplier(supabase, user.id, supplierId);
  if (!ok) return { ok: false, error: "Нет доступа" };

  const { data, error } = await supabase
    .from("suppliers")
    .update({ status })
    .eq("id", supplierId)
    .select("*")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/suppliers");
  revalidatePath("/admin");
  return { ok: true, data: data as Tables<"suppliers"> };
}

export async function updateSupplierNextContact(
  supplierId: string,
  nextContactDate: string | null,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Не авторизован" };
  const ok = await canAccessSupplier(supabase, user.id, supplierId);
  if (!ok) return { ok: false, error: "Нет доступа" };

  const { data, error } = await supabase
    .from("suppliers")
    .update({ next_contact_date: nextContactDate })
    .eq("id", supplierId)
    .select("*")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/suppliers");
  return { ok: true, data: data as Tables<"suppliers"> };
}

const addSupplierSchema = {
  name: (s: string) => s.trim().length > 0,
  bin: (s: string) => s.trim().length > 0,
};

export async function insertSupplier(form: {
  name: string;
  bin: string;
  category: string;
  nkt_member: boolean;
  kz_quality_mark: boolean;
  sku_count: number;
  next_contact_date: string | null;
}): Promise<ActionResult> {
  if (!addSupplierSchema.name(form.name) || !addSupplierSchema.bin(form.bin)) {
    return { ok: false, error: "Название и БИН обязательны" };
  }
  if (form.sku_count < 0 || !Number.isInteger(form.sku_count)) {
    return { ok: false, error: "Кол-во SKU — целое ≥ 0" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Не авторизован" };

  const { data, error } = await supabase
    .from("suppliers")
    .insert({
      name: form.name.trim(),
      bin: form.bin.trim(),
      category: form.category.trim() || null,
      nkt_member: form.nkt_member,
      kz_quality_mark: form.kz_quality_mark,
      sku_count: form.sku_count,
      manager_id: user.id,
      status: "new",
      next_contact_date: form.next_contact_date,
    })
    .select("*")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/suppliers");
  revalidatePath("/admin");
  return { ok: true, data: data as Tables<"suppliers"> };
}
