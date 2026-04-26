"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Briefcase,
  CalendarCheck,
  CheckCircle,
  Clock,
  FileText,
  LayoutDashboard,
  Phone,
  Plus,
  Save,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  Users,
} from "lucide-react";
import { loadMyCrmReportForDate, saveCrmDailyReport } from "@/app/actions/crm-daily";
import type { CrmReportPayload } from "@/app/actions/crm-daily";
import { localISODate } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createQuickClientByName } from "@/app/actions/suppliers";
import { cn } from "@/lib/utils";

const KIND = {
  new: "Новая",
  repeat: "Повторная",
} as const;

type Kind = "new" | "repeat";

type ClientOpt = { id: string; name: string };

type MeetingDraft = { clientId: string; date: string; kind: Kind };
type ConductedDraft = MeetingDraft & { result: string };
type OrderDraft = {
  clientId: string;
  orderCount: number;
  amounts: number[];
};

type Props = {
  userRole: "admin" | "manager";
  dailyCallGoal: number;
  clients: ClientOpt[];
  defaultDate: string;
  initial: CrmReportPayload | null;
  kpiRow?: ReactNode;
};

function emptyPayload(date: string): CrmReportPayload {
  return {
    report_date: date,
    stats: {
      processed_total: 0,
      new_in_work: 0,
      calls_total: 0,
      validated_total: 0,
    },
    assigned_meetings: [],
    conducted_meetings: [],
    confirmed_orders: [],
  };
}

function fromPayload(p: CrmReportPayload) {
  return {
    stats: { ...p.stats },
    assigned: p.assigned_meetings.map((m) => ({
      clientId: m.client_id,
      date: m.date,
      kind: m.kind,
    })),
    conducted: p.conducted_meetings.map((m) => ({
      clientId: m.client_id,
      date: m.date,
      kind: m.kind,
      result: m.result,
    })),
    orders: p.confirmed_orders.map((o) => ({
      clientId: o.client_id,
      orderCount: o.order_count,
      amounts: o.amounts.length ? [...o.amounts] : [0],
    })),
  };
}

export function CrmReportWorkspace({
  userRole,
  dailyCallGoal,
  clients: clientList,
  defaultDate,
  initial,
  kpiRow,
}: Props) {
  const [reportDate, setReportDate] = useState(defaultDate);
  const [clientOpts, setClientOpts] = useState(clientList);
  const [stats, setStats] = useState(
    () => initial?.stats ?? emptyPayload(defaultDate).stats,
  );
  const [assigned, setAssigned] = useState<MeetingDraft[]>(
    () => (initial ? fromPayload(initial).assigned : []),
  );
  const [conducted, setConducted] = useState<ConductedDraft[]>(
    () => (initial ? fromPayload(initial).conducted : []),
  );
  const [orders, setOrders] = useState<OrderDraft[]>(
    () => (initial ? fromPayload(initial).orders : []),
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [meetingIdx, setMeetingIdx] = useState<number | null>(null);
  const [meetingText, setMeetingText] = useState("");
  const [quickName, setQuickName] = useState("");

  const apply = useCallback((p: CrmReportPayload | null) => {
    if (!p) {
      const d = localISODate();
      setStats(emptyPayload(d).stats);
      setAssigned([]);
      setConducted([]);
      setOrders([]);
      return;
    }
    const s = fromPayload(p);
    setStats({ ...p.stats });
    setAssigned(s.assigned);
    setConducted(s.conducted);
    setOrders(s.orders);
  }, []);

  const isFirst = useRef(true);
  useEffect(() => {
    if (isFirst.current && reportDate === defaultDate && initial) {
      isFirst.current = false;
      return;
    }
    isFirst.current = false;
    let c = false;
    setLoading(true);
    void loadMyCrmReportForDate(reportDate).then((p) => {
      if (c) return;
      if (p) apply(p);
      else apply(null);
      setLoading(false);
    });
    return () => {
      c = true;
    };
  }, [reportDate, apply, defaultDate, initial]);

  const handleStat = (k: keyof CrmReportPayload["stats"], v: string) => {
    const n = v === "" ? 0 : parseInt(v, 10);
    setStats((s) => ({ ...s, [k]: Number.isNaN(n) ? 0 : n }));
  };

  async function onSave() {
    setSaving(true);
    const res = await saveCrmDailyReport({
      report_date: reportDate,
      processed_total: stats.processed_total,
      new_in_work: stats.new_in_work,
      calls_total: stats.calls_total,
      validated_total: stats.validated_total,
      assigned_meetings: assigned
        .filter((r) => r.clientId)
        .map((m) => ({
          client_id: m.clientId,
          date: m.date,
          kind: m.kind,
        })),
      conducted_meetings: conducted
        .filter((r) => r.clientId)
        .map((m) => ({
          client_id: m.clientId,
          date: m.date,
          kind: m.kind,
          result: m.result,
        })),
      confirmed_orders: orders
        .filter((o) => o.clientId)
        .map((o) => ({
          client_id: o.clientId,
          order_count: o.orderCount,
          amounts: o.amounts,
        })),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Отчёт сохранён");
  }

  const openResult = (idx: number) => {
    setMeetingIdx(idx);
    setMeetingText(conducted[idx]?.result ?? "");
  };

  const saveResult = () => {
    if (meetingIdx == null) return;
    setConducted((rows) => {
      const n = [...rows];
      n[meetingIdx] = { ...n[meetingIdx], result: meetingText };
      return n;
    });
    setMeetingIdx(null);
  };

  return (
    <div className="animate-in fade-in space-y-6 duration-500">
      <div className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:flex-row">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 p-3 text-white shadow-inner rounded-xl">
            <LayoutDashboard size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-gray-800">
              CRM отчётность
            </h1>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
              Аналитика продаж и активности
            </p>
          </div>
        </div>
        <div className="bg-gray-100 flex w-full max-w-2xl gap-0.5 rounded-xl p-1 md:w-auto">
          <span
            className="flex flex-1 cursor-default items-center justify-center gap-2 rounded-lg bg-white px-4 py-2 text-xs font-bold text-blue-600 shadow-sm md:flex-none"
            title="Текущая страница"
          >
            <FileText size={14} /> ОТЧЁТ
          </span>
          {userRole === "admin" && (
            <Link
              href="/admin"
              className="text-gray-500 hover:text-gray-700 flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all md:flex-none"
            >
              <ShieldCheck size={14} /> АДМИНКА
            </Link>
          )}
          {userRole === "admin" && (
            <Link
              href="/admin?view=orders"
              className="text-gray-500 hover:text-gray-700 flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all md:flex-none"
            >
              <ShoppingBag size={14} /> ЗАКАЗЫ
            </Link>
          )}
        </div>
      </div>

      {kpiRow}

      <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-gray-100 pb-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-800">
            Дневной отчёт
          </h2>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase text-gray-400">
                Дата
              </label>
              <Input
                type="date"
                className="w-[200px] rounded-xl border-gray-200 bg-gray-50"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
              />
            </div>
            {loading && (
              <p className="text-xs text-gray-400">Загрузка…</p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatIn
            icon={<Briefcase className="text-blue-500" size={20} />}
            label="Отработано"
            value={stats.processed_total}
            onChange={(v) => handleStat("processed_total", v)}
          />
          <StatIn
            icon={<Users className="text-emerald-500" size={20} />}
            label="Взято новых"
            value={stats.new_in_work}
            onChange={(v) => handleStat("new_in_work", v)}
          />
          <div className="space-y-3 rounded-2xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-gray-500">
                <Phone className="text-indigo-500" size={18} />
                <span className="text-[10px] font-bold uppercase tracking-widest">
                  Звонки
                </span>
              </div>
              <span className="text-[10px] font-bold text-gray-300">
                ЦЕЛЬ: {dailyCallGoal}
              </span>
            </div>
            <input
              type="number"
              className="w-full border-0 bg-transparent text-3xl font-black text-gray-800 outline-none"
              value={stats.calls_total}
              onChange={(e) => handleStat("calls_total", e.target.value)}
            />
          </div>
          <StatIn
            icon={<CheckCircle className="text-amber-500" size={20} />}
            label="Квалификация"
            value={stats.validated_total}
            onChange={(v) => handleStat("validated_total", v)}
          />
        </div>
      </div>

      <PlannedMeetingsCard
        title="Назначено встреч (план)"
        icon={<Clock className="text-indigo-400" />}
        rows={assigned}
        onRowsChange={setAssigned}
        clientOpts={clientOpts}
        onQuickAdd={async (name) => {
          const r = await createQuickClientByName(name);
          if (!r.ok) {
            toast.error(r.error);
            return;
          }
          setClientOpts((p) => [
            { id: r.data.id, name: r.data.company_name },
            ...p,
          ]);
          setQuickName("");
        }}
        quickName={quickName}
        onQuickNameChange={setQuickName}
      />

      <ConductedMeetingsCard
        title="Проведено встреч (факт)"
        icon={<CalendarCheck className="text-blue-400" />}
        rows={conducted}
        onRowsChange={setConducted}
        clientOpts={clientOpts}
        onResultClick={openResult}
        onQuickAdd={async (name) => {
          const r = await createQuickClientByName(name);
          if (!r.ok) {
            toast.error(r.error);
            return;
          }
          setClientOpts((p) => [
            { id: r.data.id, name: r.data.company_name },
            ...p,
          ]);
        }}
        quickName={quickName}
        onQuickNameChange={setQuickName}
      />

      <OrdersBlock orders={orders} setOrders={setOrders} clientOpts={clientOpts} />

      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={saving}
          className="active:scale-95 flex items-center gap-3 rounded-3xl bg-blue-600 px-12 py-4 text-xs font-black uppercase tracking-[0.2em] text-white shadow-2xl shadow-blue-200 transition-all hover:bg-blue-700 disabled:opacity-60"
        >
          <Save size={18} />
          {saving ? "Сохранение…" : "Сохранить отчёт"}
        </button>
      </div>

      <Dialog
        open={meetingIdx !== null}
        onOpenChange={() => setMeetingIdx(null)}
      >
        <DialogContent className="max-w-lg rounded-[48px] border-gray-200 p-0">
          <div className="bg-gray-50/50 flex items-center justify-between border-b p-8">
            <div>
              <h3 className="text-sm font-bold uppercase text-gray-900">
                Итог встречи
              </h3>
              <p className="mt-1 text-[9px] font-bold uppercase text-gray-400">
                {conducted[meetingIdx ?? 0] &&
                  clientOpts.find(
                    (c) => c.id === conducted[meetingIdx ?? 0].clientId,
                  )?.name}
              </p>
            </div>
          </div>
          <Textarea
            value={meetingText}
            onChange={(e) => setMeetingText(e.target.value)}
            rows={8}
            className="min-h-40 border-0 bg-transparent px-8 py-4 text-sm font-bold"
          />
          <div className="flex justify-end gap-4 bg-gray-50 p-8">
            <button
              type="button"
              onClick={() => setMeetingIdx(null)}
              className="text-[10px] font-bold uppercase text-gray-400"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={saveResult}
              className="rounded-[20px] bg-gray-900 px-10 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-2xl"
            >
              Сохранить
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatIn({
  icon,
  label,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-gray-500">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-widest">
          {label}
        </span>
      </div>
      <input
        type="number"
        min={0}
        className="w-full border-0 bg-transparent text-3xl font-black text-gray-800 outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => e.target.value === "0" && onChange("")}
        onBlur={(e) => e.target.value === "" && onChange("0")}
      />
    </div>
  );
}

function PlannedMeetingsCard({
  title,
  icon,
  rows,
  onRowsChange,
  clientOpts,
  onQuickAdd,
  quickName,
  onQuickNameChange,
}: {
  title: string;
  icon: React.ReactNode;
  rows: MeetingDraft[];
  onRowsChange: (r: MeetingDraft[]) => void;
  clientOpts: ClientOpt[];
  onQuickAdd: (name: string) => void | Promise<void>;
  quickName: string;
  onQuickNameChange: (s: string) => void;
}) {
  return (
    <div className="rounded-[32px] border border-gray-200 bg-white p-8 shadow-sm">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {icon}
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-800">
            {title}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => {
            const d = new Date().toISOString().slice(0, 10);
            onRowsChange([...rows, { clientId: "", date: d, kind: "new" }]);
          }}
          className="rounded-2xl bg-gray-50 p-2.5 text-gray-400 shadow-inner hover:bg-blue-600 hover:text-white"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>
      <div className="space-y-2">
        <div className="mb-4 flex flex-wrap gap-2 rounded-2xl border border-gray-100 p-3 text-sm">
          <Input
            placeholder="Быстрый клиент по названию"
            value={quickName}
            onChange={(e) => onQuickNameChange(e.target.value)}
            className="max-w-md flex-1 rounded-2xl border-gray-200 bg-white"
          />
          <Button
            type="button"
            variant="outline"
            className="font-bold uppercase"
            onClick={() => void onQuickAdd(quickName)}
          >
            + В реестр
          </Button>
        </div>
        {rows.length === 0 ? (
          <p className="text-center text-sm text-gray-300">
            Нет записей
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="text-[9px] font-bold uppercase tracking-widest text-gray-400">
                  <th className="border-b border-gray-50 pb-2">Контрагент</th>
                  <th className="w-40 border-b border-gray-50 px-2 pb-2">Дата</th>
                  <th className="w-32 border-b border-gray-50 px-2 pb-2">Тип</th>
                  <th className="w-10 border-b border-gray-50" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={idx} className="border-t border-gray-50">
                    <td className="py-2 pr-2">
                      <Select
                        value={row.clientId}
                        onValueChange={(v) => {
                          const n = [...rows];
                          n[idx] = { ...n[idx], clientId: v };
                          onRowsChange(n);
                        }}
                      >
                        <SelectTrigger className="w-full border-0 bg-gray-50/50 p-3 font-bold text-sm">
                          <SelectValue placeholder="Компания..." />
                        </SelectTrigger>
                        <SelectContent>
                          {clientOpts.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2">
                      <Input
                        type="date"
                        className="rounded-2xl border-0 bg-gray-50/50 p-3 font-bold"
                        value={row.date}
                        onChange={(e) => {
                          const n = [...rows];
                          n[idx] = { ...n[idx], date: e.target.value };
                          onRowsChange(n);
                        }}
                      />
                    </td>
                    <td className="px-2">
                      <Select
                        value={row.kind}
                        onValueChange={(v) => {
                          const n = [...rows];
                          n[idx] = { ...n[idx], kind: v as Kind };
                          onRowsChange(n);
                        }}
                      >
                        <SelectTrigger className="appearance-none justify-center text-center text-sm font-bold">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new">{KIND.new}</SelectItem>
                          <SelectItem value="repeat">{KIND.repeat}</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        onClick={() =>
                          onRowsChange(rows.filter((_, i) => i !== idx))
                        }
                        className="text-gray-200 hover:text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ConductedMeetingsCard({
  title,
  icon,
  rows,
  onRowsChange,
  clientOpts,
  onResultClick,
  onQuickAdd,
  quickName,
  onQuickNameChange,
}: {
  title: string;
  icon: React.ReactNode;
  rows: ConductedDraft[];
  onRowsChange: (r: ConductedDraft[]) => void;
  clientOpts: ClientOpt[];
  onResultClick: (i: number) => void;
  onQuickAdd: (name: string) => void | Promise<void>;
  quickName: string;
  onQuickNameChange: (s: string) => void;
}) {
  return (
    <div className="rounded-[32px] border border-gray-200 bg-white p-8 shadow-sm">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {icon}
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-800">
            {title}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => {
            const d = new Date().toISOString().slice(0, 10);
            onRowsChange([
              ...rows,
              { clientId: "", date: d, kind: "new", result: "" },
            ]);
          }}
          className="rounded-2xl bg-gray-50 p-2.5 text-gray-400 shadow-inner hover:bg-blue-600 hover:text-white"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>
      <div className="space-y-2">
        <div className="mb-4 flex flex-wrap gap-2 rounded-2xl border border-gray-100 p-3 text-sm">
          <Input
            placeholder="Быстрый клиент по названию"
            value={quickName}
            onChange={(e) => onQuickNameChange(e.target.value)}
            className="max-w-md flex-1 rounded-2xl border-gray-200"
          />
          <Button
            type="button"
            variant="outline"
            className="font-bold uppercase"
            onClick={() => void onQuickAdd(quickName)}
          >
            + В реестр
          </Button>
        </div>
        {rows.length === 0 ? (
          <p className="text-center text-sm text-gray-300">Нет записей</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="text-[9px] font-bold uppercase tracking-widest text-gray-400">
                  <th className="border-b border-gray-50 pb-2">Контрагент</th>
                  <th className="w-40 border-b border-gray-50 px-2 pb-2">Дата</th>
                  <th className="w-32 border-b border-gray-50 px-2 pb-2">Тип</th>
                  <th className="w-32 border-b border-gray-50 text-center pb-2">
                    Итог
                  </th>
                  <th className="w-10 border-b border-gray-50" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={idx} className="border-t border-gray-50">
                    <td className="py-2 pr-2">
                      <Select
                        value={row.clientId}
                        onValueChange={(v) => {
                          const n = [...rows];
                          n[idx] = { ...n[idx], clientId: v, result: row.result };
                          onRowsChange(n);
                        }}
                      >
                        <SelectTrigger className="w-full border-0 bg-gray-50/50 p-3 font-bold">
                          <SelectValue placeholder="Компания..." />
                        </SelectTrigger>
                        <SelectContent>
                          {clientOpts.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2">
                      <Input
                        type="date"
                        className="rounded-2xl border-0 bg-gray-50/50 p-3 font-bold"
                        value={row.date}
                        onChange={(e) => {
                          const n = [...rows];
                          n[idx] = {
                            ...n[idx],
                            date: e.target.value,
                            result: row.result,
                          };
                          onRowsChange(n);
                        }}
                      />
                    </td>
                    <td className="px-2">
                      <Select
                        value={row.kind}
                        onValueChange={(v) => {
                          const n = [...rows];
                          n[idx] = {
                            ...n[idx],
                            kind: v as Kind,
                            result: row.result,
                          };
                          onRowsChange(n);
                        }}
                      >
                        <SelectTrigger className="justify-center text-center font-bold">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new">{KIND.new}</SelectItem>
                          <SelectItem value="repeat">{KIND.repeat}</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 text-center">
                      <button
                        type="button"
                        onClick={() => onResultClick(idx)}
                        className={cn(
                          "rounded-xl px-5 py-2.5 text-[9px] font-black uppercase",
                          row.result
                            ? "bg-emerald-500 text-white"
                            : "bg-gray-100 text-gray-400",
                        )}
                      >
                        {row.result ? "OK" : "ВВЕСТИ"}
                      </button>
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        onClick={() =>
                          onRowsChange(rows.filter((_, i) => i !== idx))
                        }
                        className="text-gray-200 hover:text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function OrdersBlock({
  orders,
  setOrders,
  clientOpts,
}: {
  orders: OrderDraft[];
  setOrders: React.Dispatch<React.SetStateAction<OrderDraft[]>>;
  clientOpts: ClientOpt[];
}) {
  const add = () => {
    setOrders((d) => [
      ...d,
      { clientId: "", orderCount: 1, amounts: [0] },
    ]);
  };
  const update = (i: number, o: OrderDraft) => {
    setOrders((rows) => {
      const c = [...rows];
      c[i] = o;
      return c;
    });
  };
  const updateSum = (oIdx: number, sIdx: number, raw: string) => {
    const n = parseFloat(raw.replace(/[^0-9.]/g, "")) || 0;
    setOrders((rows) => {
      const c = [...rows];
      const am = [...c[oIdx].amounts];
      am[sIdx] = n;
      c[oIdx] = { ...c[oIdx], amounts: am };
      return c;
    });
  };

  const totalDay = orders.reduce(
    (a, b) => a + b.amounts.reduce((x, y) => x + y, 0),
    0,
  );

  return (
    <div className="rounded-[32px] border border-gray-200 bg-white p-8 shadow-sm">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <CheckCircle className="h-5 w-5 text-emerald-500" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-800">
            Подтверждённые заказы
          </h2>
        </div>
        <button
          type="button"
          onClick={add}
          className="text-[10px] font-bold uppercase tracking-widest text-blue-600 hover:underline"
        >
          Добавить ЮЛ
        </button>
      </div>
      <div className="space-y-4">
        {orders.map((order, oIdx) => {
          const lineTotal = order.amounts.reduce((a, b) => a + b, 0);
          return (
            <div
              key={oIdx}
              className="relative space-y-4 rounded-[32px] border border-gray-100 bg-gray-50/50 p-6"
            >
              <button
                type="button"
                className="absolute right-4 top-4 text-gray-300 hover:text-red-500"
                onClick={() => setOrders((r) => r.filter((_, i) => i !== oIdx))}
              >
                <Trash2 className="h-5 w-5" />
              </button>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="ml-2 text-[9px] font-bold uppercase text-gray-400">
                    Контрагент
                  </label>
                  <Select
                    value={order.clientId}
                    onValueChange={(v) => {
                      update(oIdx, { ...order, clientId: v });
                    }}
                  >
                    <SelectTrigger className="border-0 bg-white p-3 font-bold shadow-sm">
                      <SelectValue placeholder="Юр. лицо" />
                    </SelectTrigger>
                    <SelectContent>
                      {clientOpts.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="ml-2 text-[9px] font-bold uppercase text-gray-400">
                    К-во заказов
                  </label>
                  <Input
                    type="number"
                    min={1}
                    className="border-0 bg-white p-3 text-sm font-black shadow-sm"
                    value={order.orderCount}
                    onChange={(e) => {
                      const count = Math.max(1, parseInt(e.target.value, 10) || 1);
                      const newAmounts = [...order.amounts];
                      if (count > newAmounts.length) {
                        while (newAmounts.length < count) newAmounts.push(0);
                      } else {
                        newAmounts.length = count;
                      }
                      update(oIdx, {
                        ...order,
                        orderCount: count,
                        amounts: newAmounts,
                      });
                    }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-3 md:grid-cols-4">
                {order.amounts.map((sum, sIdx) => (
                  <div key={sIdx} className="space-y-1">
                    <span className="ml-1 text-[8px] font-bold uppercase text-gray-300">
                      Сумма #{sIdx + 1}
                    </span>
                    <div className="relative">
                      <Input
                        value={sum || ""}
                        onChange={(e) => updateSum(oIdx, sIdx, e.target.value)}
                        className="pr-6 text-right text-xs font-black shadow-inner"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] text-gray-300">
                        ₸
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between pt-2 font-black text-emerald-600">
                <span className="text-[9px] uppercase tracking-widest opacity-50">
                  Итого по контрагенту:
                </span>
                <span className="text-sm">
                  {lineTotal.toLocaleString("ru-RU")} ₸
                </span>
              </div>
            </div>
          );
        })}
        {orders.length > 0 && (
          <div className="mt-6 flex items-center justify-between border-t border-gray-100 px-2 pt-6">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
              Общая сумма за день:
            </span>
            <span className="text-2xl font-black text-emerald-600">
              {totalDay.toLocaleString("ru-RU")} ₸
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
