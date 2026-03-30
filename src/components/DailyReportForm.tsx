"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useMemo, useState } from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import { getReportDateState } from "@/app/actions/dashboard-report-state";
import { upsertDailyReport } from "@/app/actions/daily-report";
import { getRollingTargetContext } from "@/app/actions/dashboard-metrics";
import { GepAddDialog } from "@/components/dashboard/GepAddDialog";
import type { SupplierOption } from "@/components/dashboard/GepAddDialog";
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
import { todaysCallsTarget } from "@/lib/crm-formulas";
import {
  dailyReportFormSchema,
  parseConfirmedSumInput,
  type DailyReportFormValues,
} from "@/lib/schemas/daily-report";
import { cn } from "@/lib/utils";

export type RollingContext = {
  monthlyCallsTarget: number;
  sumCallsBeforeThisDay: number;
  workingDaysRemaining: number;
};

type Props = {
  defaultDate: string;
  initialValues?: Partial<DailyReportFormValues> & { confirmed_sum?: string };
  initialRolling: RollingContext;
  initialGepDone: number;
  initialHasReport: boolean;
  suppliers: SupplierOption[];
};

export function DailyReportForm({
  defaultDate,
  initialValues,
  initialRolling,
  initialGepDone,
  initialHasReport,
  suppliers,
}: Props) {
  const [rolling, setRolling] = useState<RollingContext>(initialRolling);
  const [rollingLoading, setRollingLoading] = useState(false);
  const [gepDoneCount, setGepDoneCount] = useState(initialGepDone);
  const [hasReportForDate, setHasReportForDate] = useState(initialHasReport);
  const [gepModalOpen, setGepModalOpen] = useState(false);

  const {
    register,
    handleSubmit,
    control,
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
      cp_sent: 0,
      confirmed_sum: "",
      ...initialValues,
      ...(initialValues?.confirmed_sum !== undefined
        ? { confirmed_sum: String(initialValues.confirmed_sum) }
        : {}),
    },
  });

  const gepPlanned = useWatch({ control, name: "gep_planned" }) ?? 0;

  const refreshRolling = useCallback(async (date: string) => {
    setRollingLoading(true);
    const ctx = await getRollingTargetContext(date);
    setRollingLoading(false);
    if (ctx) setRolling(ctx);
  }, []);

  const refreshGepState = useCallback(async (date: string) => {
    const st = await getReportDateState(date);
    if (st) {
      setGepDoneCount(st.gep_done);
      setHasReportForDate(st.hasReport);
    }
  }, []);

  const dateField = register("report_date");

  const todayTarget = useMemo(
    () =>
      todaysCallsTarget({
        monthlyCallsTarget: rolling.monthlyCallsTarget,
        sumCallsBeforeThisDayInMonth: rolling.sumCallsBeforeThisDay,
        workingDaysRemaining: rolling.workingDaysRemaining,
        gepDone: gepDoneCount,
      }),
    [rolling, gepDoneCount],
  );

  const g5Active = gepDoneCount > 2;

  const gepLimitReached =
    hasReportForDate && gepDoneCount >= (Number(gepPlanned) || 0);
  const gepAddDisabled =
    !hasReportForDate ||
    gepLimitReached ||
    (Number(gepPlanned) || 0) === 0;
  const gepAddReason = !hasReportForDate
    ? "Сначала сохраните отчёт за эту дату и укажите план ГЭП."
    : gepLimitReached
      ? "Лимит запланированных ГЭП исчерпан"
      : (Number(gepPlanned) || 0) === 0
        ? "Укажите план ГЭП больше нуля"
        : undefined;

  async function onSubmit(values: DailyReportFormValues) {
    const sum = parseConfirmedSumInput(values.confirmed_sum);
    const res = await upsertDailyReport({
      ...values,
      confirmed_sum: values.confirmed_sum,
    });
    if (!res.ok) {
      toast.error("Не удалось сохранить", { description: res.error });
      return;
    }
    toast.success("Отчёт сохранён", {
      description: `Дата: ${values.report_date}`,
    });
    setGepDoneCount(res.gep_done);
    setHasReportForDate(true);
    reset({
      ...values,
      confirmed_sum: String(sum),
    });
    await refreshRolling(values.report_date);
  }

  const reportDateWatch = useWatch({ control, name: "report_date" });

  return (
    <div className="mt-6 space-y-4">
      <GepAddDialog
        open={gepModalOpen}
        onOpenChange={setGepModalOpen}
        reportDate={reportDateWatch || defaultDate}
        suppliers={suppliers}
        disabled={gepAddDisabled}
        disabledReason={gepAddReason}
        onSuccess={(n) => {
          setGepDoneCount(n);
          setHasReportForDate(true);
        }}
      />

      <Card className="border-border/80 bg-gradient-to-br from-card to-muted/20 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Цель на сегодня (звонки)</CardTitle>
          <CardDescription>
            Rolling + G5 по факту ГЭП (журнал презентаций).
            {rollingLoading && " · обновление…"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold tabular-nums tracking-tight">
            {todayTarget}{" "}
            <span className="text-lg font-normal text-muted-foreground">
              звонков
            </span>
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            План месяца: {rolling.monthlyCallsTarget} · Уже в месяце до даты:{" "}
            {rolling.sumCallsBeforeThisDay} · Рабочих дней осталось:{" "}
            {rolling.workingDaysRemaining}
            {g5Active && (
              <span className="ml-2 font-medium text-amber-600 dark:text-amber-400">
                Бонус G5 активен (лимит 12)
              </span>
            )}
          </p>
        </CardContent>
      </Card>

      <Card className="max-w-xl border-border/80 shadow-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-lg">Ежедневный отчёт</CardTitle>
          <CardDescription>
            ГЭП факт ведётся через журнал презентаций. План ГЭП задаётся здесь.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="report_date">Дата</Label>
              <Input
                id="report_date"
                type="date"
                {...dateField}
                onChange={async (e) => {
                  dateField.onChange(e);
                  const d = e.target.value;
                  await Promise.all([refreshRolling(d), refreshGepState(d)]);
                }}
              />
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
                  className={cn(
                    g5Active &&
                      "border-amber-500/70 bg-amber-50 text-amber-950 shadow-[0_0_0_1px_rgba(245,158,11,0.35)] dark:border-amber-500/50 dark:bg-amber-950/30 dark:text-amber-50",
                  )}
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
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="gep_planned">ГЭП план (макс. презентаций за день)</Label>
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
              <div className="grid gap-2 sm:col-span-2 rounded-lg border border-border/80 bg-muted/20 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">ГЭП факт</p>
                    <p className="text-2xl font-semibold tabular-nums">
                      {gepDoneCount}{" "}
                      <span className="text-sm font-normal text-muted-foreground">
                        / {Number(gepPlanned) || 0}
                      </span>
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={gepAddDisabled}
                    onClick={() => setGepModalOpen(true)}
                  >
                    + Добавить проведенный ГЭП
                  </Button>
                </div>
                {gepAddDisabled && gepAddReason && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {gepAddReason}
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
    </div>
  );
}
