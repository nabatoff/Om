import { getSupabase } from './supabase';

export type UiClient = {
  name: string;
  bin: string;
  managerId?: string | null;
  managerName?: string | null;
  cpPaid?: boolean;
  cpPaidAt?: string | null;
  /** Только при админской загрузке справочника. */
  isKtp?: boolean;
};
export type UiManagerProfile = { id: string; fullName: string };
export type FormStats = {
  processedTotal: number;
  newInWork: number;
  callsTotal: number;
  validatedTotal: number;
};
export type UiAssigned = { id?: string; entityName: string; bin: string; date: string; type: string };
export type UiConducted = {
  id?: string;
  entityName: string;
  bin: string;
  date: string;
  type: string;
  result: string;
  /** ЦП отправлено (цепь). */
  cpSent: boolean;
  /** Количество отправленного ЦП (если cpSent). */
  cpQuantity: number;
  /** Статус оплаты именно этой записи ЦП. */
  cpPaid: boolean;
};
export type UiOrder = {
  entityName: string;
  bin: string;
  /** Юр. лицо, через которое оформлен заказ (из справочника контрагентов). */
  viaEntityName: string;
  viaBin: string;
  orderCount: number;
  amounts: number[];
  totalAmount: number;
  /** Снимок при сохранении заказа (из БД). */
  commissionAmount?: number | null;
  mrpKztApplied?: number | null;
  isKtpApplied?: boolean | null;
};

export type DeletedMeeting = {
  id: string;
  source: 'assigned' | 'conducted';
  entityName: string;
  bin: string;
  date: string;
  type: string;
  result?: string;
  manager: string;
  reportDate: string;
  deletedAt: string;
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
    cp_sent?: boolean | null;
    cp_quantity?: number | null;
    cp_paid?: boolean | null;
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
    mrp_kzt_applied?: string | number | null;
    is_ktp_applied?: boolean | null;
    commission_amount?: string | number | null;
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
        cpSent: Boolean(m.cp_sent),
        cpQuantity: Math.max(0, Number(m.cp_quantity ?? 0) || 0),
        cpPaid: Boolean(m.cp_paid),
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
          commissionAmount:
            o.commission_amount == null || o.commission_amount === ''
              ? null
              : Number(o.commission_amount),
          mrpKztApplied:
            o.mrp_kzt_applied == null || o.mrp_kzt_applied === ''
              ? null
              : Number(o.mrp_kzt_applied),
          isKtpApplied: o.is_ktp_applied == null ? null : Boolean(o.is_ktp_applied),
        };
      }),
  };
}

const reportSelect = `
  id, report_date, manager, manager_id,
  processed_total, new_in_work, calls_total, validated_total,
  crm_assigned_meetings ( id, entity_name, bin, meeting_date, meeting_type, sort_order ),
  crm_conducted_meetings ( id, entity_name, bin, meeting_date, meeting_type, result, sort_order, cp_sent, cp_quantity, cp_paid ),
  crm_confirmed_orders ( id, entity_name, bin, via_entity_name, via_bin, order_count, amounts, total_amount, sort_order, mrp_kzt_applied, is_ktp_applied, commission_amount )
`;

function mapClientRow(c: {
  name: string;
  bin: string;
  manager_id?: string | null;
  cp_paid?: boolean | null;
  cp_paid_at?: string | null;
  is_ktp?: boolean | null;
  manager?: { full_name?: string | null } | null;
}): UiClient {
  return {
    name: c.name,
    bin: String(c.bin).trim(),
    managerId: c.manager_id ?? null,
    managerName: c.manager?.full_name ?? null,
    cpPaid: Boolean(c.cp_paid),
    cpPaidAt: c.cp_paid_at ?? null,
    ...(c.is_ktp !== undefined ? { isKtp: Boolean(c.is_ktp) } : {}),
  };
}

export async function fetchClientsApi(): Promise<UiClient[]> {
  const { data, error } = await getSupabase()
    .from('crm_clients')
    .select('name, bin, manager_id, cp_paid, cp_paid_at, manager:profiles!crm_clients_manager_id_fkey(full_name)')
    .order('name');
  if (error) throw error;
  return (data || []).map((c) => mapClientRow(c as Parameters<typeof mapClientRow>[0]));
}

/** Админ: справочник с флагом КТП. */
export async function fetchClientsAdminApi(): Promise<UiClient[]> {
  const { data, error } = await getSupabase()
    .from('crm_clients')
    .select(
      'name, bin, manager_id, cp_paid, cp_paid_at, is_ktp, manager:profiles!crm_clients_manager_id_fkey(full_name)',
    )
    .order('name');
  if (error) throw error;
  return (data || []).map((c) => mapClientRow(c as Parameters<typeof mapClientRow>[0]));
}

export async function fetchManagerProfilesApi(): Promise<UiManagerProfile[]> {
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('id, full_name, role, is_active')
    .eq('role', 'manager')
    .neq('is_active', false)
    .order('full_name', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data || []).map((r) => ({
    id: String(r.id),
    fullName: String((r.full_name as string | null) || '').trim() || String(r.id).slice(0, 8),
  }));
}

export async function fetchReportsApi(): Promise<FullReport[]> {
  const { data, error } = await getSupabase()
    .from('crm_reports')
    .select(reportSelect)
    .is('crm_assigned_meetings.deleted_at', null)
    .is('crm_conducted_meetings.deleted_at', null)
    .order('report_date', { ascending: false });
  if (error) throw error;
  return (data as unknown as ReportRow[]).map(mapReport);
}

export async function fetchDeletedMeetingsApi(): Promise<DeletedMeeting[]> {
  const supabase = getSupabase();
  const [assignedRes, conductedRes] = await Promise.all([
    supabase
      .from('crm_assigned_meetings')
      .select('id, entity_name, bin, meeting_date, meeting_type, deleted_at, report:crm_reports(manager, report_date)')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false }),
    supabase
      .from('crm_conducted_meetings')
      .select('id, entity_name, bin, meeting_date, meeting_type, result, deleted_at, report:crm_reports(manager, report_date)')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false }),
  ]);
  if (assignedRes.error) throw assignedRes.error;
  if (conductedRes.error) throw conductedRes.error;

  const assignedRows: DeletedMeeting[] = (assignedRes.data || []).map((m) => ({
    id: m.id,
    source: 'assigned',
    entityName: m.entity_name,
    bin: String(m.bin || '').trim(),
    date: m.meeting_date,
    type: m.meeting_type,
    manager: String((m as { report?: { manager?: string } | null }).report?.manager || ''),
    reportDate: String((m as { report?: { report_date?: string } | null }).report?.report_date || ''),
    deletedAt: String(m.deleted_at),
  }));
  const conductedRows: DeletedMeeting[] = (conductedRes.data || []).map((m) => ({
    id: m.id,
    source: 'conducted',
    entityName: m.entity_name,
    bin: String(m.bin || '').trim(),
    date: m.meeting_date,
    type: m.meeting_type,
    result: m.result || '',
    manager: String((m as { report?: { manager?: string } | null }).report?.manager || ''),
    reportDate: String((m as { report?: { report_date?: string } | null }).report?.report_date || ''),
    deletedAt: String(m.deleted_at),
  }));
  return [...assignedRows, ...conductedRows].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

export async function createClientRow(c: UiClient): Promise<UiClient> {
  const { data, error } = await getSupabase()
    .from('crm_clients')
    .insert({ name: c.name, bin: c.bin, manager_id: c.managerId ?? null })
    .select('name, bin, manager_id, cp_paid, cp_paid_at, manager:profiles!crm_clients_manager_id_fkey(full_name)')
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
  return {
    name: data.name,
    bin: String(data.bin).trim(),
    managerId: (data as { manager_id?: string | null }).manager_id ?? null,
    managerName: (data as { manager?: { full_name?: string | null } | null }).manager?.full_name ?? null,
    cpPaid: Boolean((data as { cp_paid?: boolean | null }).cp_paid),
    cpPaidAt: (data as { cp_paid_at?: string | null }).cp_paid_at ?? null,
  };
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
      .select('name, bin, manager_id, cp_paid, cp_paid_at, manager:profiles!crm_clients_manager_id_fkey(full_name)')
      .single();
    if (error) {
      if (error.code === '23505') throw new Error('Контрагент с таким БИН уже существует');
      throw error;
    }
    return {
      name: data.name,
      bin: String(data.bin).trim(),
      managerId: (data as { manager_id?: string | null }).manager_id ?? null,
      managerName: (data as { manager?: { full_name?: string | null } | null }).manager?.full_name ?? null,
      cpPaid: Boolean((data as { cp_paid?: boolean | null }).cp_paid),
      cpPaidAt: (data as { cp_paid_at?: string | null }).cp_paid_at ?? null,
    };
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
  const { data, error } = await getSupabase()
    .from('crm_clients')
    .select('name, bin, manager_id, cp_paid, cp_paid_at, manager:profiles!crm_clients_manager_id_fkey(full_name)')
    .eq('bin', newB)
    .single();
  if (error) throw error;
  return {
    name: data.name,
    bin: String(data.bin).trim(),
    managerId: (data as { manager_id?: string | null }).manager_id ?? null,
    managerName: (data as { manager?: { full_name?: string | null } | null }).manager?.full_name ?? null,
    cpPaid: Boolean((data as { cp_paid?: boolean | null }).cp_paid),
    cpPaidAt: (data as { cp_paid_at?: string | null }).cp_paid_at ?? null,
  };
}

/** Админ: назначить/сменить менеджера у контрагента. */
export async function setClientManager(bin: string, managerId: string | null): Promise<void> {
  const b = bin.trim();
  const { error } = await getSupabase().rpc('set_crm_client_manager', {
    p_bin: b,
    p_manager_id: managerId,
  });
  if (error) throw error;
}

/** Админ: флаг КТП у контрагента. */
export async function setClientKtp(bin: string, isKtp: boolean): Promise<void> {
  const { error } = await getSupabase().rpc('set_crm_client_ktp', {
    p_bin: bin.trim(),
    p_ktp: Boolean(isKtp),
  });
  if (error) throw error;
}

export async function fetchMrpApi(): Promise<number> {
  const { data, error } = await getSupabase().rpc('get_crm_mrp');
  if (error) throw error;
  return Math.max(1, Math.floor(Number(data) || 4325));
}

export async function setMrpApi(mrp: number): Promise<void> {
  const { error } = await getSupabase().rpc('set_crm_mrp', { p_mrp: mrp });
  if (error) throw error;
}

export async function countOrdersWithoutCommissionApi(): Promise<number> {
  const { data, error } = await getSupabase().rpc('count_orders_without_commission');
  if (error) throw error;
  return Math.max(0, Math.floor(Number(data) || 0));
}

export async function backfillOrderCommissionsApi(): Promise<number> {
  const { data, error } = await getSupabase().rpc('backfill_order_commissions');
  if (error) throw error;
  return Math.max(0, Math.floor(Number(data) || 0));
}

/** Админ: общий флаг оплаты ЦП на уровне клиента. */
export async function setClientCpPaid(bin: string, paid: boolean, paidAt?: string | null): Promise<void> {
  const b = bin.trim();
  const { error } = await getSupabase().rpc('set_crm_client_cp_paid', {
    p_bin: b,
    p_paid: Boolean(paid),
    p_paid_at: paid ? (paidAt ?? null) : null,
  });
  if (error) throw error;
}

export async function deleteReportById(reportId: string): Promise<void> {
  const { error } = await getSupabase().from('crm_reports').delete().eq('id', reportId);
  if (error) throw error;
}

export async function deleteAssignedMeetingById(meetingId: string): Promise<void> {
  const { error } = await getSupabase().from('crm_assigned_meetings').update({ deleted_at: new Date().toISOString() }).eq('id', meetingId);
  if (error) throw error;
}

export async function deleteConductedMeetingById(meetingId: string): Promise<void> {
  const { error } = await getSupabase().from('crm_conducted_meetings').update({ deleted_at: new Date().toISOString() }).eq('id', meetingId);
  if (error) throw error;
}

export async function restoreAssignedMeetingById(meetingId: string): Promise<void> {
  const { error } = await getSupabase().from('crm_assigned_meetings').update({ deleted_at: null }).eq('id', meetingId);
  if (error) throw error;
}

export async function restoreConductedMeetingById(meetingId: string): Promise<void> {
  const { error } = await getSupabase().from('crm_conducted_meetings').update({ deleted_at: null }).eq('id', meetingId);
  if (error) throw error;
}

export async function hardDeleteAssignedMeetingById(meetingId: string): Promise<void> {
  const { error } = await getSupabase().from('crm_assigned_meetings').delete().eq('id', meetingId);
  if (error) throw error;
}

export async function hardDeleteConductedMeetingById(meetingId: string): Promise<void> {
  const { error } = await getSupabase().from('crm_conducted_meetings').delete().eq('id', meetingId);
  if (error) throw error;
}

export type ClientStandaloneCp = {
  id: string;
  managerId: string;
  bin: string;
  cpQuantity: number;
  cpPaid: boolean;
};

export async function fetchStandaloneCpApi(): Promise<ClientStandaloneCp[]> {
  const { data, error } = await getSupabase()
    .from('crm_client_standalone_cp')
    .select('id, manager_id, bin, cp_quantity, cp_paid');
  if (error) throw error;
  return (data || []).map((r) => ({
    id: String(r.id),
    managerId: String(r.manager_id),
    bin: String(r.bin).trim(),
    cpQuantity: Math.max(0, Number(r.cp_quantity ?? 0) || 0),
    cpPaid: Boolean(r.cp_paid),
  }));
}

/** Добавить новую запись ЦП без встречи. */
export async function createClientStandaloneCp(
  bin: string,
  cpQuantity: number,
  managerId?: string,
): Promise<void> {
  const b = bin.trim();
  const q = Math.max(0, Math.floor(Number(cpQuantity) || 0));
  if (q < 1) throw new Error('Количество должно быть не меньше 1');
  const { error } = await getSupabase().from('crm_client_standalone_cp').insert({
    manager_id: managerId ?? null,
    bin: b,
    cp_quantity: q,
    cp_paid: false,
  });
  if (error) throw error;
}

/** Обновить существующую запись ЦП без встречи по id. При qty=0 запись удаляется. */
export async function updateClientStandaloneCpById(id: string, cpQuantity: number): Promise<void> {
  const q = Math.max(0, Math.floor(Number(cpQuantity) || 0));
  if (q < 1) {
    const { error } = await getSupabase().from('crm_client_standalone_cp').delete().eq('id', id);
    if (error) throw error;
    return;
  }
  const { error } = await getSupabase()
    .from('crm_client_standalone_cp')
    .update({ cp_quantity: q, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

/** Обновить ЦП у проведённой встречи (по id строки в crm_conducted_meetings). */
export async function updateConductedMeetingCpById(meetingId: string, cpSent: boolean, cpQuantity: number): Promise<void> {
  const q = Math.max(0, Math.floor(Number(cpQuantity) || 0));
  const sent = Boolean(cpSent) && q >= 1;
  const { error } = await getSupabase()
    .from('crm_conducted_meetings')
    .update(sent ? { cp_sent: true, cp_quantity: q } : { cp_sent: false, cp_quantity: 0, cp_paid: false })
    .eq('id', meetingId);
  if (error) throw error;
}

/** Админ: отметить конкретную запись ЦП по встрече как оплаченную / нет. */
export async function setConductedMeetingCpPaidById(meetingId: string, paid: boolean): Promise<void> {
  const { error } = await getSupabase().rpc('set_conducted_meeting_cp_paid', {
    p_meeting_id: meetingId,
    p_paid: Boolean(paid),
  });
  if (error) throw error;
}

/** Админ: отметить конкретную запись «ЦП без встречи» как оплаченную / нет. */
export async function setStandaloneCpPaidById(id: string, paid: boolean): Promise<void> {
  const { error } = await getSupabase().rpc('set_client_standalone_cp_paid', {
    p_id: id,
    p_paid: Boolean(paid),
  });
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

export type TelegramDailyReportResult = {
  ok?: boolean;
  reportDate?: string;
  reportDateLabel?: string;
  managers?: number;
  error?: string;
};

/** Ручная отправка ежедневной сводки в Telegram (только admin JWT). */
export async function sendTelegramDailyReportNow(reportDate?: string): Promise<TelegramDailyReportResult> {
  const body: { trigger: string; report_date?: string } = { trigger: 'admin-manual' };
  const ymd = reportDate?.trim();
  if (ymd && /^\d{4}-\d{2}-\d{2}$/.test(ymd)) body.report_date = ymd;

  const { data, error } = await getSupabase().functions.invoke<TelegramDailyReportResult>('telegram-daily-report', {
    body,
  });
  if (data?.error) throw new Error(data.error);
  if (data && data.ok === false) throw new Error(data.error ?? 'Не удалось отправить отчёт');
  if (error) {
    const msg = (data as TelegramDailyReportResult | null)?.error || error.message;
    throw new Error(msg);
  }
  if (!data?.ok) throw new Error('Не удалось отправить отчёт');
  return data;
}
