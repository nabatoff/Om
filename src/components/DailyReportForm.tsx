"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Props = {
  managerId: string;
  defaultDate: string;
};

export function DailyReportForm({ managerId, defaultDate }: Props) {
  const [reportDate, setReportDate] = useState(defaultDate);
  const [callsCount, setCallsCount] = useState(0);
  const [gepPlanned, setGepPlanned] = useState(0);
  const [gepDone, setGepDone] = useState(0);
  const [cpSent, setCpSent] = useState(0);
  const [confirmedSum, setConfirmedSum] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const supabase = createClient();
    const sum = confirmedSum === "" ? 0 : Number(confirmedSum);
    if (Number.isNaN(sum)) {
      setMessage("Сумма должна быть числом");
      setLoading(false);
      return;
    }
    const { error } = await supabase.from("daily_reports").upsert(
      {
        manager_id: managerId,
        report_date: reportDate,
        calls_count: callsCount,
        gep_planned: gepPlanned,
        gep_done: gepDone,
        cp_sent: cpSent,
        confirmed_sum: sum,
      },
      { onConflict: "manager_id,report_date" },
    );
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("Сохранено");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 grid max-w-xl gap-4 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
        Ежедневный отчёт
      </h2>
      <label className="grid gap-1 text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">Дата</span>
        <input
          type="date"
          required
          value={reportDate}
          onChange={(e) => setReportDate(e.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900"
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Звонки</span>
          <input
            type="number"
            min={0}
            value={callsCount}
            onChange={(e) => setCallsCount(Number(e.target.value))}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">КП отправлено</span>
          <input
            type="number"
            min={0}
            value={cpSent}
            onChange={(e) => setCpSent(Number(e.target.value))}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">ГЭП план</span>
          <input
            type="number"
            min={0}
            value={gepPlanned}
            onChange={(e) => setGepPlanned(Number(e.target.value))}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">ГЭП факт</span>
          <input
            type="number"
            min={0}
            value={gepDone}
            onChange={(e) => setGepDone(Number(e.target.value))}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900"
          />
        </label>
      </div>
      <label className="grid gap-1 text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">Подтверждённая сумма</span>
        <input
          type="text"
          inputMode="decimal"
          value={confirmedSum}
          onChange={(e) => setConfirmedSum(e.target.value)}
          placeholder="0"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900"
        />
      </label>
      {message && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{message}</p>
      )}
      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {loading ? "Сохранение…" : "Сохранить отчёт"}
      </button>
    </form>
  );
}
