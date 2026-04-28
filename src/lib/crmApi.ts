import { getSupabase } from './supabase';

export type UiClient = { name: string; bin: string };
export type FormStats = {
  processedTotal: number;
  newInWork: number;
  callsTotal: number;
  validatedTotal: number;
};
export type UiAssigned = { id?: string; entityName: string; bin: string; date: string; type: string };
export type UiConducted = { id?: string; entityName: string; bin: string; date: string; type: string; result: string };
export type UiOrder = {
  entityName: string;
  bin: string;
  /** Юр. лицо, через которое оформлен заказ (из справочника контрагентов). */
  viaEntityName: string;
  viaBin: string;
  orderCount: number;
  amounts: number[];
  totalAmount: number;
};

export type FullReport = {
  id: string;
  date: string;
  manager: string;
  managerId: string | null;
  stats: FormStats;
  assignedMeetings: UiAssigned[];
  conductedMeetings: UiConducted[];
  confirmedOrders: UiOrder[];
};

type ReportRow = {
  id: string;
  report_date: string;
  manager: string;
  manager_id: string | null;
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
    via_entity_name?: string | null;
    via_bin?: string | null;
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
    managerId: r.manager_id,
    stats: {
      processedTotal: r.processed_total,
      newInWork: r.new_in_work,
      callsTotal: r.calls_total,
      validatedTotal: r.validated_total,
    },
    assignedMeetings: (r.crm_assigned_meetings || [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((m) => ({
        id: m.id,
        entityName: m.entity_name,
        bin: m.bin?.trim() || '',
        date: m.meeting_date,
        type: m.meeting_type,
      })),
    conductedMeetings: (r.crm_conducted_meetings || [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((m) => ({
        id: m.id,
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
          viaEntityName: (o.via_entity_name ?? '').trim(),
          viaBin: (o.via_bin ?? '').trim(),
          orderCount: o.order_count,
          amounts: amts.map((n) => Number(n)),
          totalAmount: Number(o.total_amount),
        };
      }),
  };
}

const reportSelect = `
  id, report_date, manager, manager_id,
  processed_total, new_in_work, calls_total, validated_total,
  crm_assigned_meetings ( id, entity_name, bin, meeting_date, meeting_type, sort_order ),
  crm_conducted_meetings ( id, entity_name, bin, meeting_date, meeting_type, result, sort_order ),
  crm_confirmed_orders ( id, entity_name, bin, via_entity_name, via_bin, order_count, amounts, total_amount, sort_order )
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
  if (error) {
    if (error.code === '23505') {
      throw new Error('Контрагент с таким БИН уже существует');
    }
    if (error.code === '23514') {
      throw new Error('БИН должен состоять ровно из 12 цифр');
    }
    throw error;
  }
  return { name: data.name, bin: String(data.bin).trim() };
}

export async function deleteClientByBin(bin: string): Promise<void> {
  const { error } = await getSupabase().from('crm_clients').delete().eq('bin', bin);
  if (error) throw error;
}

/** Админ: обновить наименование и/или БИН; при смене БИН в БД синхронизируются встречи и заказы (RPC). */
export async function updateClientRow(originalBin: string, next: UiClient): Promise<UiClient> {
  const oldB = String(originalBin).replace(/\D/g, '');
  const name = next.name.trim();
  const newB = next.bin.replace(/\D/g, '');
  if (oldB.length !== 12 || newB.length !== 12) {
    throw new Error('БИН должен состоять ровно из 12 цифр');
  }
  if (name.length < 2) {
    throw new Error('Наименование слишком короткое');
  }
  if (oldB === newB) {
    const { data, error } = await getSupabase()
      .from('crm_clients')
      .update({ name })
      .eq('bin', oldB)
      .select('name, bin')
      .single();
    if (error) {
      if (error.code === '23505') throw new Error('Контрагент с таким БИН уже существует');
      throw error;
    }
    return { name: data.name, bin: String(data.bin).trim() };
  }
  const { error: rpcError } = await getSupabase().rpc('update_crm_client', {
    p_old_bin: oldB,
    p_name: name,
    p_new_bin: newB,
  });
  if (rpcError) {
    if (rpcError.code === '23505' || rpcError.message?.includes('уже существует')) {
      throw new Error('Контрагент с таким БИН уже существует');
    }
    throw rpcError;
  }
  const { data, error } = await getSupabase().from('crm_clients').select('name, bin').eq('bin', newB).single();
  if (error) throw error;
  return { name: data.name, bin: String(data.bin).trim() };
}

export async function deleteReportById(reportId: string): Promise<void> {
  const { error } = await getSupabase().from('crm_reports').delete().eq('id', reportId);
  if (error) throw error;
}

export async function deleteAssignedMeetingById(meetingId: string): Promise<void> {
  const { error } = await getSupabase().from('crm_assigned_meetings').delete().eq('id', meetingId);
  if (error) throw error;
}

export async function deleteConductedMeetingById(meetingId: string): Promise<void> {
  const { error } = await getSupabase().from('crm_conducted_meetings').delete().eq('id', meetingId);
  if (error) throw error;
}

export type SaveReportPayload = {
  reportId?: string;
  reportDate: string;
  stats: FormStats;
  assignedMeetings: UiAssigned[];
  conductedMeetings: UiConducted[];
  confirmedOrders: UiOrder[];
};

export async function saveReportToDb(payload: SaveReportPayload): Promise<void> {
  const { error } = await getSupabase().rpc('save_crm_report', { payload });
  if (error) throw error;
}

export async function saveKpiToDb(payload: {
  reportId?: string;
  reportDate: string;
  processedTotal: number;
  newInWork: number;
  callsTotal: number;
  validatedTotal: number;
}): Promise<string> {
  const { data, error } = await getSupabase().rpc('save_crm_kpi', { payload });
  if (error) throw error;
  return String(data);
}
