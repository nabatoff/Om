"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/types/database";

type Supplier = Tables<"suppliers">;

const STATUSES = ["new", "in_progress", "qualified"] as const;

type Props = {
  suppliers: Supplier[];
};

export function SupplierStatusTable({ suppliers: initial }: Props) {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function updateStatus(id: string, status: string) {
    setBusyId(id);
    const supabase = createClient();
    const { error } = await supabase.from("suppliers").update({ status }).eq("id", id);
    setBusyId(null);
    if (error) {
      alert(error.message);
      return;
    }
    setSuppliers((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status } : s)),
    );
    router.refresh();
  }

  if (suppliers.length === 0) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Поставщиков пока нет. Добавьте записи в Supabase или через админку БД.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
          <tr>
            <th className="px-3 py-2 font-medium">Название</th>
            <th className="px-3 py-2 font-medium">БИН</th>
            <th className="px-3 py-2 font-medium">Категория</th>
            <th className="px-3 py-2 font-medium">Статус</th>
          </tr>
        </thead>
        <tbody>
          {suppliers.map((s) => (
            <tr
              key={s.id}
              className="border-b border-zinc-100 dark:border-zinc-800"
            >
              <td className="px-3 py-2">{s.name}</td>
              <td className="px-3 py-2 font-mono text-xs">{s.bin}</td>
              <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                {s.category ?? "—"}
              </td>
              <td className="px-3 py-2">
                <select
                  value={s.status}
                  disabled={busyId === s.id}
                  onChange={(e) => updateStatus(s.id, e.target.value)}
                  className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                >
                  {STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st === "new"
                        ? "Новый"
                        : st === "in_progress"
                          ? "В работе"
                          : "Квалифицирован"}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
