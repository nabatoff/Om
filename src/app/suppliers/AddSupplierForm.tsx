"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { insertSupplier } from "@/app/actions/suppliers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addDaysISO, localISODate } from "@/lib/dates";

export function AddSupplierForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [bin, setBin] = useState("");
  const [category, setCategory] = useState("");
  const [skuCount, setSkuCount] = useState(0);
  const [nktMember, setNktMember] = useState(false);
  const [kzQuality, setKzQuality] = useState(false);
  const [nextContactDate, setNextContactDate] = useState(
    addDaysISO(localISODate(), 7),
  );
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await insertSupplier({
      name,
      bin,
      category,
      nkt_member: nktMember,
      kz_quality_mark: kzQuality,
      sku_count: skuCount,
      next_contact_date: nextContactDate || null,
    });
    setLoading(false);
    if (!res.ok) {
      toast.error("Не удалось добавить", { description: res.error });
      return;
    }
    setName("");
    setBin("");
    setCategory("");
    setSkuCount(0);
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
            <div className="grid gap-2">
              <Label htmlFor="sup_sku">Кол-во SKU</Label>
              <Input
                id="sup_sku"
                type="number"
                min={0}
                step={1}
                value={skuCount}
                onChange={(e) => setSkuCount(Number(e.target.value) || 0)}
              />
            </div>
            <div className="grid gap-2">
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
