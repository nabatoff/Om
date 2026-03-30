"use client";

import { useState } from "react";
import { toast } from "sonner";
import { addGepEvent } from "@/app/actions/gep-events";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { localISODate } from "@/lib/dates";

export type SupplierOption = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportDate: string;
  suppliers: SupplierOption[];
  disabled: boolean;
  disabledReason?: string;
  onSuccess: (newGepDone: number) => void;
};

export function GepAddDialog({
  open,
  onOpenChange,
  reportDate,
  suppliers,
  disabled,
  disabledReason,
  onSuccess,
}: Props) {
  const [eventDate, setEventDate] = useState(reportDate);
  const [supplierId, setSupplierId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const today = localISODate();

  async function handleSave() {
    if (!supplierId) {
      toast.error("Выберите поставщика");
      return;
    }
    setSaving(true);
    const res = await addGepEvent({
      event_date: eventDate,
      supplier_id: supplierId,
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Презентация ГЭП зафиксирована");
    onSuccess(res.gep_done);
    setSupplierId("");
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (o) setEventDate(reportDate);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Проведённый ГЭП</DialogTitle>
          <DialogDescription>
            Запись попадёт в журнал и увеличит «ГЭП факт» за выбранную дату.
            Статус поставщика станет «ГЭП проведён».
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="gep_event_date">Дата презентации</Label>
            <Input
              id="gep_event_date"
              type="date"
              max={today}
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Поставщик</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Выберите карточку" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    Нет поставщиков
                  </div>
                ) : (
                  suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || disabled || suppliers.length === 0}
          >
            {saving ? "Сохранение…" : "Сохранить"}
          </Button>
        </DialogFooter>
        {disabled && disabledReason && (
          <p className="text-xs text-muted-foreground">{disabledReason}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
