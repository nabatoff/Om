-- Админ на странице «Лиды» хочет видеть итог встречи для лидов, у которых менеджер её уже
-- провёл. Добавляем meeting_result в list_enterprise_leads: берём итог первой проведённой
-- «Крупный лид» встречи по этому БИН у назначенного менеджера (тот же критерий, что и в
-- триггере sync_enterprise_lead_for_krup_meeting, который и выставляет meeting_status='completed').
DROP FUNCTION IF EXISTS public.list_enterprise_leads(text);

CREATE FUNCTION public.list_enterprise_leads(p_filter text DEFAULT 'pending')
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
  meeting_date date,
  confirmed_order_amount numeric,
  confirmed_order_count integer,
  meeting_result text
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
    m.meeting_date,
    coalesce(ord.confirmed_order_amount, 0) AS confirmed_order_amount,
    coalesce(ord.confirmed_order_count, 0)::int AS confirmed_order_count,
    fact.result AS meeting_result
  FROM public.crm_enterprise_leads l
  JOIN public.crm_clients c ON c.bin = l.bin
  LEFT JOIN public.profiles cr ON cr.id = l.creator_id
  LEFT JOIN public.profiles di ON di.id = l.distributor_id
  LEFT JOIN public.profiles am ON am.id = l.assigned_manager_id
  LEFT JOIN public.crm_assigned_meetings m ON m.id = l.assigned_meeting_id
  LEFT JOIN LATERAL (
    SELECT sum(o.total_amount) AS confirmed_order_amount, sum(o.order_count) AS confirmed_order_count
    FROM public.crm_confirmed_orders o
    WHERE regexp_replace(coalesce(o.bin, ''), '\D', '', 'g') = regexp_replace(coalesce(l.bin, ''), '\D', '', 'g')
      AND regexp_replace(coalesce(l.bin, ''), '\D', '', 'g') <> ''
  ) ord ON true
  LEFT JOIN LATERAL (
    SELECT cm.result
    FROM public.crm_conducted_meetings cm
    JOIN public.crm_reports r ON r.id = cm.report_id
    WHERE cm.deleted_at IS NULL
      AND r.manager_id = l.assigned_manager_id
      AND regexp_replace(coalesce(cm.bin, ''), '\D', '', 'g') = regexp_replace(coalesce(l.bin, ''), '\D', '', 'g')
      AND regexp_replace(coalesce(l.bin, ''), '\D', '', 'g') <> ''
      AND lower(replace(coalesce(cm.meeting_type, ''), 'ё', 'е')) LIKE '%крупн%'
    ORDER BY cm.meeting_date, cm.id
    LIMIT 1
  ) fact ON l.meeting_status = 'completed'
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
            AND coalesce(l.meeting_status, '') NOT IN ('completed', 'in_work')
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
        AND coalesce(l.meeting_status, '') NOT IN ('completed', 'in_work')
      ELSE false
    END
  ORDER BY l.transferred_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_enterprise_leads(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_enterprise_leads(text) TO authenticated;
