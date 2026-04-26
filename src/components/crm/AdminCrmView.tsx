"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  Clock,
  ExternalLink,
  FileText,
  LayoutDashboard,
  List,
  ShoppingBag,
  ShieldCheck,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const KIND: Record<"new" | "repeat", string> = {
  new: "Новая",
  repeat: "Повторная",
};

type Evidence = {
  manager_id: string;
  client_id: string;
  meeting_kind: "new" | "repeat";
  meeting_date: string;
};

type Planned = {
  client_id: string;
  name: string;
  meeting_date: string;
  meeting_kind: "new" | "repeat";
};

type ReportRow = {
  id: string;
  report_date: string;
  manager_id: string;
  manager_name: string;
  plans: number;
  conducted: number;
  conversion: number;
  revenue: number;
  plannedRows: Planned[];
};

type OrderRow = {
  report_date: string;
  manager_id: string;
  manager_name: string;
  name: string;
  orderCount: number;
  amounts: number[];
  totalAmount: number;
};

type Props = {
  managers: { id: string; name: string }[];
  reportRows: ReportRow[];
  orders: OrderRow[];
  evidence: Evidence[];
  initialView?: "admin" | "orders";
};

function hasEvidence(
  p: Planned,
  managerId: string,
  ev: Evidence[],
): boolean {
  return ev.some(
    (e) =>
      e.manager_id === managerId &&
      e.client_id === p.client_id &&
      e.meeting_kind === p.meeting_kind &&
      e.meeting_date >= p.meeting_date,
  );
}

export function AdminCrmView({
  managers,
  reportRows,
  orders: ordersAll,
  evidence,
  initialView = "admin",
}: Props) {
  const router = useRouter();
  const [view, setView] = useState<"admin" | "orders">(initialView);
  useEffect(() => {
    setView(initialView);
  }, [initialView]);
  const [filterManager, setFilterManager] = useState("Все");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [details, setDetails] = useState<{
    title: string;
    manager: string;
    managerId: string;
    list: Planned[];
  } | null>(null);
  const [orderOpen, setOrderOpen] = useState(false);
  const [orderEntity, setOrderEntity] = useState("");
  const [amounts, setAmounts] = useState<number[]>([]);

  const filteredReports = useMemo(
    () =>
      reportRows.filter((r) => {
        const m =
          filterManager === "Все" || r.manager_id === filterManager;
        const f = !from || r.report_date >= from;
        const t = !to || r.report_date <= to;
        return m && f && t;
      }),
    [reportRows, filterManager, from, to],
  );

  const filteredOrders = useMemo(
    () =>
      ordersAll.filter((o) => {
        const m =
          filterManager === "Все" || o.manager_id === filterManager;
        const f = !from || o.report_date >= from;
        const t = !to || o.report_date <= to;
        return m && f && t;
      }),
    [ordersAll, filterManager, from, to],
  );

  const totalRev = filteredOrders.reduce((a, o) => a + o.totalAmount, 0);
  const totalCount = filteredOrders.reduce((a, o) => a + o.orderCount, 0);

  return (
    <div className="max-w-7xl space-y-6">
      <div className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:flex-row">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white shadow-inner">
            <LayoutDashboard size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-gray-800">CRM отчётность</h1>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
              Админ: отчёты и заказы
            </p>
          </div>
        </div>
        <div className="flex w-full max-w-2xl gap-0.5 rounded-xl bg-gray-100 p-1 md:w-auto">
          <Link
            href="/dashboard"
            className="text-gray-500 hover:text-gray-700 flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-bold md:flex-none"
          >
            <FileText size={14} /> ОТЧЁТ
          </Link>
          <button
            type="button"
            onClick={() => {
              setView("admin");
              router.push("/admin");
            }}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-bold md:flex-none ${
              view === "admin"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <ShieldCheck size={14} /> Админка
          </button>
          <button
            type="button"
            onClick={() => {
              setView("orders");
              router.push("/admin?view=orders");
            }}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-bold md:flex-none ${
              view === "orders"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <ShoppingBag size={14} /> Заказы
          </button>
        </div>
      </div>

      <FilterBar
        managers={managers}
        filterManager={filterManager}
        setManager={setFilterManager}
        from={from}
        setFrom={setFrom}
        to={to}
        setTo={setTo}
      />

      {view === "admin" && (
        <div className="bg-card border-border/80 overflow-hidden rounded-2xl border shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-[10px] font-semibold uppercase">
                  <th className="px-6 py-4">Дата</th>
                  <th className="px-3 py-4">Менеджер</th>
                  <th className="px-3 py-4 text-center">План</th>
                  <th className="px-3 py-4 text-center">Факт</th>
                  <th className="px-3 py-4 text-center">Реализация</th>
                  <th className="px-6 py-4 text-right">Выручка</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredReports.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="text-muted-foreground py-20 text-center italic"
                    >
                      Нет данных
                    </td>
                  </tr>
                ) : (
                  filteredReports.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/30">
                      <td className="text-muted-foreground px-6 py-3 font-medium">
                        {new Date(r.report_date).toLocaleDateString("ru-RU")}
                      </td>
                      <td className="px-3 font-semibold">
                        {r.manager_name}
                      </td>
                      <td className="px-3 text-center">
                        {r.plans > 0 ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() =>
                              setDetails({
                                title: `План встреч — ${r.report_date}`,
                                manager: r.manager_name,
                                managerId: r.manager_id,
                                list: r.plannedRows,
                              })
                            }
                          >
                            <BadgePill
                              label={String(r.plans)}
                              icon={<Clock className="h-3 w-3" />}
                              variant="indigo"
                            />
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="px-3 text-center">
                        <BadgePill
                          label={String(r.conducted)}
                          icon={<Calendar className="h-3 w-3" />}
                          variant="blue"
                        />
                      </td>
                      <td className="px-3 text-center">
                        <div className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2 py-1 text-xs font-bold text-emerald-800">
                          <Target className="h-3 w-3" />
                          {r.conversion}
                          <span className="opacity-40">/ {r.plans}</span>
                        </div>
                      </td>
                      <td className="px-6 text-right font-bold tabular-nums">
                        {r.revenue.toLocaleString("ru-RU")} ₸
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === "orders" && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase text-muted-foreground">
                  Всего заказов
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{totalCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase text-muted-foreground">
                  Сумма
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-emerald-600">
                  {totalRev.toLocaleString("ru-RU")} ₸
                </p>
              </CardContent>
            </Card>
          </div>
          <div className="bg-card border-border/80 overflow-hidden rounded-2xl border">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-[10px] font-semibold uppercase">
                  <th className="px-6 py-4">Дата</th>
                  <th className="px-3 py-4">Менеджер</th>
                  <th className="px-3 py-4">Контрагент</th>
                  <th className="px-3 py-4 text-center">Кол-во</th>
                  <th className="px-6 py-4 text-right">Сумма</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="text-muted-foreground py-16 text-center italic"
                    >
                      Пусто
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((o, idx) => (
                    <tr
                      key={`${o.report_date}-${o.manager_id}-${o.name}-${idx}`}
                      className="hover:bg-muted/30"
                    >
                      <td className="text-muted-foreground px-6 py-3">
                        {new Date(o.report_date).toLocaleDateString("ru-RU")}
                      </td>
                      <td className="text-muted-foreground px-3 text-xs font-semibold uppercase">
                        {o.manager_name}
                      </td>
                      <td className="px-3 font-bold">{o.name}</td>
                      <td className="px-3 text-center">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="text-xs"
                          onClick={() => {
                            setOrderEntity(o.name);
                            setAmounts(o.amounts);
                            setOrderOpen(true);
                          }}
                        >
                          <List className="mr-1 h-3 w-3" />
                          {o.orderCount}
                          <ExternalLink className="ml-1 h-3 w-3 opacity-50" />
                        </Button>
                      </td>
                      <td className="px-6 text-right font-bold text-emerald-600">
                        {o.totalAmount.toLocaleString("ru-RU")} ₸
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog
        open={details !== null}
        onOpenChange={(o) => {
          if (!o) setDetails(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          {details && (
            <>
              <DialogHeader>
                <DialogTitle>{details.title}</DialogTitle>
                <p className="text-sm text-muted-foreground">{details.manager}</p>
              </DialogHeader>
              <div className="max-h-[50vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground text-xs uppercase">
                      <th className="pb-2 text-left">Контрагент</th>
                      <th className="px-2 pb-2">Тип</th>
                      <th className="px-2 pb-2">Дата</th>
                      <th className="pb-2 text-right">Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.list.map((item, i) => {
                      const ok = hasEvidence(
                        item,
                        details.managerId,
                        evidence,
                      );
                      return (
                        <tr key={i} className="border-t">
                          <td className="py-2 font-medium">{item.name}</td>
                          <td className="px-2">
                            <span
                              className={
                                item.meeting_kind === "new"
                                  ? "rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold"
                                  : "rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold"
                              }
                            >
                              {KIND[item.meeting_kind]}
                            </span>
                          </td>
                          <td className="text-muted-foreground px-2 text-center text-xs">
                            {new Date(item.meeting_date).toLocaleDateString(
                              "ru-RU",
                            )}
                          </td>
                          <td className="text-right text-xs">
                            {ok ? (
                              <span className="font-bold text-emerald-600">
                                Выполнено
                              </span>
                            ) : (
                              <span className="font-bold text-amber-600">
                                Ожидает
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={orderOpen} onOpenChange={setOrderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{orderEntity}</DialogTitle>
          </DialogHeader>
          <ul className="max-h-48 space-y-2 overflow-y-auto">
            {amounts.map((a, i) => (
              <li
                key={i}
                className="bg-muted/40 flex justify-between rounded-lg border p-2 text-sm"
              >
                <span className="text-muted-foreground">Заказ #{i + 1}</span>
                <span className="font-bold">
                  {a.toLocaleString("ru-RU")} ₸
                </span>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterBar({
  managers,
  filterManager,
  setManager,
  from,
  setFrom,
  to,
  setTo,
}: {
  managers: { id: string; name: string }[];
  filterManager: string;
  setManager: (v: string) => void;
  from: string;
  setFrom: (v: string) => void;
  to: string;
  setTo: (v: string) => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-4 p-4">
        <div className="min-w-[180px] flex-1 space-y-1.5">
          <Label className="text-[10px] font-bold uppercase">Менеджер</Label>
          <Select value={filterManager} onValueChange={setManager}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Все">Все</SelectItem>
              {managers.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[140px] space-y-1.5">
          <Label className="text-[10px] font-bold uppercase">С</Label>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="min-w-[140px] space-y-1.5">
          <Label className="text-[10px] font-bold uppercase">По</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </CardContent>
    </Card>
  );
}

function BadgePill({
  label,
  icon,
  variant,
}: {
  label: string;
  icon: React.ReactNode;
  variant: "indigo" | "blue";
}) {
  const c =
    variant === "indigo"
      ? "bg-indigo-500/10 text-indigo-800 border-indigo-500/20"
      : "bg-sky-500/10 text-sky-800 border-sky-500/20";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-bold ${c}`}
    >
      {icon} {label}
    </span>
  );
}
