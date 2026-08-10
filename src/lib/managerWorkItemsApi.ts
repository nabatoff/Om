import { getSupabase } from './supabase';

export type WorkItemStatus = 'in_work' | 'waiting' | 'blocked' | 'done';

export const WORK_ITEM_STATUS_OPTIONS: Array<{ value: WorkItemStatus; label: string }> = [
  { value: 'in_work', label: 'В работе' },
  { value: 'waiting', label: 'Ожидание' },
  { value: 'blocked', label: 'Блокер' },
  { value: 'done', label: 'Готово' },
];

export type ManagerWorkItem = {
  id: string;
  reportId: string;
  bin: string;
  entityName: string;
  status: WorkItemStatus;
  nextStep: string;
  deadline: string;
  blockers: string;
  sortOrder: number;
  updatedAt: string;
};

export type ManagerWorkItemPeriodRow = ManagerWorkItem & {
  reportDate: string;
  managerId: string | null;
  managerName: string;
};

function asStatus(raw: unknown): WorkItemStatus {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'waiting' || s === 'blocked' || s === 'done' || s === 'in_work') return s;
  return 'in_work';
}

function mapItem(r: Record<string, unknown>): ManagerWorkItem {
  return {
    id: String(r.id ?? ''),
    reportId: String(r.report_id ?? ''),
    bin: String(r.bin ?? ''),
    entityName: String(r.entity_name ?? ''),
    status: asStatus(r.status),
    nextStep: String(r.next_step ?? ''),
    deadline: r.deadline ? String(r.deadline).slice(0, 10) : '',
    blockers: String(r.blockers ?? ''),
    sortOrder: Number(r.sort_order) || 0,
    updatedAt: String(r.updated_at ?? ''),
  };
}

export async function listCrmWorkItemsForDate(reportDate: string): Promise<ManagerWorkItem[]> {
  const { data, error } = await getSupabase().rpc('list_crm_work_items_for_date', {
    p_report_date: reportDate,
  });
  if (error) throw error;
  return ((data || []) as Record<string, unknown>[]).map(mapItem);
}

export async function saveCrmWorkItemsApi(
  reportDate: string,
  items: Array<{
    bin: string;
    entityName: string;
    status: WorkItemStatus;
    nextStep: string;
    deadline: string;
    blockers: string;
    sortOrder: number;
  }>,
): Promise<string> {
  const payload = items.map((it, i) => ({
    bin: it.bin.replace(/\D/g, ''),
    entity_name: it.entityName.trim(),
    status: it.status,
    next_step: it.nextStep,
    deadline: it.deadline.trim() || null,
    blockers: it.blockers,
    sort_order: it.sortOrder ?? i,
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
    p_from: from || null,
    p_to: to || null,
    p_manager_id: managerId || null,
  });
  if (error) throw error;
  return ((data || []) as Record<string, unknown>[]).map((r) => ({
    ...mapItem(r),
    reportDate: String(r.report_date ?? '').slice(0, 10),
    managerId: r.manager_id ? String(r.manager_id) : null,
    managerName: String(r.manager_name ?? ''),
  }));
}

export function workItemStatusLabel(status: WorkItemStatus): string {
  return WORK_ITEM_STATUS_OPTIONS.find((o) => o.value === status)?.label || status;
}
