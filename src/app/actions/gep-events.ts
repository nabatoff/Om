"use server";

export type ActionResult =
  | { ok: true; gep_done: number }
  | { ok: false; error: string };

export async function addGepEvent(input: {
  event_date: string;
  supplier_id: string;
}): Promise<ActionResult> {
  return {
    ok: false,
    error: `Журнал ГЭП убран в reset-схеме. Используйте upsertDailyReport для даты ${input.event_date}.`,
  };
}

export async function countGepEventsForDate(
  _reportDate: string,
): Promise<number> {
  return 0;
}
