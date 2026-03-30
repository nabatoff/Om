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
  const { data: suppliers, error } = await supabase
    .from("suppliers")
    .select("*")
    .order("created_at", { ascending: false });

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
          RLS: менеджер видит свои карточки, админ — все. Просроченный следующий
          контакт подсвечивается.
        </p>
      </div>
      <AddSupplierForm />
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Реестр</CardTitle>
          <CardDescription>
            Статус меняется в строке; заметки и дата звонка — в карточке.
          </CardDescription>
        </CardHeader>
        <div className="px-6 pb-6">
          <SuppliersTable
            suppliers={suppliers ?? []}
            currentUserId={profile.id}
          />
        </div>
      </Card>
    </div>
  );
}
