"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { SupplierCardDialog } from "@/components/suppliers/SupplierCardDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
import {
  updateSupplierNextContact,
  updateSupplierStatus,
} from "@/app/actions/suppliers";
import { isReadyForQualification } from "@/lib/crm-formulas";
import { isContactToday, localISODate, needsCallToday } from "@/lib/dates";
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

function SupplierNextContactControls({
  supplier,
  compact,
  onUpdated,
}: {
  supplier: Supplier;
  compact?: boolean;
  onUpdated: (s: Supplier) => void;
}) {
  const [value, setValue] = useState(supplier.next_contact_date ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await updateSupplierNextContact(
      supplier.id,
      value === "" ? null : value,
    );
    setSaving(false);
    if (!res.ok) {
      toast.error("Не удалось сохранить дату", { description: res.error });
      return;
    }
    if (res.data) onUpdated(res.data);
    toast.success("Дата следующего звонка сохранена");
  }

  return (
    <div
      className={
        compact
          ? "flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
          : "flex flex-wrap items-center gap-2"
      }
    >
      <InputDate
        value={value}
        onChange={setValue}
        className={compact ? "w-full max-w-[11rem]" : "max-w-[11rem]"}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setValue("")}
        >
          Очистить
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => void save()}
          disabled={saving}
        >
          {saving ? "…" : "OK"}
        </Button>
      </div>
    </div>
  );
}

function InputDate({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={
        "h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
        (className ?? "")
      }
    />
  );
}

type Props = {
  suppliers: Supplier[];
};

export function SuppliersTable({ suppliers: initial }: Props) {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dialogSupplier, setDialogSupplier] = useState<Supplier | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filterCallToday, setFilterCallToday] = useState(false);

  useEffect(() => {
    setSuppliers(initial);
  }, [initial]);

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

  const visible = useMemo(() => {
    if (!filterCallToday) return sorted;
    const today = localISODate();
    return sorted.filter((s) => needsCallToday(s.next_contact_date, today));
  }, [sorted, filterCallToday]);

  async function updateStatus(id: string, status: string) {
    setBusyId(id);
    const res = await updateSupplierStatus(id, status);
    setBusyId(null);
    if (!res.ok) {
      toast.error("Не удалось обновить статус", { description: res.error });
      return;
    }
    if (res.data) {
      setSuppliers((prev) =>
        prev.map((s) => (s.id === id ? res.data! : s)),
      );
    } else {
      setSuppliers((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status } : s)),
      );
    }
    toast.success("Статус обновлён");
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
    setDialogSupplier((d) => (d?.id === updated.id ? updated : d));
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
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Checkbox
            id="filter-call"
            checked={filterCallToday}
            onCheckedChange={(v) => setFilterCallToday(v === true)}
          />
          <Label htmlFor="filter-call" className="cursor-pointer font-normal">
            Нужно позвонить сегодня (просрочено или сегодня)
          </Label>
        </div>
        {filterCallToday && (
          <p className="text-sm text-muted-foreground">
            Показано: {visible.length} из {suppliers.length}
          </p>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Нет карточек по этому фильтру.
        </p>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="flex flex-col gap-3 md:hidden">
            {visible.map((s) => {
              const overdue = isOverdue(s.next_contact_date);
              const callToday = isContactToday(s.next_contact_date);
              const urgent = needsCallToday(s.next_contact_date);
              const ready = isReadyForQualification(s);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => openCard(s)}
                  className={
                    "w-full rounded-xl border border-border/80 bg-card p-4 text-left shadow-sm transition-colors hover:bg-muted/40 " +
                    (urgent
                      ? "border-destructive/50 bg-destructive/10"
                      : "")
                  }
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p
                        className={
                          "font-medium " +
                          (overdue ? "text-destructive" : "text-foreground")
                        }
                      >
                        {s.name}
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                        {s.bin}
                      </p>
                    </div>
                    {overdue && <Badge variant="overdue">Просрочено</Badge>}
                    {callToday && <Badge variant="destructive">Сегодня</Badge>}
                    {ready && (
                      <Badge className="border-amber-500/50 bg-amber-500/15 text-amber-900 dark:text-amber-100">
                        К квалификации
                      </Badge>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {s.category ?? "Без категории"}
                    {s.sku_count > 0 && (
                      <span className="ml-2 text-xs">· SKU {s.sku_count}</span>
                    )}
                  </p>
                  <div
                    className="mt-3 space-y-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <p className="text-xs font-medium text-muted-foreground">
                      Следующий звонок
                    </p>
                    <SupplierNextContactControls
                      key={`nc-${s.id}-${s.next_contact_date ?? ""}`}
                      supplier={s}
                      compact
                      onUpdated={handleSupplierUpdated}
                    />
                    <div className="pt-1">
                      <Select
                        value={s.status}
                        disabled={busyId === s.id}
                        onValueChange={(v) => void updateStatus(s.id, v)}
                      >
                        <SelectTrigger className="h-10 w-full">
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
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-primary">
                    Нажмите карточку для заметок и деталей →
                  </p>
                </button>
              );
            })}
          </div>

          {/* Desktop: table */}
          <div className="hidden rounded-xl border border-border/80 bg-card shadow-sm md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Название</TableHead>
                  <TableHead>БИН</TableHead>
                  <TableHead>Категория</TableHead>
                  <TableHead className="w-[72px]">SKU</TableHead>
                  <TableHead className="min-w-[220px]">
                    След. звонок
                  </TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead className="w-[100px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((s) => {
                  const overdue = isOverdue(s.next_contact_date);
                  const todayRow = isContactToday(s.next_contact_date);
                  const urgent = needsCallToday(s.next_contact_date);
                  const ready = isReadyForQualification(s);
                  return (
                    <TableRow
                      key={s.id}
                      className={
                        urgent
                          ? "bg-destructive/10 text-destructive dark:bg-destructive/15"
                          : undefined
                      }
                    >
                      <TableCell className="font-medium">
                        <span className={urgent ? "text-destructive" : ""}>
                          {s.name}
                        </span>
                        {overdue && (
                          <Badge variant="overdue" className="ml-2 align-middle">
                            Просрочено
                          </Badge>
                        )}
                        {todayRow && !overdue && (
                          <Badge variant="destructive" className="ml-2 align-middle">
                            Сегодня
                          </Badge>
                        )}
                        {ready && (
                          <Badge
                            className="ml-2 align-middle border-amber-500/50 bg-amber-500/15 text-amber-900 dark:text-amber-100"
                          >
                            К квалификации
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{s.bin}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {s.category ?? "—"}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {s.sku_count}
                      </TableCell>
                      <TableCell
                        className="align-top"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <SupplierNextContactControls
                          key={`nc-${s.id}-${s.next_contact_date ?? ""}`}
                          supplier={s}
                          onUpdated={handleSupplierUpdated}
                        />
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
        </>
      )}

      <SupplierCardDialog
        supplier={dialogSupplier}
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setDialogSupplier(null);
        }}
        onSupplierUpdated={handleSupplierUpdated}
      />
    </div>
  );
}
