import { getSupabase } from './supabase';

export type EnterpriseLead = {
  id: string;
  bin: string;
  clientName: string;
  creatorId: string;
  creatorName: string;
  distributorId: string | null;
  distributorName: string;
  assignedManagerId: string | null;
  assignedManagerName: string;
  routingStatus: 'pending_distribution' | 'assigned_to_manager' | 'returned_to_smb';
  meetingStatus: 'completed' | 'cancelled' | null;
  transferredAt: string;
  assignedAt: string | null;
  returnedAt: string | null;
  assignedMeetingId: string | null;
  meetingDate: string | null;
};

export type LeadEvent = {
  id: string;
  actorId: string | null;
  actorName: string;
  action: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type LeadDiggerConversionRow = {
  creatorId: string;
  creatorName: string;
  transferredCount: number;
  completedCount: number;
  conversion: number;
};

function mapLead(r: Record<string, unknown>): EnterpriseLead {
  return {
    id: String(r.id),
    bin: String(r.bin ?? ''),
    clientName: String(r.client_name ?? ''),
    creatorId: String(r.creator_id ?? ''),
    creatorName: String(r.creator_name ?? ''),
    distributorId: r.distributor_id ? String(r.distributor_id) : null,
    distributorName: String(r.distributor_name ?? ''),
    assignedManagerId: r.assigned_manager_id ? String(r.assigned_manager_id) : null,
    assignedManagerName: String(r.assigned_manager_name ?? ''),
    routingStatus: String(r.routing_status) as EnterpriseLead['routingStatus'],
    meetingStatus: (r.meeting_status as EnterpriseLead['meetingStatus']) ?? null,
    transferredAt: String(r.transferred_at ?? ''),
    assignedAt: r.assigned_at ? String(r.assigned_at) : null,
    returnedAt: r.returned_at ? String(r.returned_at) : null,
    assignedMeetingId: r.assigned_meeting_id ? String(r.assigned_meeting_id) : null,
    meetingDate: r.meeting_date ? String(r.meeting_date).slice(0, 10) : null,
  };
}

export async function setClientBusinessScaleApi(bin: string, scale: 'smb' | 'enterprise'): Promise<string | null> {
  const { data, error } = await getSupabase().rpc('set_client_business_scale', {
    p_bin: bin,
    p_scale: scale,
  });
  if (error) throw error;
  return data ? String(data) : null;
}

export async function listEnterpriseLeadsApi(
  filter: 'pending' | 'assigned' | 'returned' | 'all' | 'mine_assigned' = 'pending',
): Promise<EnterpriseLead[]> {
  const { data, error } = await getSupabase().rpc('list_enterprise_leads', { p_filter: filter });
  if (error) throw error;
  return ((data || []) as Record<string, unknown>[]).map((r) => mapLead(r));
}

export async function adminAssignEnterpriseLeadApi(leadId: string, managerId: string): Promise<void> {
  const { error } = await getSupabase().rpc('admin_assign_enterprise_lead', {
    p_lead_id: leadId,
    p_manager_id: managerId,
  });
  if (error) throw error;
}

export async function managerSetLeadMeetingStatusApi(
  leadId: string,
  status: 'completed' | 'cancelled',
): Promise<void> {
  const { error } = await getSupabase().rpc('manager_set_lead_meeting_status', {
    p_lead_id: leadId,
    p_status: status,
  });
  if (error) throw error;
}

export async function managerReturnLeadToSmbApi(leadId: string): Promise<void> {
  const { error } = await getSupabase().rpc('manager_return_lead_to_smb', { p_lead_id: leadId });
  if (error) throw error;
}

export async function listLeadEventsApi(leadId: string): Promise<LeadEvent[]> {
  const { data, error } = await getSupabase().rpc('list_lead_events', { p_lead_id: leadId });
  if (error) throw error;
  return (data || []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    actorId: r.actor_id ? String(r.actor_id) : null,
    actorName: String(r.actor_name ?? ''),
    action: String(r.action ?? ''),
    payload: (r.payload as Record<string, unknown>) || {},
    createdAt: String(r.created_at ?? ''),
  }));
}

export async function leadDiggerConversionStatsApi(): Promise<LeadDiggerConversionRow[]> {
  const { data, error } = await getSupabase().rpc('lead_digger_conversion_stats');
  if (error) throw error;
  return (data || []).map((r: Record<string, unknown>) => ({
    creatorId: String(r.creator_id),
    creatorName: String(r.creator_name ?? ''),
    transferredCount: Number(r.transferred_count || 0),
    completedCount: Number(r.completed_count || 0),
    conversion: Number(r.conversion || 0),
  }));
}

/** UI status for lead digger transferred list */
export function leadDisplayStatus(lead: EnterpriseLead): {
  key: 'pending' | 'waiting' | 'done' | 'cancelled' | 'returned';
  label: string;
  color: string;
} {
  if (lead.routingStatus === 'returned_to_smb') {
    return { key: 'returned', label: 'Возврат на СМБ', color: 'bg-orange-100 text-orange-700' };
  }
  if (lead.routingStatus === 'pending_distribution') {
    return { key: 'pending', label: 'На распределении', color: 'bg-gray-200 text-gray-600' };
  }
  if (lead.meetingStatus === 'completed') {
    return { key: 'done', label: 'Проведена', color: 'bg-emerald-100 text-emerald-700' };
  }
  if (lead.meetingStatus === 'cancelled') {
    return { key: 'cancelled', label: 'Не состоялась', color: 'bg-red-100 text-red-700' };
  }
  return { key: 'waiting', label: 'Ожидает встречи', color: 'bg-yellow-100 text-yellow-700' };
}

export function formatLeadDate(iso: string | null): string {
  if (!iso) return '—';
  const d = iso.slice(0, 10);
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return iso;
  return `${day}.${m}.${y}`;
}
