import { AdminCrmView } from "@/components/crm/AdminCrmView";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type MeetingKind = "new" | "repeat";

type Evidence = {
  manager_id: string;
  client_id: string;
  meeting_kind: MeetingKind;
  meeting_date: string;
};

type Planned = {
  client_id: string;
  name: string;
  meeting_date: string;
  meeting_kind: MeetingKind;
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

function monthRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  const last = new Date(y, m, 0).getDate();
  const to = `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { from, to };
}

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminPage({ searchParams }: PageProps) {
  await requireAdmin();
  const sp = await searchParams;
  const v = typeof sp?.view === "string" ? sp.view : undefined;
  const initialView: "admin" | "orders" =
    v === "orders" ? "orders" : "admin";
  const supabase = await createClient();
  const { from, to } = monthRange();

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("role", "manager")
    .order("full_name", { ascending: true });

  const nameBy = new Map(
    (profiles ?? []).map((p) => [p.id, p.full_name?.trim() || p.id.slice(0, 8)]),
  );
  const managers = (profiles ?? []).map((p) => ({
    id: p.id,
    name: p.full_name?.trim() || p.id.slice(0, 8),
  }));

  const { data: repData, error: repErr } = await supabase
    .from("crm_daily_reports")
    .select(
      "id, report_date, manager_id, crm_planned_meetings ( id, client_id, meeting_date, meeting_kind, sort_order, clients ( company_name ) ), crm_conducted_meetings ( id ), crm_order_groups ( id, sort_order, crm_order_lines ( line_index, amount ), clients ( company_name ) )",
    )
    .gte("report_date", from)
    .lte("report_date", to)
    .order("report_date", { ascending: false });

  if (repErr) {
    return (
      <div className="text-destructive mx-auto max-w-3xl p-6 text-sm">
        Не удалось загрузить отчёты: {repErr.message}
      </div>
    );
  }

  const { data: evData } = await supabase
    .from("crm_conducted_meetings")
    .select(
      "client_id, meeting_date, meeting_kind, crm_daily_reports!inner ( manager_id )",
    );

  const evidence: Evidence[] = (evData ?? []).map(
    (r: {
      client_id: string;
      meeting_date: string;
      meeting_kind: MeetingKind;
      crm_daily_reports: { manager_id: string };
    }) => ({
      manager_id: r.crm_daily_reports.manager_id,
      client_id: r.client_id,
      meeting_date: r.meeting_date,
      meeting_kind: r.meeting_kind,
    }),
  );

  const reportRows: ReportRow[] = (repData ?? []).map((r) => {
    const plannedRaw =
      (r.crm_planned_meetings as
        | {
            client_id: string;
            meeting_date: string;
            meeting_kind: MeetingKind;
            sort_order: number;
            clients: { company_name: string } | null;
          }[]
        | null) ?? [];
    const planned = [...plannedRaw].sort(
      (a, b) => a.sort_order - b.sort_order,
    );
    const plannedRows: Planned[] = planned.map((p) => ({
      client_id: p.client_id,
      name: p.clients?.company_name ?? "—",
      meeting_date: p.meeting_date,
      meeting_kind: p.meeting_kind,
    }));
    const conducted = (r.crm_conducted_meetings as { id: string }[] | null)
      ?.length ?? 0;
    const plans = planned.length;
    const conversion = planned.filter((p) =>
      hasEvidence(
        {
          client_id: p.client_id,
          name: "",
          meeting_date: p.meeting_date,
          meeting_kind: p.meeting_kind,
        },
        r.manager_id,
        evidence,
      ),
    ).length;
    const groups = (r.crm_order_groups as
      | {
          sort_order: number;
          crm_order_lines: { line_index: number; amount: string | number }[];
        }[]
      | null) ?? [];
    let revenue = 0;
    for (const g of groups) {
      for (const line of g.crm_order_lines ?? []) {
        revenue += Number(line.amount) || 0;
      }
    }
    return {
      id: r.id,
      report_date: r.report_date,
      manager_id: r.manager_id,
      manager_name: nameBy.get(r.manager_id) ?? r.manager_id.slice(0, 8),
      plans,
      conducted,
      conversion,
      revenue,
      plannedRows,
    };
  });

  const orderRows: OrderRow[] = [];
  for (const r of repData ?? []) {
    const managerName =
      nameBy.get(r.manager_id) ?? r.manager_id.slice(0, 8);
    const groups = (r.crm_order_groups as
      | {
          sort_order: number;
          clients: { company_name: string } | null;
          crm_order_lines: { line_index: number; amount: string | number }[];
        }[]
      | null) ?? [];
    for (const g of [...groups].sort((a, b) => a.sort_order - b.sort_order)) {
      const lines = [...(g.crm_order_lines ?? [])].sort(
        (a, b) => a.line_index - b.line_index,
      );
      const amounts = lines.map((l) => Number(l.amount) || 0);
      const total = amounts.reduce((a, b) => a + b, 0);
      orderRows.push({
        report_date: r.report_date,
        manager_id: r.manager_id,
        manager_name: managerName,
        name: g.clients?.company_name ?? "—",
        orderCount: amounts.length,
        amounts: amounts.length ? amounts : [0],
        totalAmount: total,
      });
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        <AdminCrmView
          initialView={initialView}
          managers={managers}
          reportRows={reportRows}
          orders={orderRows}
          evidence={evidence}
        />
      </div>
    </div>
  );
}
