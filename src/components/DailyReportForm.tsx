"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { addGepDoneEvent, upsertDailyReport } from "@/app/actions/daily-report";
import { createQuickClientByName } from "@/app/actions/suppliers";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { localISODate } from "@/lib/dates";

type DailyRow = {
  report_date: string;
  planned_calls: number;
  actual_calls: number;
  qualified_count: number;
  gep_scheduled: number;
  gep_done: number;
  cp_sent: number;
  repeat_meetings: number;
  confirmed_orders_sum: number;
  carry_to_next_day: number;
};

type Props = {
  defaultDate?: string;
  monthRows: DailyRow[];
  clients: { id: string; name: string }[];
};

type EditableRow = Omit<DailyRow, "report_date">;

function daysOfMonth(isoDate: string): string[] {
  const [y, m] = isoDate.split("-").map(Number);
  const total = new Date(y, m, 0).getDate();
  return Array.from(
    { length: total },
    (_, i) => `${y}-${String(m).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`,
  );
}

export function DailyReportForm({ defaultDate, monthRows, clients }: Props) {
  const baseDate = defaultDate ?? localISODate();
  const dates = daysOfMonth(baseDate);
  const initial = new Map<string, EditableRow>();
  for (const d of dates) {
    initial.set(d, {
      planned_calls: 22,
      actual_calls: 0,
      qualified_count: 0,
      gep_scheduled: 0,
      gep_done: 0,
      cp_sent: 0,
      repeat_meetings: 0,
      confirmed_orders_sum: 0,
      carry_to_next_day: 0,
    });
  }
  for (const row of monthRows) {
    initial.set(row.report_date, {
      planned_calls: row.planned_calls,
      actual_calls: row.actual_calls,
      qualified_count: row.qualified_count,
      gep_scheduled: row.gep_scheduled,
      gep_done: row.gep_done,
      cp_sent: row.cp_sent,
      repeat_meetings: row.repeat_meetings,
      confirmed_orders_sum: Number(row.confirmed_orders_sum) || 0,
      carry_to_next_day: row.carry_to_next_day,
    });
  }

  const [rows, setRows] = useState<Record<string, EditableRow>>(
    Object.fromEntries(initial.entries()),
  );
  const [savingDate, setSavingDate] = useState<string | null>(null);
  const [savedAtByDate, setSavedAtByDate] = useState<Record<string, number>>({});
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [gepModalOpen, setGepModalOpen] = useState(false);
  const [gepDate, setGepDate] = useState(baseDate);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [quickName, setQuickName] = useState("");
  const [quickClients, setQuickClients] = useState(clients);
  const [addingGep, setAddingGep] = useState(false);

  useEffect(() => {
    return () => {
      for (const timer of Object.values(saveTimersRef.current)) {
        clearTimeout(timer);
      }
    };
  }, []);

  async function persistRow(reportDate: string, v: EditableRow) {
    setSavingDate(reportDate);
    const res = await upsertDailyReport({
      report_date: reportDate,
      actual_calls: v.actual_calls,
      qualified_count: v.qualified_count,
      gep_scheduled: v.gep_scheduled,
      gep_done: v.gep_done,
      cp_sent: v.cp_sent,
      repeat_meetings: v.repeat_meetings,
      confirmed_orders_sum: v.confirmed_orders_sum,
    });
    setSavingDate(null);
    if (!res.ok) {
      toast.error("Не удалось сохранить", { description: res.error });
      return;
    }
    setRows((prev) => ({
      ...prev,
      [reportDate]: {
        ...prev[reportDate],
        planned_calls: res.planned_calls,
        carry_to_next_day: res.carry_to_next_day,
      },
    }));
    setSavedAtByDate((prev) => ({ ...prev, [reportDate]: Date.now() }));
  }

  function queueRowSave(reportDate: string, nextRow: EditableRow) {
    const prevTimer = saveTimersRef.current[reportDate];
    if (prevTimer) clearTimeout(prevTimer);
    saveTimersRef.current[reportDate] = setTimeout(() => {
      void persistRow(reportDate, nextRow);
    }, 450);
  }

  function updateField(
    date: string,
    key: keyof EditableRow,
    value: number,
  ) {
    setRows((prev) => {
      const nextRow = { ...prev[date], [key]: value };
      queueRowSave(date, nextRow);
      return { ...prev, [date]: nextRow };
    });
  }

  async function onAddQuickClient() {
    const res = await createQuickClientByName(quickName);
    if (!res.ok) {
      toast.error("Не удалось добавить клиента", { description: res.error });
      return;
    }
    setQuickName("");
    const nextClient = { id: res.data.id, name: res.data.company_name };
    setQuickClients((prev) => [nextClient, ...prev]);
    setSelectedClientId(nextClient.id);
    toast.success("Клиент создан");
  }

  async function onAddGep() {
    if (!selectedClientId) {
      toast.error("Выберите клиента");
      return;
    }
    setAddingGep(true);
    const res = await addGepDoneEvent({
      report_date: gepDate,
      client_id: selectedClientId,
    });
    setAddingGep(false);
    if (!res.ok) {
      toast.error("Не удалось добавить ГЭП", { description: res.error });
      return;
    }
    setRows((prev) => ({
      ...prev,
      [res.report_date]: {
        ...(prev[res.report_date] ?? {
          planned_calls: 22,
          actual_calls: 0,
          qualified_count: 0,
          gep_scheduled: 0,
          gep_done: 0,
          cp_sent: 0,
          repeat_meetings: 0,
          confirmed_orders_sum: 0,
          carry_to_next_day: 0,
        }),
        gep_done: res.gep_done,
        planned_calls: res.planned_calls,
        carry_to_next_day: res.carry_to_next_day,
      },
    }));
    setSavedAtByDate((prev) => ({ ...prev, [res.report_date]: Date.now() }));
    setGepModalOpen(false);
    toast.success("ГЭП добавлен");
  }

  return (
    <Card className="border-border/80 shadow-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-lg">Ежедневный KPI-отчет</CardTitle>
          <CardDescription>
          Таблица за текущий месяц. Перенос хвоста обнуляется на 1-е число нового месяца.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex justify-end">
            <Dialog open={gepModalOpen} onOpenChange={setGepModalOpen}>
              <DialogTrigger asChild>
                <Button type="button" variant="secondary">
                  + Проведен ГЭП
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Добавить +1 к проведен ГЭП</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="gep-date">Дата</Label>
                    <Input
                      id="gep-date"
                      type="date"
                      value={gepDate}
                      onChange={(e) => setGepDate(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Клиент</Label>
                    <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Выберите клиента" />
                      </SelectTrigger>
                      <SelectContent>
                        {quickClients.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2 rounded-md border p-3">
                    <Label htmlFor="quick-name">Нет в списке? Добавить нового</Label>
                    <div className="flex gap-2">
                      <Input
                        id="quick-name"
                        value={quickName}
                        onChange={(e) => setQuickName(e.target.value)}
                        placeholder="Только название клиента"
                      />
                      <Button type="button" variant="outline" onClick={() => void onAddQuickClient()}>
                        Добавить
                      </Button>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button type="button" onClick={() => void onAddGep()} disabled={addingGep}>
                      {addingGep ? "Добавление..." : "Добавить +1"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Дата</TableHead>
                  <TableHead>План звонков</TableHead>
                  <TableHead>Факт</TableHead>
                  <TableHead>Квалификация</TableHead>
                  <TableHead>Назн. ГЭП</TableHead>
                  <TableHead>Пров. ГЭП</TableHead>
                  <TableHead>ЦП</TableHead>
                  <TableHead>Повт. встречи</TableHead>
                  <TableHead>Подтв. сумма</TableHead>
                  <TableHead>Перенос</TableHead>
                  <TableHead>Статус</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dates.map((date) => {
                  const row = rows[date];
                  return (
                    <TableRow key={date}>
                      <TableCell className="whitespace-nowrap">{date}</TableCell>
                      <TableCell>{row.planned_calls}</TableCell>
                      <TableCell><Input type="number" min={0} value={row.actual_calls} onChange={(e) => updateField(date, "actual_calls", Number(e.target.value) || 0)} /></TableCell>
                      <TableCell><Input type="number" min={0} value={row.qualified_count} onChange={(e) => updateField(date, "qualified_count", Number(e.target.value) || 0)} /></TableCell>
                      <TableCell><Input type="number" min={0} value={row.gep_scheduled} onChange={(e) => updateField(date, "gep_scheduled", Number(e.target.value) || 0)} /></TableCell>
                      <TableCell><Input type="number" min={0} value={row.gep_done} readOnly /></TableCell>
                      <TableCell><Input type="number" min={0} value={row.cp_sent} onChange={(e) => updateField(date, "cp_sent", Number(e.target.value) || 0)} /></TableCell>
                      <TableCell><Input type="number" min={0} value={row.repeat_meetings} onChange={(e) => updateField(date, "repeat_meetings", Number(e.target.value) || 0)} /></TableCell>
                      <TableCell><Input type="number" min={0} value={row.confirmed_orders_sum} onChange={(e) => updateField(date, "confirmed_orders_sum", Number(e.target.value) || 0)} /></TableCell>
                      <TableCell>{row.carry_to_next_day}</TableCell>
                      <TableCell>
                        {savingDate === date
                          ? "сохр..."
                          : savedAtByDate[date]
                            ? "ok"
                            : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
  );
}
