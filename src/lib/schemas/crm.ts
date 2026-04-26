import { z } from "zod";
import { localISODate } from "@/lib/dates";
import type {
  ClientStatus,
  MissingRequirement,
  NktStatus,
  OMarketStatus,
} from "@/types/database";

const nonNegInt = z.coerce.number().int().min(0);
const nonNegNumber = z.coerce.number().min(0);

export const clientStatusValues: ClientStatus[] = [
  "ktp",
  "distr",
  "dealer",
  "resale",
];
export const nktStatusValues: NktStatus[] = [
  "draft",
  "on_moderation",
  "kz_badge",
];
export const omarketStatusValues: OMarketStatus[] = [
  "cards_created",
  "wg_set",
  "initial_setup",
];
export const missingRequirementValues: MissingRequirement[] = [
  "responsible",
  "tech_conditions",
  "photos",
  "no_preorders",
  "docs",
];

export const clientSchema = z.object({
  company_name: z.string().trim().min(1, "Название обязательно"),
  bin: z.string().trim().min(1, "БИН обязателен"),
  bitrix_url: z.string().trim().url("Некорректный URL").optional().or(z.literal("")),
  client_category: z.string().trim().optional().or(z.literal("")),
  sales_volume_2025: nonNegNumber,
  status: z.enum(clientStatusValues),
  yearly_plan: nonNegNumber,
  em_plan: nonNegNumber,
  sales_department_description: z.string().trim().optional().or(z.literal("")),
  nkt_status: z.enum(nktStatusValues),
  nkt_submitted_at: z.string().optional().or(z.literal("")),
  omarket_status: z.enum(omarketStatusValues).optional(),
  current_work_comment: z.string().trim().optional().or(z.literal("")),
  missing_requirement: z.enum(missingRequirementValues).optional(),
  missing_requirement_comment: z.string().trim().optional().or(z.literal("")),
  sales_legal_entity: z.string().trim().optional().or(z.literal("")),
  sku_count: nonNegInt,
});

export const monthMetricSchema = z.object({
  client_id: z.string().uuid(),
  month: z.string().regex(/^\d{4}-\d{2}-01$/, "Месяц должен быть YYYY-MM-01"),
  delivered_amount: nonNegNumber,
  potential_amount: nonNegNumber,
});

const kindEnum = z.enum(["new", "repeat"]);

export const crmDailySaveSchema = z
  .object({
    report_date: z.string().min(1),
    processed_total: nonNegInt,
    new_in_work: nonNegInt,
    calls_total: nonNegInt,
    validated_total: nonNegInt,
    assigned_meetings: z.array(
      z.object({
        client_id: z.string().uuid(),
        date: z.string().min(1),
        kind: kindEnum,
      }),
    ),
    conducted_meetings: z.array(
      z.object({
        client_id: z.string().uuid(),
        date: z.string().min(1),
        kind: kindEnum,
        result: z.string(),
      }),
    ),
    confirmed_orders: z.array(
      z.object({
        client_id: z.string().uuid(),
        order_count: z.coerce.number().int().min(1),
        amounts: z
          .array(z.coerce.number().min(0))
          .min(1, "Нужна хотя бы одна сумма"),
      }),
    ),
  })
  .superRefine((v, ctx) => {
    if (v.report_date > localISODate()) {
      ctx.addIssue({
        code: "custom",
        path: ["report_date"],
        message: "Дата отчёта не может быть в будущем",
      });
    }
  })
  .superRefine((v, ctx) => {
    for (const [i, o] of v.confirmed_orders.entries()) {
      if (o.amounts.length !== o.order_count) {
        ctx.addIssue({
          code: "custom",
          path: ["confirmed_orders", i, "amounts"],
          message: "Число сумм должно совпадать с количеством заказов",
        });
      }
    }
  });

export type ClientInput = z.infer<typeof clientSchema>;
export type MonthMetricInput = z.infer<typeof monthMetricSchema>;
export type CrmDailySaveInput = z.infer<typeof crmDailySaveSchema>;
