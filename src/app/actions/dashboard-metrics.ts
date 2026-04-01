"use server";

import { createClient } from "@/lib/supabase/server";
import { localISODate } from "@/lib/dates";

export type DashboardCards = {
  suppliers10mCount: number;
  suppliersSku100Count: number;
  plan10mPercent: number;
  planSku100Percent: number;
};

export async function getDashboardCards(): Promise<DashboardCards | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile) return null;

  const isAdmin = profile.role === "admin";
  const today = localISODate();
  const month = `${today.slice(0, 7)}-01`;

  let query = supabase.from("clients").select("id, sku_count, manager_id");
  if (!isAdmin) {
    query = query.eq("manager_id", user.id);
  }
  const { data: clients, error: cErr } = await query;
  if (cErr) return null;

  const clientIds = (clients ?? []).map((c) => c.id);
  let metricQuery = supabase
    .from("client_month_metrics")
    .select("client_id, delivered_amount, month")
    .eq("month", month);
  if (clientIds.length > 0) {
    metricQuery = metricQuery.in("client_id", clientIds);
  }
  const { data: metrics } = await metricQuery;

  const deliveredByClient = new Map<string, number>();
  for (const row of metrics ?? []) {
    deliveredByClient.set(row.client_id, Number(row.delivered_amount) || 0);
  }
  const suppliers10mCount = (clients ?? []).filter(
    (c) => (deliveredByClient.get(c.id) ?? 0) >= 10_000_000,
  ).length;
  const suppliersSku100Count = (clients ?? []).filter((c) => c.sku_count >= 100).length;

  return {
    suppliers10mCount,
    suppliersSku100Count,
    plan10mPercent: Math.round((suppliers10mCount / 5) * 10000) / 100,
    planSku100Percent: Math.round((suppliersSku100Count / 5) * 10000) / 100,
  };
}
