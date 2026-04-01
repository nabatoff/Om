"use client";

import { useState } from "react";
import { toast } from "sonner";
import { upsertDailyReport } from "@/app/actions/daily-report";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { localISODate } from "@/lib/dates";

type Props = {
  defaultDate?: string;
};

export function DailyReportForm({ defaultDate }: Props) {
  const [loading, setLoading] = useState(false);
  const [reportDate, setReportDate] = useState(defaultDate ?? localISODate());
  const [actualCalls, setActualCalls] = useState(0);
  const [qualifiedCount, setQualifiedCount] = useState(0);
  const [gepScheduled, setGepScheduled] = useState(0);
  const [gepDone, setGepDone] = useState(0);
  const [cpSent, setCpSent] = useState(0);
  const [repeatMeetings, setRepeatMeetings] = useState(0);
  const [confirmedOrdersSum, setConfirmedOrdersSum] = useState(0);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await upsertDailyReport({
      report_date: reportDate,
      actual_calls: actualCalls,
      qualified_count: qualifiedCount,
      gep_scheduled: gepScheduled,
      gep_done: gepDone,
      cp_sent: cpSent,
      repeat_meetings: repeatMeetings,
      confirmed_orders_sum: confirmedOrdersSum,
    });
    setLoading(false);
    if (!res.ok) {
      toast.error("Не удалось сохранить", { description: res.error });
      return;
    }
    toast.success("Отчет сохранен", {
      description: `План звонков: ${res.planned_calls}, перенос: ${res.carry_to_next_day}`,
    });
  }

  return (
    <Card className="max-w-3xl border-border/80 shadow-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-lg">Ежедневный KPI-отчет</CardTitle>
          <CardDescription>
          План звонков считается автоматически: 22, минус 10 при ГЭП {'>'} 2, плюс перенос хвоста с прошлого дня.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="report_date">Дата</Label>
              <Input
                id="report_date"
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="actual_calls">Факт звонков</Label>
              <Input id="actual_calls" type="number" min={0} value={actualCalls} onChange={(e) => setActualCalls(Number(e.target.value) || 0)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="qualified_count">Прошли квалификацию</Label>
              <Input id="qualified_count" type="number" min={0} value={qualifiedCount} onChange={(e) => setQualifiedCount(Number(e.target.value) || 0)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="gep_scheduled">Назначено ГЭП</Label>
              <Input id="gep_scheduled" type="number" min={0} value={gepScheduled} onChange={(e) => setGepScheduled(Number(e.target.value) || 0)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="gep_done">Проведен ГЭП</Label>
              <Input id="gep_done" type="number" min={0} value={gepDone} onChange={(e) => setGepDone(Number(e.target.value) || 0)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cp_sent">Выставлены ЦП</Label>
              <Input id="cp_sent" type="number" min={0} value={cpSent} onChange={(e) => setCpSent(Number(e.target.value) || 0)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="repeat_meetings">Повторные встречи</Label>
              <Input id="repeat_meetings" type="number" min={0} value={repeatMeetings} onChange={(e) => setRepeatMeetings(Number(e.target.value) || 0)} />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="confirmed_orders_sum">Сумма подтвержденных заказов</Label>
              <Input id="confirmed_orders_sum" type="number" min={0} value={confirmedOrdersSum} onChange={(e) => setConfirmedOrdersSum(Number(e.target.value) || 0)} />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={loading} className="w-fit">
                {loading ? "Сохранение..." : "Сохранить отчет"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
  );
}
