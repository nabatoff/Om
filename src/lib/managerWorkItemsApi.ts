import { getSupabase } from './supabase';

export type WorkItemStatus = 'in_work' | 'waiting' | 'blocked' | 'done';

export type ManagerWorkItem = {
  id: string;
  reportId: string;
  bin: string;
  entityName: string;
  status: WorkItemStatus;
  nextStep: string;
  deadline: string | null;
  blockers: string;
  sortOrder: number;
  updatedAt: string;
};

export type ManagerWorkItemPeriodRow = ManagerWorkItem & {
  reportDate: string;
  managerId: string | null;
  managerName: string;
};

function mapRow(r: Record<string, unknown>): ManagerWorkItem {
  return {
    id: String(r.id),
    reportId: String(r.report_id),
    bin: String(r.bin ?? ''),
    entityName: String(r.entity_name ?? ''),
    status: (String(r.status ?? 'in_work') as WorkItemStatus) || 'in_work',
    nextStep: String(r.next_step ?? ''),
    deadline: r.deadline ? String(r.deadline).slice(0, 10) : null,
    blockers: String(r.blockers ?? ''),
    sortOrder: Number(r.sort_order ?? 0),
    updatedAt: String(r.updated_at ?? ''),
  };
}

function mapPeriodRow(r: Record<string, unknown>): ManagerWorkItemPeriodRow {
  return {
    ...mapRow(r),
    reportDate: String(r.report_date ?? '').slice(0, 10),
    managerId: r.manager_id ? String(r.manager_id) : null,
    managerName: String(r.manager_name ?? r.manager ?? ''),
  };
}

export async function listWorkItemsForDateApi(reportDate: string): Promise<ManagerWorkItem[]> {
  const { data, error } = await getSupabase().rpc('list_crm_work_items_for_date', {
    p_report_date: reportDate,
  });
  if (error) throw error;
  return (data || []).map((r: Record<string, unknown>) => mapRow(r));
}

export type SaveWorkItemInput = {
  bin: string;
  entityName: string;
  status: WorkItemStatus;
  nextStep: string;
  deadline: string | null;
  blockers: string;
  sortOrder: number;
};

export async function saveWorkItemsApi(reportDate: string, items: SaveWorkItemInput[]): Promise<string> {
  const payload = items.map((it) => ({
    bin: it.bin,
    entity_name: it.entityName,
    status: it.status,
    next_step: it.nextStep,
    deadline: it.deadline || '',
    blockers: it.blockers,
    sort_order: it.sortOrder,
  }));
  const { data, error } = await getSupabase().rpc('save_crm_work_items', {
    p_report_date: reportDate,
    p_items: payload,
  });
  if (error) throw error;
  return String(data);
}

export async function listManagerWorkItemsPeriodApi(
  from: string,
  to: string,
  managerId?: string | null,
): Promise<ManagerWorkItemPeriodRow[]> {
  const { data, error } = await getSupabase().rpc('list_manager_work_items', {
    p_from: from,
    p_to: to,
    p_manager_id: managerId ?? null,
  });
  if (error) throw error;
  return (data || []).map((r: Record<string, unknown>) => mapPeriodRow(r));
}
