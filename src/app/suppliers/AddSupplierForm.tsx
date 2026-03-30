"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function AddSupplierForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [bin, setBin] = useState("");
  const [category, setCategory] = useState("");
  const [nktMember, setNktMember] = useState(false);
  const [kzQuality, setKzQuality] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setMsg("Нет сессии");
      setLoading(false);
      return;
    }
    const { error } = await supabase.from("suppliers").insert({
      name: name.trim(),
      bin: bin.trim(),
      category: category.trim() || null,
      nkt_member: nktMember,
      kz_quality_mark: kzQuality,
      manager_id: user.id,
      status: "new",
    });
    setLoading(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    setName("");
    setBin("");
    setCategory("");
    setNktMember(false);
    setKzQuality(false);
    setMsg("Добавлено");
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 grid max-w-2xl gap-3 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
        Новый поставщик
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Название</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">БИН (уникальный)</span>
          <input
            required
            value={bin}
            onChange={(e) => setBin(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm dark:border-zinc-600 dark:bg-zinc-900"
          />
        </label>
        <label className="grid gap-1 text-sm sm:col-span-2">
          <span className="text-zinc-600 dark:text-zinc-400">Категория</span>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900"
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={nktMember}
          onChange={(e) => setNktMember(e.target.checked)}
        />
        НКТ
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={kzQuality}
          onChange={(e) => setKzQuality(e.target.checked)}
        />
        Знак качества KZ
      </label>
      {msg && <p className="text-sm text-zinc-600 dark:text-zinc-400">{msg}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-fit rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {loading ? "…" : "Добавить"}
      </button>
    </form>
  );
}
