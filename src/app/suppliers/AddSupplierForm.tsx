"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { addDaysISO, localISODate } from "@/lib/dates";

export function AddSupplierForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [bin, setBin] = useState("");
  const [category, setCategory] = useState("");
  const [nktMember, setNktMember] = useState(false);
  const [kzQuality, setKzQuality] = useState(false);
  const [nextContactDate, setNextContactDate] = useState(
    addDaysISO(localISODate(), 7),
  );
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Нет сессии");
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
      next_contact_date: nextContactDate || null,
    });
    setLoading(false);
    if (error) {
      toast.error("Не удалось добавить", { description: error.message });
      return;
    }
    setName("");
    setBin("");
    setCategory("");
    setNktMember(false);
    setKzQuality(false);
    setNextContactDate(addDaysISO(localISODate(), 7));
    toast.success("Поставщик добавлен");
    router.refresh();
  }

  return (
    <Card className="max-w-2xl border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Новый поставщик</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="sup_name">Название</Label>
              <Input
                id="sup_name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sup_bin">БИН</Label>
              <Input
                id="sup_bin"
                required
                value={bin}
                onChange={(e) => setBin(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="sup_cat">Категория</Label>
              <Input
                id="sup_cat"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="sup_next">Следующий контакт</Label>
              <Input
                id="sup_next"
                type="date"
                value={nextContactDate}
                onChange={(e) => setNextContactDate(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <Checkbox
                id="nkt"
                checked={nktMember}
                onCheckedChange={(v) => setNktMember(v === true)}
              />
              <Label htmlFor="nkt" className="font-normal">
                НКТ
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="kz"
                checked={kzQuality}
                onCheckedChange={(v) => setKzQuality(v === true)}
              />
              <Label htmlFor="kz" className="font-normal">
                Знак качества KZ
              </Label>
            </div>
          </div>
          <Button type="submit" disabled={loading} className="w-fit">
            {loading ? "Добавление…" : "Добавить"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
