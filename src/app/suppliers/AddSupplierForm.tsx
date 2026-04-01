"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { insertSupplier } from "@/app/actions/suppliers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function AddSupplierForm() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [bin, setBin] = useState("");
  const [bitrixUrl, setBitrixUrl] = useState("");
  const [clientCategory, setClientCategory] = useState("");
  const [salesVolume2025, setSalesVolume2025] = useState(0);
  const [status, setStatus] = useState<"ktp" | "distr" | "dealer" | "resale">("ktp");
  const [yearlyPlan, setYearlyPlan] = useState(0);
  const [emPlan, setEmPlan] = useState(0);
  const [salesDepartmentDescription, setSalesDepartmentDescription] = useState("");
  const [nktStatus, setNktStatus] = useState<"draft" | "on_moderation" | "kz_badge">("draft");
  const [nktSubmittedAt, setNktSubmittedAt] = useState("");
  const [omarketStatus, setOmarketStatus] = useState<"cards_created" | "wg_set" | "initial_setup">("cards_created");
  const [currentWorkComment, setCurrentWorkComment] = useState("");
  const [missingRequirement, setMissingRequirement] = useState<"responsible" | "tech_conditions" | "photos" | "no_preorders" | "docs">("responsible");
  const [missingRequirementComment, setMissingRequirementComment] = useState("");
  const [salesLegalEntity, setSalesLegalEntity] = useState("");
  const [skuCount, setSkuCount] = useState(0);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await insertSupplier({
      company_name: companyName,
      bin,
      bitrix_url: bitrixUrl,
      client_category: clientCategory,
      sales_volume_2025: salesVolume2025,
      status,
      yearly_plan: yearlyPlan,
      em_plan: emPlan,
      sales_department_description: salesDepartmentDescription,
      nkt_status: nktStatus,
      nkt_submitted_at: nktSubmittedAt,
      omarket_status: omarketStatus,
      current_work_comment: currentWorkComment,
      missing_requirement: missingRequirement,
      missing_requirement_comment: missingRequirementComment,
      sales_legal_entity: salesLegalEntity,
      sku_count: skuCount,
    });
    setLoading(false);
    if (!res.ok) {
      toast.error("Не удалось добавить", { description: res.error });
      return;
    }
    setCompanyName("");
    setBin("");
    setBitrixUrl("");
    setClientCategory("");
    setSalesVolume2025(0);
    setYearlyPlan(0);
    setEmPlan(0);
    setSalesDepartmentDescription("");
    setNktSubmittedAt("");
    setCurrentWorkComment("");
    setMissingRequirementComment("");
    setSalesLegalEntity("");
    setSkuCount(0);
    toast.success("Клиент добавлен");
    router.refresh();
  }

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Новый клиент</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-4 lg:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="company_name">Название компании</Label>
              <Input
                id="company_name"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bin">БИН</Label>
              <Input
                id="bin"
                required
                value={bin}
                onChange={(e) => setBin(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bitrix_url">Ссылка на Bitrix</Label>
              <Input
                id="bitrix_url"
                value={bitrixUrl}
                onChange={(e) => setBitrixUrl(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="client_category">Категория клиента</Label>
              <Input
                id="client_category"
                value={clientCategory}
                onChange={(e) => setClientCategory(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sales_volume_2025">Объем продаж на ГЗ за 2025</Label>
              <Input
                id="sales_volume_2025"
                type="number"
                min={0}
                value={salesVolume2025}
                onChange={(e) => setSalesVolume2025(Number(e.target.value) || 0)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Статус клиента</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ktp">КТП</SelectItem>
                  <SelectItem value="distr">Дистр</SelectItem>
                  <SelectItem value="dealer">Дилер</SelectItem>
                  <SelectItem value="resale">Перепродажа</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="yearly_plan">Годовой план</Label>
              <Input
                id="yearly_plan"
                type="number"
                min={0}
                value={yearlyPlan}
                onChange={(e) => setYearlyPlan(Number(e.target.value) || 0)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="em_plan">План на ЭМ</Label>
              <Input
                id="em_plan"
                type="number"
                min={0}
                value={emPlan}
                onChange={(e) => setEmPlan(Number(e.target.value) || 0)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sales_department_description">Описание отдела продаж</Label>
              <Textarea
                id="sales_department_description"
                value={salesDepartmentDescription}
                onChange={(e) => setSalesDepartmentDescription(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Статус в НКТ</Label>
              <Select value={nktStatus} onValueChange={(v) => setNktStatus(v as typeof nktStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Черновик</SelectItem>
                  <SelectItem value="on_moderation">На модерации</SelectItem>
                  <SelectItem value="kz_badge">Есть значок KZ</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="nkt_submitted_at">Дата подачи в НКТ</Label>
              <Input id="nkt_submitted_at" type="date" value={nktSubmittedAt} onChange={(e) => setNktSubmittedAt(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Статус в OMarket</Label>
              <Select value={omarketStatus} onValueChange={(v) => setOmarketStatus(v as typeof omarketStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cards_created">Карточки созданы</SelectItem>
                  <SelectItem value="wg_set">WG выставлены</SelectItem>
                  <SelectItem value="initial_setup">Первичная настройка</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="current_work_comment">Какая сейчас работа проводится</Label>
              <Textarea id="current_work_comment" value={currentWorkComment} onChange={(e) => setCurrentWorkComment(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Чего не хватает</Label>
              <Select value={missingRequirement} onValueChange={(v) => setMissingRequirement(v as typeof missingRequirement)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="responsible">Ответственный</SelectItem>
                  <SelectItem value="tech_conditions">Техусловия</SelectItem>
                  <SelectItem value="photos">Фото</SelectItem>
                  <SelectItem value="no_preorders">Нет предзаказов</SelectItem>
                  <SelectItem value="docs">Получение доков</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="missing_requirement_comment">Комментарий по нехватке</Label>
              <Input id="missing_requirement_comment" value={missingRequirementComment} onChange={(e) => setMissingRequirementComment(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sales_legal_entity">Через какое юр.лицо продажи</Label>
              <Input id="sales_legal_entity" value={salesLegalEntity} onChange={(e) => setSalesLegalEntity(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sku_count">Кол-во SKU</Label>
              <Input id="sku_count" type="number" min={0} step={1} value={skuCount} onChange={(e) => setSkuCount(Number(e.target.value) || 0)} />
            </div>
          <div className="lg:col-span-2">
          <Button type="submit" disabled={loading}>
            {loading ? "Добавление…" : "Добавить"}
          </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
