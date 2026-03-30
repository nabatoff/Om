import { AddSupplierForm } from "./AddSupplierForm";
import { SupplierStatusTable } from "@/components/SupplierStatusTable";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function SuppliersPage() {
  await requireProfile();
  const supabase = await createClient();
  const { data: suppliers, error } = await supabase
    .from("suppliers")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <p className="text-red-600 dark:text-red-400">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
        Поставщики
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Список с учётом RLS: менеджер видит только свои карточки, админ — все.
      </p>
      <AddSupplierForm />
      <div className="mt-8">
        <SupplierStatusTable suppliers={suppliers ?? []} />
      </div>
    </div>
  );
}
