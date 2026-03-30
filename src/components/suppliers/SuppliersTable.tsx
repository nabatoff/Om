"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { SupplierCardDialog } from "@/components/suppliers/SupplierCardDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/client";
import { localISODate } from "@/lib/dates";
import type { Tables } from "@/types/database";

type Supplier = Tables<"suppliers">;

const STATUSES = [
  { value: "new", label: "Новый" },
  { value: "in_progress", label: "В работе" },
  { value: "qualified", label: "Квалифицирован" },
] as const;

function isOverdue(next: string | null): boolean {
  if (!next) return false;
  return next < localISODate();
}

type Props = {
  suppliers: Supplier[];
  currentUserId: string;
};

export function SuppliersTable({ suppliers: initial, currentUserId }: Props) {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dialogSupplier, setDialogSupplier] = useState<Supplier | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const sorted = useMemo(
    () =>
      [...suppliers].sort((a, b) => {
        const ao = isOverdue(a.next_contact_date);
        const bo = isOverdue(b.next_contact_date);
        if (ao !== bo) return ao ? -1 : 1;
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      }),
    [suppliers],
  );

  async function updateStatus(id: string, status: string) {
    setBusyId(id);
    const supabase = createClient();
    const { error } = await supabase
      .from("suppliers")
      .update({ status })
      .eq("id", id);
    setBusyId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSuppliers((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status } : s)),
    );
    router.refresh();
  }

  function openCard(s: Supplier) {
    setDialogSupplier(s);
    setDialogOpen(true);
  }

  function handleSupplierUpdated(updated: Supplier) {
    setSuppliers((prev) =>
      prev.map((s) => (s.id === updated.id ? updated : s)),
    );
    setDialogSupplier(updated);
    router.refresh();
  }

  if (suppliers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Поставщиков пока нет. Добавьте карточку формой выше.
      </p>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-border/80 bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Название</TableHead>
              <TableHead>БИН</TableHead>
              <TableHead>Категория</TableHead>
              <TableHead>След. контакт</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead className="w-[100px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((s) => {
              const overdue = isOverdue(s.next_contact_date);
              return (
                <TableRow
                  key={s.id}
                  className={
                    overdue
                      ? "bg-destructive/10 text-destructive dark:bg-destructive/15"
                      : undefined
                  }
                >
                  <TableCell className="font-medium">
                    <span className={overdue ? "text-destructive" : ""}>
                      {s.name}
                    </span>
                    {overdue && (
                      <Badge variant="overdue" className="ml-2 align-middle">
                        Просрочено
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{s.bin}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {s.category ?? "—"}
                  </TableCell>
                  <TableCell
                    className={
                      overdue
                        ? "font-medium text-destructive"
                        : "text-muted-foreground"
                    }
                  >
                    {s.next_contact_date
                      ? new Date(s.next_contact_date + "T12:00:00").toLocaleDateString(
                          "ru-RU",
                        )
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={s.status}
                      disabled={busyId === s.id}
                      onValueChange={(v) => void updateStatus(s.id, v)}
                    >
                      <SelectTrigger className="h-8 w-[150px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((st) => (
                          <SelectItem key={st.value} value={st.value}>
                            {st.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openCard(s)}
                    >
                      Карточка
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <SupplierCardDialog
        supplier={dialogSupplier}
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setDialogSupplier(null);
        }}
        currentUserId={currentUserId}
        onSupplierUpdated={handleSupplierUpdated}
      />
    </>
  );
}
