"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

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

export async function insertSupplierNote(
  supplierId: string,
  content: string,
): Promise<ActionResult> {
  const text = content.trim();
  if (!text) return { ok: false, error: "Пустая заметка" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Не авторизован" };

  const ok = await canAccessSupplier(supabase, user.id, supplierId);
  if (!ok) return { ok: false, error: "Нет доступа к поставщику" };

  const { error } = await supabase.from("supplier_notes").insert({
    supplier_id: supplierId,
    manager_id: user.id,
    content: text,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/suppliers");
  return { ok: true };
}
