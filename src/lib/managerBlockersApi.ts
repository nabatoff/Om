import { getSupabase } from './supabase';

export type ManagerBlocker = {
  id: string;
  managerId: string;
  managerName: string;
  bin: string;
  entityName: string;
  description: string;
  status: 'active' | 'resolved';
  createdAt: string;
  resolvedAt: string | null;
  resolvedReportDate: string | null;
};

export type BlockerCountRow = {
  managerId: string;
  managerName: string;
  reportDate: string;
  resolvedCount: number;
};

function mapBlocker(r: Record<string, unknown>): ManagerBlocker {
  return {
    id: String(r.id),
    managerId: String(r.manager_id),
    managerName: String(r.manager_name ?? ''),
    bin: String(r.bin ?? ''),
    entityName: String(r.entity_name ?? ''),
    description: String(r.description ?? ''),
    status: r.status === 'resolved' ? 'resolved' : 'active',
    createdAt: String(r.created_at ?? ''),
    resolvedAt: r.resolved_at ? String(r.resolved_at) : null,
    resolvedReportDate: r.resolved_report_date ? String(r.resolved_report_date).slice(0, 10) : null,
  };
}

export async function listManagerBlockersApi(activeOnly = true): Promise<ManagerBlocker[]> {
  const { data, error } = await getSupabase().rpc('list_manager_blockers', {
    p_active_only: activeOnly,
  });
  if (error) throw error;
  return (data || []).map((r: Record<string, unknown>) => mapBlocker(r));
}

export async function createManagerBlockerApi(
  bin: string,
  entityName: string,
  description: string,
): Promise<string> {
  const { data, error } = await getSupabase().rpc('create_manager_blocker', {
    p_bin: bin,
    p_entity_name: entityName,
    p_description: description,
  });
  if (error) throw error;
  return String(data);
}

export async function resolveManagerBlockerApi(blockerId: string): Promise<void> {
  const { error } = await getSupabase().rpc('resolve_manager_blocker', {
    p_blocker_id: blockerId,
  });
  if (error) throw error;
}

export async function countResolvedBlockersApi(
  from: string,
  to: string,
  managerId?: string | null,
): Promise<BlockerCountRow[]> {
  const { data, error } = await getSupabase().rpc('count_resolved_blockers', {
    p_from: from,
    p_to: to,
    p_manager_id: managerId ?? null,
  });
  if (error) throw error;
  return (data || []).map((r: Record<string, unknown>) => ({
    managerId: String(r.manager_id),
    managerName: String(r.manager_name ?? ''),
    reportDate: String(r.report_date ?? '').slice(0, 10),
    resolvedCount: Number(r.resolved_count ?? 0),
  }));
}
