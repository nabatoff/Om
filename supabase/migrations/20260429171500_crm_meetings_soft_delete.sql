alter table public.crm_assigned_meetings
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

alter table public.crm_conducted_meetings
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

create index if not exists crm_assigned_meetings_deleted_at_idx
  on public.crm_assigned_meetings (deleted_at);

create index if not exists crm_conducted_meetings_deleted_at_idx
  on public.crm_conducted_meetings (deleted_at);
