"use server";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function insertSupplierNote(
  _supplierId: string,
  _content: string,
): Promise<ActionResult> {
  return { ok: false, error: "Заметки поставщиков отключены после hard-reset CRM." };
}
