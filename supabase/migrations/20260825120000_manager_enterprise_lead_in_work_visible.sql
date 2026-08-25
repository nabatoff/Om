-- Лид, взятый менеджером «в работу» (без изначально назначенной встречи), пропадал из
-- list_enterprise_leads('mine_assigned') навсегда — карточку с кнопками «Провести встречу» /
-- «Не состоялась» показать было негде, и лид никогда не засчитывался лидорубу. Убираем
-- in_work из списка исключений (остаётся только completed) — карточка остаётся видимой, пока
-- менеджер не отметит встречу как проведённую/несостоявшуюся.
CREATE OR REPLACE FUNCTION public.list_enterprise_leads(p_filter text DEFAULT 'pending')
RETURNS TABLE (
  id uuid,
  bin text,
  client_name text,
  creator_id uuid,
  creator_name text,
  distributor_id uuid,
  distributor_name text,
  assigned_manager_id uuid,
  assigned_manager_name text,
  routing_status text,
  meeting_status text,
  transferred_at timestamptz,
  transferred_on date,
  meeting_requested boolean,
  assigned_at timestamptz,
  returned_at timestamptz,
  assigned_meeting_id uuid,
  meeting_date date
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_filter text := lower(trim(coalesce(p_filter, 'pending')));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
  END IF;

  RETURN QUERY
  SELECT
    l.id,
    l.bin,
    c.name AS client_name,
    l.creator_id,
    trim(coalesce(cr.full_name, '')) AS creator_name,
    l.distributor_id,
    trim(coalesce(di.full_name, '')) AS distributor_name,
    l.assigned_manager_id,
    trim(coalesce(am.full_name, '')) AS assigned_manager_name,
    l.routing_status,
    l.meeting_status,
    l.transferred_at,
    coalesce(l.transferred_on, (timezone('Asia/Almaty', l.transferred_at))::date) AS transferred_on,
    coalesce(l.meeting_requested, false) AS meeting_requested,
    l.assigned_at,
    l.returned_at,
    l.assigned_meeting_id,
    m.meeting_date
  FROM public.crm_enterprise_leads l
  JOIN public.crm_clients c ON c.bin = l.bin
  LEFT JOIN public.profiles cr ON cr.id = l.creator_id
  LEFT JOIN public.profiles di ON di.id = l.distributor_id
  LEFT JOIN public.profiles am ON am.id = l.assigned_manager_id
  LEFT JOIN public.crm_assigned_meetings m ON m.id = l.assigned_meeting_id
  WHERE
    CASE
      WHEN public.is_admin() THEN
        CASE v_filter
          WHEN 'pending' THEN l.routing_status = 'pending_distribution'
          WHEN 'assigned' THEN l.routing_status = 'assigned_to_manager'
          WHEN 'returned' THEN l.routing_status = 'returned_to_smb'
          WHEN 'mine_assigned' THEN
            l.routing_status = 'assigned_to_manager'
            AND l.assigned_manager_id = auth.uid()
            AND coalesce(l.meeting_status, '') <> 'completed'
          ELSE true
        END
      WHEN public.is_lead_digger() THEN
        l.creator_id = auth.uid()
        AND CASE v_filter
          WHEN 'returned' THEN l.routing_status = 'returned_to_smb'
          WHEN 'pending' THEN l.routing_status = 'pending_distribution'
          WHEN 'assigned' THEN l.routing_status = 'assigned_to_manager'
          ELSE l.routing_status IN ('pending_distribution', 'assigned_to_manager', 'returned_to_smb')
        END
      WHEN public.is_sales_manager() THEN
        l.assigned_manager_id = auth.uid()
        AND l.routing_status = 'assigned_to_manager'
        AND coalesce(l.meeting_status, '') <> 'completed'
      ELSE false
    END
  ORDER BY l.transferred_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_enterprise_leads(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_enterprise_leads(text) TO authenticated;
