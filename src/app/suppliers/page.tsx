import { AddSupplierForm } from "./AddSupplierForm";
import { SuppliersTable } from "@/components/suppliers/SuppliersTable";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function SuppliersPage() {
  const { profile } = await requireProfile();
  const supabase = await createClient();
  let query = supabase
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false });
  if (profile.role !== "admin") query = query.eq("manager_id", profile.id);
  const { data: suppliers, error } = await query;

  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
  const next = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const nextMonth = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;

  const { data: monthMetrics } = await supabase
    .from("client_month_metrics")
    .select("*")
    .in("month", [currentMonth, nextMonth]);

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <p className="text-sm text-destructive">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Поставщики</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Нормализованная CRM-модель: клиенты, месячные метрики и KPI по дням.
        </p>
      </div>
      <AddSupplierForm />
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Реестр</CardTitle>
          <CardDescription>
            По blur в ячейке сохраняются метрики месяца.
          </CardDescription>
        </CardHeader>
        <div className="px-6 pb-6">
          <SuppliersTable
            suppliers={suppliers ?? []}
            currentMonth={currentMonth}
            nextMonth={nextMonth}
            monthMetrics={monthMetrics ?? []}
          />
        </div>
      </Card>
    </div>
  );
}
