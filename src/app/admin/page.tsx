import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function AdminPage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data: suppliers, error: sErr } = await supabase
    .from("suppliers")
    .select("id, status, manager_id");

  const { data: reports, error: rErr } = await supabase
    .from("daily_reports")
    .select("gep_planned, gep_done, cp_sent, confirmed_sum");

  if (sErr || rErr) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <p className="text-red-600 dark:text-red-400">
          {sErr?.message ?? rErr?.message}
        </p>
      </div>
    );
  }

  const list = suppliers ?? [];
  const total = list.length;
  const qualified = list.filter((s) => s.status === "qualified").length;
  const conversionPct =
    total === 0 ? 0 : Math.round((qualified / total) * 1000) / 10;

  const byStatus = {
    new: list.filter((s) => s.status === "new").length,
    in_progress: list.filter((s) => s.status === "in_progress").length,
    qualified: qualified,
  };

  const repList = reports ?? [];
  const gepPlannedSum = repList.reduce((a, r) => a + r.gep_planned, 0);
  const gepDoneSum = repList.reduce((a, r) => a + r.gep_done, 0);
  const gepConversionPct =
    gepPlannedSum === 0
      ? 0
      : Math.round((gepDoneSum / gepPlannedSum) * 1000) / 10;
  const cpTotal = repList.reduce((a, r) => a + r.cp_sent, 0);
  const sumConfirmed = repList.reduce(
    (a, r) => a + Number(r.confirmed_sum),
    0,
  );

  const managerIds = [...new Set(list.map((s) => s.manager_id).filter(Boolean))];
  const perManager = managerIds.map((mid) => {
    const mine = list.filter((s) => s.manager_id === mid);
    const q = mine.filter((s) => s.status === "qualified").length;
    const t = mine.length;
    return {
      id: mid as string,
      total: t,
      qualified: q,
      conv: t === 0 ? 0 : Math.round((q / t) * 1000) / 10,
    };
  });

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, role");

  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id, p.full_name || p.id.slice(0, 8)]),
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
        Админ: аналитика
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Воронка поставщиков: доля со статусом «qualified» от всех карточек.
        Плюс агрегаты по всем ежедневным отчётам (KPI).
      </p>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            Конверсия в qualified
          </p>
          <p className="mt-1 text-3xl font-semibold text-zinc-900 dark:text-zinc-100">
            {conversionPct}%
          </p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {qualified} / {total}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            По статусам
          </p>
          <ul className="mt-2 space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
            <li>Новые: {byStatus.new}</li>
            <li>В работе: {byStatus.in_progress}</li>
            <li>Квалифицированы: {byStatus.qualified}</li>
          </ul>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            ГЭП выполнение (сумма по отчётам)
          </p>
          <p className="mt-1 text-3xl font-semibold text-zinc-900 dark:text-zinc-100">
            {gepConversionPct}%
          </p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {gepDoneSum} / {gepPlannedSum} (факт / план)
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            КП и суммы
          </p>
          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
            КП отправлено (всего): {cpTotal}
          </p>
          <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
            Подтверждённые суммы: {sumConfirmed.toLocaleString("ru-RU")}
          </p>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
          Конверсия по менеджерам
        </h2>
        <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
              <tr>
                <th className="px-3 py-2 font-medium">Менеджер</th>
                <th className="px-3 py-2 font-medium">Всего</th>
                <th className="px-3 py-2 font-medium">Qualified</th>
                <th className="px-3 py-2 font-medium">Конверсия</th>
              </tr>
            </thead>
            <tbody>
              {perManager.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-4 text-zinc-600 dark:text-zinc-400"
                  >
                    Нет данных по поставщикам
                  </td>
                </tr>
              ) : (
                perManager.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-zinc-100 dark:border-zinc-800"
                  >
                    <td className="px-3 py-2">
                      {nameById.get(row.id) ?? row.id.slice(0, 8)}
                    </td>
                    <td className="px-3 py-2">{row.total}</td>
                    <td className="px-3 py-2">{row.qualified}</td>
                    <td className="px-3 py-2">{row.conv}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
