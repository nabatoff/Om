import { z } from "zod";

const nonNegInt = z.coerce
  .number("Введите число")
  .int("Только целые числа")
  .min(0, "Не может быть отрицательным");

export function parseConfirmedSumInput(s: string): number {
  const t = s.trim().replace(/\s/g, "").replace(",", ".");
  const n = Number(t);
  if (!Number.isFinite(n)) throw new Error("invalid");
  return n;
}

export const dailyReportFormSchema = z
  .object({
    report_date: z.string().min(1, "Выберите дату"),
    calls_count: nonNegInt,
    gep_planned: nonNegInt,
    gep_done: nonNegInt,
    cp_sent: nonNegInt,
    confirmed_sum: z.string().trim().min(1, "Укажите подтверждённую сумму"),
  })
  .superRefine((data, ctx) => {
    try {
      const n = parseConfirmedSumInput(data.confirmed_sum);
      if (n < 0) {
        ctx.addIssue({
          code: "custom",
          message: "Сумма не может быть отрицательной",
          path: ["confirmed_sum"],
        });
      }
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Некорректное число",
        path: ["confirmed_sum"],
      });
    }
  });

export type DailyReportFormValues = z.infer<typeof dailyReportFormSchema>;
