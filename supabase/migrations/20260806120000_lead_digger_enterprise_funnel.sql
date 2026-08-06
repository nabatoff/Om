-- Лидоруб + гибридная воронка СМБ / крупный бизнес

-- Helpers
CREATE OR REPLACE FUNCTION public.is_lead_digger()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'lead_digger'
      AND COALESCE(p.is_active, true)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_sales_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'manager'
      AND COALESCE(p.is_active, true)
  );
$$;

REVOKE ALL ON FUNCTION public.is_lead_digger() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_sales_manager() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_lead_digger() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_sales_manager() TO authenticated;

-- crm_clients.business_scale
ALTER TABLE public.crm_clients
  ADD COLUMN IF NOT EXISTS business_scale text NOT NULL DEFAULT 'smb';

ALTER TABLE public.crm_clients
  DROP CONSTRAINT IF EXISTS crm_clients_business_scale_check;

ALTER TABLE public.crm_clients
  ADD CONSTRAINT crm_clients_business_scale_check
  CHECK (business_scale IN ('smb', 'enterprise'));

-- Enterprise leads
CREATE TABLE IF NOT EXISTS public.crm_enterprise_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bin text NOT NULL REFERENCES public.crm_clients(bin) ON UPDATE CASCADE,
  creator_id uuid NOT NULL REFERENCES public.profiles(id),
  distributor_id uuid REFERENCES public.profiles(id),
  assigned_manager_id uuid REFERENCES public.profiles(id),
  routing_status text NOT NULL DEFAULT 'pending_distribution'
    CHECK (routing_status IN ('pending_distribution', 'assigned_to_manager', 'returned_to_smb')),
  meeting_status text
    CHECK (meeting_status IS NULL OR meeting_status IN ('completed', 'cancelled')),
  transferred_at timestamptz NOT NULL DEFAULT now(),
  assigned_at timestamptz,
  returned_at timestamptz,
  assigned_meeting_id uuid REFERENCES public.crm_assigned_meetings(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_enterprise_leads_routing_idx
  ON public.crm_enterprise_leads (routing_status, transferred_at DESC);
CREATE INDEX IF NOT EXISTS crm_enterprise_leads_creator_idx
  ON public.crm_enterprise_leads (creator_id, transferred_at DESC);
CREATE INDEX IF NOT EXISTS crm_enterprise_leads_manager_idx
  ON public.crm_enterprise_leads (assigned_manager_id, routing_status);
CREATE INDEX IF NOT EXISTS crm_enterprise_leads_bin_idx
  ON public.crm_enterprise_leads (bin);

-- One active enterprise route per BIN (pending or assigned)
CREATE UNIQUE INDEX IF NOT EXISTS crm_enterprise_leads_active_bin_uidx
  ON public.crm_enterprise_leads (bin)
  WHERE routing_status IN ('pending_distribution', 'assigned_to_manager');

-- Audit
CREATE TABLE IF NOT EXISTS public.crm_lead_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.crm_enterprise_leads(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id),
  action text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_lead_events_lead_idx
  ON public.crm_lead_events (lead_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.log_crm_lead_event(
  p_lead_id uuid,
  p_action text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.crm_lead_events (lead_id, actor_id, action, payload)
  VALUES (p_lead_id, auth.uid(), p_action, coalesce(p_payload, '{}'::jsonb));
END;
$$;

-- Allow lead_digger as client assignee (SMB)
CREATE OR REPLACE FUNCTION public.set_crm_client_manager(p_bin text, p_manager_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bin text := regexp_replace(trim(coalesce(p_bin, '')), '[^0-9]', '', 'g');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_admin_write() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF length(v_bin) <> 12 THEN
    RAISE EXCEPTION 'БИН должен состоять ровно из 12 цифр' USING ERRCODE = '23514';
  END IF;

  IF p_manager_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = p_manager_id
        AND p.role IN ('manager', 'lead_digger')
        AND p.is_active IS NOT FALSE
    ) THEN
      RAISE EXCEPTION 'Сотрудник не найден или неактивен';
    END IF;
  END IF;

  UPDATE public.crm_clients
  SET manager_id = p_manager_id
  WHERE bin = v_bin;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Контрагент не найден';
  END IF;
END;
$$;

-- Transfer / set scale
CREATE OR REPLACE FUNCTION public.set_client_business_scale(p_bin text, p_scale text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bin text := regexp_replace(trim(coalesce(p_bin, '')), '[^0-9]', '', 'g');
  v_scale text := lower(trim(coalesce(p_scale, '')));
  v_uid uuid := auth.uid();
  v_client record;
  v_owner_role text;
  v_lead_id uuid;
  v_existing uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
  END IF;
  IF v_scale NOT IN ('smb', 'enterprise') THEN
    RAISE EXCEPTION 'Некорректный масштаб' USING ERRCODE = '23514';
  END IF;
  IF length(v_bin) <> 12 THEN
    RAISE EXCEPTION 'БИН должен состоять ровно из 12 цифр' USING ERRCODE = '23514';
  END IF;

  SELECT c.bin, c.name, c.manager_id, c.business_scale
  INTO v_client
  FROM public.crm_clients c
  WHERE c.bin = v_bin;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Контрагент не найден' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.is_admin_write()
    OR public.is_lead_digger()
    OR public.is_sales_manager()
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Lead digger may only change own SMB cards (or unassigned they created path)
  IF public.is_lead_digger() AND NOT public.is_admin_write() THEN
    IF v_client.manager_id IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'Можно менять масштаб только у своих компаний' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_scale = 'enterprise' THEN
    IF v_client.manager_id IS NOT NULL THEN
      SELECT p.role INTO v_owner_role FROM public.profiles p WHERE p.id = v_client.manager_id;
      IF v_owner_role = 'manager' THEN
        RAISE EXCEPTION 'Компания закреплена за менеджером крупного — нельзя передать в буфер'
          USING ERRCODE = '23514';
      END IF;
    END IF;

    SELECT l.id INTO v_existing
    FROM public.crm_enterprise_leads l
    WHERE l.bin = v_bin
      AND l.routing_status IN ('pending_distribution', 'assigned_to_manager')
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      RAISE EXCEPTION 'Лид уже в воронке крупного' USING ERRCODE = '23505';
    END IF;

    UPDATE public.crm_clients
    SET business_scale = 'enterprise'
    WHERE bin = v_bin;

    INSERT INTO public.crm_enterprise_leads (
      bin, creator_id, routing_status, transferred_at
    )
    VALUES (
      v_bin,
      coalesce(v_client.manager_id, v_uid),
      'pending_distribution',
      now()
    )
    RETURNING id INTO v_lead_id;

    PERFORM public.log_crm_lead_event(v_lead_id, 'transferred', jsonb_build_object('bin', v_bin));
    RETURN v_lead_id;
  END IF;

  -- smb: only if not actively in enterprise funnel (use return RPC for that)
  IF EXISTS (
    SELECT 1 FROM public.crm_enterprise_leads l
    WHERE l.bin = v_bin
      AND l.routing_status IN ('pending_distribution', 'assigned_to_manager')
  ) THEN
    RAISE EXCEPTION 'Сначала верните лид из воронки крупного' USING ERRCODE = '23514';
  END IF;

  UPDATE public.crm_clients
  SET business_scale = 'smb'
  WHERE bin = v_bin;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.set_client_business_scale(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_client_business_scale(text, text) TO authenticated;

-- Ensure report for manager+date
CREATE OR REPLACE FUNCTION public.ensure_crm_report_for_manager(p_manager_id uuid, p_report_date date)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report_id uuid;
  v_name text;
BEGIN
  SELECT trim(coalesce(p.full_name, '')) INTO v_name
  FROM public.profiles p
  WHERE p.id = p_manager_id AND p.role = 'manager' AND coalesce(p.is_active, true);

  IF v_name IS NULL OR v_name = '' THEN
    RAISE EXCEPTION 'Менеджер не найден' USING ERRCODE = 'P0002';
  END IF;

  SELECT r.id INTO v_report_id
  FROM public.crm_reports r
  WHERE r.manager_id = p_manager_id AND r.report_date = p_report_date
  LIMIT 1;

  IF v_report_id IS NULL THEN
    INSERT INTO public.crm_reports (
      report_date, manager, manager_id,
      processed_total, new_in_work, calls_total, validated_total
    )
    VALUES (p_report_date, v_name, p_manager_id, 0, 0, 0, 0)
    RETURNING id INTO v_report_id;
  END IF;

  RETURN v_report_id;
END;
$$;

-- Admin assign / reassign
CREATE OR REPLACE FUNCTION public.admin_assign_enterprise_lead(p_lead_id uuid, p_manager_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead record;
  v_report_id uuid;
  v_meeting_id uuid;
  v_client_name text;
  v_today date := (timezone('Asia/Almaty', now()))::date;
  v_prev_manager uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_admin_write() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_lead FROM public.crm_enterprise_leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Лид не найден' USING ERRCODE = 'P0002';
  END IF;
  IF v_lead.routing_status = 'returned_to_smb' THEN
    RAISE EXCEPTION 'Лид уже возвращён на СМБ' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_manager_id AND p.role = 'manager' AND coalesce(p.is_active, true)
  ) THEN
    RAISE EXCEPTION 'Менеджер не найден или неактивен' USING ERRCODE = 'P0002';
  END IF;

  SELECT c.name INTO v_client_name FROM public.crm_clients c WHERE c.bin = v_lead.bin;

  v_prev_manager := v_lead.assigned_manager_id;
  v_report_id := public.ensure_crm_report_for_manager(p_manager_id, v_today);

  -- Reassign: drop old meeting link if different manager
  IF v_lead.assigned_meeting_id IS NOT NULL AND v_prev_manager IS DISTINCT FROM p_manager_id THEN
    DELETE FROM public.crm_assigned_meetings WHERE id = v_lead.assigned_meeting_id;
  END IF;

  IF v_lead.assigned_meeting_id IS NULL OR v_prev_manager IS DISTINCT FROM p_manager_id THEN
    INSERT INTO public.crm_assigned_meetings (
      report_id, entity_name, bin, meeting_date, meeting_type, sort_order
    )
    VALUES (
      v_report_id,
      coalesce(v_client_name, v_lead.bin),
      v_lead.bin,
      v_today,
      'Крупный лид',
      coalesce((SELECT max(m.sort_order) + 1 FROM public.crm_assigned_meetings m WHERE m.report_id = v_report_id), 0)
    )
    RETURNING id INTO v_meeting_id;
  ELSE
    v_meeting_id := v_lead.assigned_meeting_id;
    UPDATE public.crm_assigned_meetings
    SET meeting_date = v_today
    WHERE id = v_meeting_id;
  END IF;

  UPDATE public.crm_clients
  SET manager_id = p_manager_id, business_scale = 'enterprise'
  WHERE bin = v_lead.bin;

  UPDATE public.crm_enterprise_leads
  SET
    assigned_manager_id = p_manager_id,
    distributor_id = auth.uid(),
    routing_status = 'assigned_to_manager',
    assigned_at = coalesce(assigned_at, now()),
    assigned_meeting_id = v_meeting_id,
    meeting_status = CASE WHEN v_prev_manager IS DISTINCT FROM p_manager_id THEN NULL ELSE meeting_status END,
    updated_at = now()
  WHERE id = p_lead_id;

  PERFORM public.log_crm_lead_event(
    p_lead_id,
    CASE WHEN v_prev_manager IS NULL THEN 'assigned' ELSE 'reassigned' END,
    jsonb_build_object('manager_id', p_manager_id, 'prev_manager_id', v_prev_manager)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_assign_enterprise_lead(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_assign_enterprise_lead(uuid, uuid) TO authenticated;

-- Manager meeting status
CREATE OR REPLACE FUNCTION public.manager_set_lead_meeting_status(p_lead_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead record;
  v_status text := lower(trim(coalesce(p_status, '')));
  v_report_id uuid;
  v_conducted_id uuid;
  v_client_name text;
  v_meeting_date date;
  v_meeting_type text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
  END IF;
  IF v_status NOT IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'Статус: completed или cancelled' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_lead FROM public.crm_enterprise_leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Лид не найден' USING ERRCODE = 'P0002';
  END IF;
  IF v_lead.routing_status <> 'assigned_to_manager' THEN
    RAISE EXCEPTION 'Лид не у менеджера' USING ERRCODE = '23514';
  END IF;
  IF NOT public.is_admin_write() AND v_lead.assigned_manager_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT c.name INTO v_client_name FROM public.crm_clients c WHERE c.bin = v_lead.bin;

  IF v_lead.assigned_meeting_id IS NOT NULL THEN
    SELECT m.meeting_date, m.meeting_type, m.report_id
    INTO v_meeting_date, v_meeting_type, v_report_id
    FROM public.crm_assigned_meetings m
    WHERE m.id = v_lead.assigned_meeting_id;
  END IF;

  v_meeting_date := coalesce(v_meeting_date, (timezone('Asia/Almaty', now()))::date);
  v_meeting_type := coalesce(nullif(trim(v_meeting_type), ''), 'Крупный лид');

  IF v_status = 'completed' THEN
    v_report_id := coalesce(
      v_report_id,
      public.ensure_crm_report_for_manager(v_lead.assigned_manager_id, v_meeting_date)
    );

    INSERT INTO public.crm_conducted_meetings (
      report_id, entity_name, bin, meeting_date, meeting_type, result, sort_order,
      cp_sent, cp_quantity, cp_paid
    )
    VALUES (
      v_report_id,
      coalesce(v_client_name, v_lead.bin),
      v_lead.bin,
      v_meeting_date,
      v_meeting_type,
      'Проведена (крупный лид)',
      coalesce((SELECT max(m.sort_order) + 1 FROM public.crm_conducted_meetings m WHERE m.report_id = v_report_id), 0),
      false, 0, false
    )
    RETURNING id INTO v_conducted_id;
  END IF;

  UPDATE public.crm_enterprise_leads
  SET meeting_status = v_status, updated_at = now()
  WHERE id = p_lead_id;

  PERFORM public.log_crm_lead_event(
    p_lead_id,
    v_status,
    jsonb_build_object('conducted_id', v_conducted_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.manager_set_lead_meeting_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manager_set_lead_meeting_status(uuid, text) TO authenticated;

-- Return to SMB
CREATE OR REPLACE FUNCTION public.manager_return_lead_to_smb(p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_lead FROM public.crm_enterprise_leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Лид не найден' USING ERRCODE = 'P0002';
  END IF;
  IF v_lead.routing_status <> 'assigned_to_manager' THEN
    RAISE EXCEPTION 'Вернуть можно только лид у менеджера' USING ERRCODE = '23514';
  END IF;
  IF NOT public.is_admin_write() AND v_lead.assigned_manager_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.crm_clients
  SET business_scale = 'smb', manager_id = v_lead.creator_id
  WHERE bin = v_lead.bin;

  UPDATE public.crm_enterprise_leads
  SET
    routing_status = 'returned_to_smb',
    returned_at = now(),
    updated_at = now()
  WHERE id = p_lead_id;

  PERFORM public.log_crm_lead_event(
    p_lead_id,
    'returned_to_smb',
    jsonb_build_object(
      'prev_manager_id', v_lead.assigned_manager_id,
      'creator_id', v_lead.creator_id
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.manager_return_lead_to_smb(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manager_return_lead_to_smb(uuid) TO authenticated;

-- Lists / analytics
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
          WHEN 'mine_assigned' THEN l.routing_status = 'assigned_to_manager' AND l.assigned_manager_id = auth.uid()
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
      ELSE false
    END
  ORDER BY l.transferred_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_enterprise_leads(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_enterprise_leads(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.lead_digger_conversion_stats()
RETURNS TABLE (
  creator_id uuid,
  creator_name text,
  transferred_count bigint,
  completed_count bigint,
  conversion numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.creator_id,
    trim(coalesce(p.full_name, '')),
    count(*)::bigint AS transferred_count,
    count(*) FILTER (WHERE l.meeting_status = 'completed')::bigint AS completed_count,
    CASE
      WHEN count(*) = 0 THEN 0
      ELSE round(
        (count(*) FILTER (WHERE l.meeting_status = 'completed')::numeric / count(*)::numeric) * 100,
        1
      )
    END AS conversion
  FROM public.crm_enterprise_leads l
  LEFT JOIN public.profiles p ON p.id = l.creator_id
  WHERE public.is_admin()
  GROUP BY l.creator_id, p.full_name
  ORDER BY count(*) DESC;
$$;

REVOKE ALL ON FUNCTION public.lead_digger_conversion_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lead_digger_conversion_stats() TO authenticated;

CREATE OR REPLACE FUNCTION public.list_lead_events(p_lead_id uuid)
RETURNS TABLE (
  id uuid,
  actor_id uuid,
  actor_name text,
  action text,
  payload jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
  END IF;
  IF NOT (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.crm_enterprise_leads l
      WHERE l.id = p_lead_id
        AND (l.creator_id = auth.uid() OR l.assigned_manager_id = auth.uid())
    )
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT e.id, e.actor_id, trim(coalesce(p.full_name, '')), e.action, e.payload, e.created_at
  FROM public.crm_lead_events e
  LEFT JOIN public.profiles p ON p.id = e.actor_id
  WHERE e.lead_id = p_lead_id
  ORDER BY e.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_lead_events(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_lead_events(uuid) TO authenticated;

-- RLS
ALTER TABLE public.crm_enterprise_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_lead_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_enterprise_leads_select ON public.crm_enterprise_leads;
CREATE POLICY crm_enterprise_leads_select ON public.crm_enterprise_leads
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR creator_id = auth.uid()
    OR assigned_manager_id = auth.uid()
  );

DROP POLICY IF EXISTS crm_lead_events_select ON public.crm_lead_events;
CREATE POLICY crm_lead_events_select ON public.crm_lead_events
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.crm_enterprise_leads l
      WHERE l.id = lead_id
        AND (l.creator_id = auth.uid() OR l.assigned_manager_id = auth.uid())
    )
  );

-- Mutations go through SECURITY DEFINER RPCs (no INSERT/UPDATE/DELETE policies = deny)


-- Realtime
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_enterprise_leads;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END;
$$;
