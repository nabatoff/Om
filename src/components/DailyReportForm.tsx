"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type Resolver } from "react-hook-form";
import { toast } from "sonner";
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
import { createClient } from "@/lib/supabase/client";
import {
  dailyReportFormSchema,
  parseConfirmedSumInput,
  type DailyReportFormValues,
} from "@/lib/schemas/daily-report";

type Props = {
  managerId: string;
  defaultDate: string;
};

export function DailyReportForm({ managerId, defaultDate }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<DailyReportFormValues>({
    resolver: zodResolver(
      dailyReportFormSchema,
    ) as Resolver<DailyReportFormValues>,
    defaultValues: {
      report_date: defaultDate,
      calls_count: 0,
      gep_planned: 0,
      gep_done: 0,
      cp_sent: 0,
      confirmed_sum: "",
    },
  });

  async function onSubmit(values: DailyReportFormValues) {
    const sum = parseConfirmedSumInput(values.confirmed_sum);
    const supabase = createClient();
    const { error } = await supabase.from("daily_reports").upsert(
      {
        manager_id: managerId,
        report_date: values.report_date,
        calls_count: values.calls_count,
        gep_planned: values.gep_planned,
        gep_done: values.gep_done,
        cp_sent: values.cp_sent,
        confirmed_sum: sum,
      },
      { onConflict: "manager_id,report_date" },
    );
    if (error) {
      toast.error("Не удалось сохранить", { description: error.message });
      return;
    }
    toast.success("Отчёт сохранён", {
      description: `Дата: ${values.report_date}`,
    });
    reset({
      ...values,
      confirmed_sum: String(sum),
    });
  }

  return (
    <Card className="mt-6 max-w-xl border-border/80 shadow-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-lg">Ежедневный отчёт</CardTitle>
        <CardDescription>
          Целые неотрицательные показатели; сумма продаж обязательна.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="report_date">Дата</Label>
            <Input id="report_date" type="date" {...register("report_date")} />
            {errors.report_date && (
              <p className="text-sm text-destructive">
                {errors.report_date.message}
              </p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="calls_count">Звонки</Label>
              <Input
                id="calls_count"
                type="number"
                min={0}
                step={1}
                {...register("calls_count", { valueAsNumber: true })}
              />
              {errors.calls_count && (
                <p className="text-sm text-destructive">
                  {errors.calls_count.message}
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cp_sent">КП отправлено</Label>
              <Input
                id="cp_sent"
                type="number"
                min={0}
                step={1}
                {...register("cp_sent", { valueAsNumber: true })}
              />
              {errors.cp_sent && (
                <p className="text-sm text-destructive">
                  {errors.cp_sent.message}
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="gep_planned">ГЭП план</Label>
              <Input
                id="gep_planned"
                type="number"
                min={0}
                step={1}
                {...register("gep_planned", { valueAsNumber: true })}
              />
              {errors.gep_planned && (
                <p className="text-sm text-destructive">
                  {errors.gep_planned.message}
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="gep_done">ГЭП факт</Label>
              <Input
                id="gep_done"
                type="number"
                min={0}
                step={1}
                {...register("gep_done", { valueAsNumber: true })}
              />
              {errors.gep_done && (
                <p className="text-sm text-destructive">
                  {errors.gep_done.message}
                </p>
              )}
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirmed_sum">Подтверждённая сумма</Label>
            <Input
              id="confirmed_sum"
              type="text"
              inputMode="decimal"
              placeholder="0"
              {...register("confirmed_sum")}
            />
            {errors.confirmed_sum && (
              <p className="text-sm text-destructive">
                {errors.confirmed_sum.message}
              </p>
            )}
          </div>
          <Button type="submit" disabled={isSubmitting} className="w-fit">
            {isSubmitting ? "Сохранение…" : "Сохранить отчёт"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
