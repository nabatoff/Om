import { getSupabase } from './supabase';

export type UiClient = { name: string; bin: string };
export type FormStats = {
  processedTotal: number;
  newInWork: number;
  callsTotal: number;
  validatedTotal: number;
};
export type UiAssigned = { entityName: string; bin: string; date: string; type: string };
export type UiConducted = { entityName: string; bin: string; date: string; type: string; result: string };
export type UiOrder = {
  entityName: string;
  bin: string;
  orderCount: number;
  amounts: number[];
  totalAmount: number;
};

export type FullReport = {
  id: string;
  date: string;
  manager: string;
  stats: FormStats;
  assignedMeetings: UiAssigned[];
  conductedMeetings: UiConducted[];
  confirmedOrders: UiOrder[];
};

type ReportRow = {
  id: string;
  report_date: string;
  manager: string;
  processed_total: number;
  new_in_work: number;
  calls_total: number;
  validated_total: number;
  crm_assigned_meetings: {
    id: string;
    entity_name: string;
    bin: string;
    meeting_date: string;
    meeting_type: string;
    sort_order: number;
  }[];
  crm_conducted_meetings: {
    id: string;
    entity_name: string;
    bin: string;
    meeting_date: string;
    meeting_type: string;
    result: string;
    sort_order: number;
  }[];
  crm_confirmed_orders: {
    id: string;
    entity_name: string;
    bin: string;
    order_count: number;
    amounts: string[] | number[] | null;
    total_amount: string | number;
    sort_order: number;
  }[];
};

function mapReport(r: ReportRow): FullReport {
  return {
    id: r.id,
    date: r.report_date,
    manager: r.manager,
    stats: {
      processedTotal: r.processed_total,
      newInWork: r.new_in_work,
      callsTotal: r.calls_total,
      validatedTotal: r.validated_total,
    },
    assignedMeetings: (r.crm_assigned_meetings || [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((m) => ({
        entityName: m.entity_name,
        bin: m.bin?.trim() || '',
        date: m.meeting_date,
        type: m.meeting_type,
      })),
    conductedMeetings: (r.crm_conducted_meetings || [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((m) => ({
        entityName: m.entity_name,
        bin: m.bin?.trim() || '',
        date: m.meeting_date,
        type: m.meeting_type,
        result: m.result || '',
      })),
    confirmedOrders: (r.crm_confirmed_orders || [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((o) => {
        const amts = (o.amounts as number[] | null) || [];
        return {
          entityName: o.entity_name,
          bin: o.bin?.trim() || '',
          orderCount: o.order_count,
          amounts: amts.map((n) => Number(n)),
          totalAmount: Number(o.total_amount),
        };
      }),
  };
}

const reportSelect = `
  id, report_date, manager,
  processed_total, new_in_work, calls_total, validated_total,
  crm_assigned_meetings ( id, entity_name, bin, meeting_date, meeting_type, sort_order ),
  crm_conducted_meetings ( id, entity_name, bin, meeting_date, meeting_type, result, sort_order ),
  crm_confirmed_orders ( id, entity_name, bin, order_count, amounts, total_amount, sort_order )
`;

export async function fetchClientsApi(): Promise<UiClient[]> {
  const { data, error } = await getSupabase().from('crm_clients').select('name, bin').order('name');
  if (error) throw error;
  return (data || []).map((c) => ({ name: c.name, bin: String(c.bin).trim() }));
}

export async function fetchReportsApi(): Promise<FullReport[]> {
  const { data, error } = await getSupabase()
    .from('crm_reports')
    .select(reportSelect)
    .order('report_date', { ascending: false });
  if (error) throw error;
  return (data as unknown as ReportRow[]).map(mapReport);
}

export async function createClientRow(c: UiClient): Promise<UiClient> {
  const { data, error } = await getSupabase()
    .from('crm_clients')
    .insert({ name: c.name, bin: c.bin })
    .select('name, bin')
    .single();
  if (error) throw error;
  return { name: data.name, bin: String(data.bin).trim() };
}

export type SaveReportPayload = {
  reportDate: string;
  manager: string;
  stats: FormStats;
  assignedMeetings: UiAssigned[];
  conductedMeetings: UiConducted[];
  confirmedOrders: UiOrder[];
};

export async function saveReportToDb(payload: SaveReportPayload): Promise<void> {
  const { data: rep, error: repErr } = await getSupabase()
    .from('crm_reports')
    .insert({
      report_date: payload.reportDate,
      manager: payload.manager,
      processed_total: payload.stats.processedTotal,
      new_in_work: payload.stats.newInWork,
      calls_total: payload.stats.callsTotal,
      validated_total: payload.stats.validatedTotal,
    })
    .select('id')
    .single();
  if (repErr) throw repErr;
  const reportId = rep.id as string;

  if (payload.assignedMeetings.length) {
    const { error } = await getSupabase().from('crm_assigned_meetings').insert(
      payload.assignedMeetings.map((m, i) => ({
        report_id: reportId,
        entity_name: m.entityName,
        bin: m.bin,
        meeting_date: m.date,
        meeting_type: m.type,
        sort_order: i,
      })),
    );
    if (error) throw error;
  }

  if (payload.conductedMeetings.length) {
    const { error } = await getSupabase().from('crm_conducted_meetings').insert(
      payload.conductedMeetings.map((m, i) => ({
        report_id: reportId,
        entity_name: m.entityName,
        bin: m.bin,
        meeting_date: m.date,
        meeting_type: m.type,
        result: m.result,
        sort_order: i,
      })),
    );
    if (error) throw error;
  }

  if (payload.confirmedOrders.length) {
    const { error } = await getSupabase().from('crm_confirmed_orders').insert(
      payload.confirmedOrders.map((o, i) => ({
        report_id: reportId,
        entity_name: o.entityName,
        bin: o.bin,
        order_count: o.orderCount,
        amounts: o.amounts,
        total_amount: o.totalAmount,
        sort_order: i,
      })),
    );
    if (error) throw error;
  }
}
