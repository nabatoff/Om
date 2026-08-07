-- meeting_requested + transferred_on; conditional assign meeting; delete returns by BIN;
-- list columns; telegram managers vs diggers split

ALTER TABLE public.crm_enterprise_leads
  ADD COLUMN IF NOT EXISTS meeting_requested boolean NOT NULL DEFAULT false;

ALTER TABLE public.crm_enterprise_leads
  ADD COLUMN IF NOT EXISTS transferred_on date;

UPDATE public.crm_enterprise_leads
SET transferred_on = (timezone('Asia/Almaty', transferred_at))::date
WHERE transferred_on IS NULL;

ALTER TABLE public.crm_enterprise_leads
  ALTER COLUMN transferred_on SET DEFAULT (timezone('Asia/Almaty', now()))::date;

CREATE INDEX IF NOT EXISTS crm_enterprise_leads_transferred_on_idx
  ON public.crm_enterprise_leads (transferred_on DESC);

-- Single-bin transfer path also stamps new columns
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
  v_lead_id uuid;
  v_existing uuid;
  v_creator uuid;
  v_today date := (timezone('Asia/Almaty', now()))::date;
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

  SELECT c.bin, c.name, c.manager_id, c.digger_id, c.business_scale
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

  IF public.is_lead_digger() AND NOT public.is_admin_write() THEN
    IF v_client.digger_id IS NOT NULL AND v_client.digger_id IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'Можно менять масштаб только у своих компаний' USING ERRCODE = '42501';
    END IF;
    IF v_client.digger_id IS NULL
      AND v_client.manager_id IS NOT NULL
      AND v_client.manager_id IS DISTINCT FROM v_uid
    THEN
      RAISE EXCEPTION 'Можно менять масштаб только у своих компаний' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_scale = 'enterprise' THEN
    SELECT l.id INTO v_existing
    FROM public.crm_enterprise_leads l
    WHERE l.bin = v_bin
      AND l.routing_status IN ('pending_distribution', 'assigned_to_manager')
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      RAISE EXCEPTION 'Лид уже в воронке крупного' USING ERRCODE = '23505';
    END IF;

    v_creator := coalesce(v_client.digger_id, CASE WHEN public.is_lead_digger() THEN v_uid ELSE v_client.manager_id END, v_uid);

    UPDATE public.crm_clients
    SET
      business_scale = 'enterprise',
      digger_id = coalesce(digger_id, CASE WHEN public.is_lead_digger() THEN v_uid ELSE digger_id END)
    WHERE bin = v_bin;

    INSERT INTO public.crm_enterprise_leads (
      bin, creator_id, routing_status, transferred_at, transferred_on, meeting_requested
    )
    VALUES (
      v_bin,
      v_creator,
      'pending_distribution',
      now(),
      v_today,
      false
    )
    RETURNING id INTO v_lead_id;

    PERFORM public.log_crm_lead_event(v_lead_id, 'transferred', jsonb_build_object('bin', v_bin));
    RETURN v_lead_id;
  END IF;

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

CREATE OR REPLACE FUNCTION public.digger_transfer_enterprise_batch(
  p_report_date date,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_bin text;
  v_name text;
  v_meeting boolean;
  v_client record;
  v_existing uuid;
  v_lead_id uuid;
  v_report_id uuid;
  v_meeting_id uuid;
  v_results jsonb := '[]'::jsonb;
  v_seen text[] := ARRAY[]::text[];
  v_idx int := 0;
  v_creator uuid;
  v_today date := (timezone('Asia/Almaty', now()))::date;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.is_lead_digger() OR public.is_admin_write()) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_report_date IS NULL THEN
    RAISE EXCEPTION 'Дата отчёта обязательна' USING ERRCODE = '23514';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Нужен непустой список компаний' USING ERRCODE = '23514';
  END IF;
  IF jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'Максимум 50 компаний за раз' USING ERRCODE = '23514';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_idx := v_idx + 1;
    v_bin := regexp_replace(trim(coalesce(v_item->>'bin', '')), '[^0-9]', '', 'g');
    v_name := trim(coalesce(v_item->>'name', ''));
    v_meeting := coalesce((v_item->>'meeting_scheduled')::boolean, false);

    IF length(v_bin) <> 12 THEN
      RAISE EXCEPTION 'Строка %: БИН должен состоять ровно из 12 цифр', v_idx USING ERRCODE = '23514';
    END IF;
    IF v_name = '' THEN
      RAISE EXCEPTION 'Строка %: укажите название', v_idx USING ERRCODE = '23514';
    END IF;
    IF v_bin = ANY (v_seen) THEN
      RAISE EXCEPTION 'Строка %: дублирующий БИН %', v_idx, v_bin USING ERRCODE = '23505';
    END IF;
    v_seen := array_append(v_seen, v_bin);

    SELECT c.bin, c.name, c.manager_id, c.digger_id, c.business_scale
    INTO v_client
    FROM public.crm_clients c
    WHERE c.bin = v_bin;

    IF NOT FOUND THEN
      INSERT INTO public.crm_clients (bin, name, digger_id, business_scale)
      VALUES (v_bin, v_name, v_uid, 'enterprise')
      RETURNING bin, name, manager_id, digger_id, business_scale INTO v_client;
    ELSE
      IF public.is_lead_digger() AND NOT public.is_admin_write() THEN
        IF v_client.digger_id IS NOT NULL AND v_client.digger_id IS DISTINCT FROM v_uid THEN
          RAISE EXCEPTION 'Строка %: можно передавать только своих компаний', v_idx USING ERRCODE = '42501';
        END IF;
        IF v_client.digger_id IS NULL
          AND v_client.manager_id IS NOT NULL
          AND v_client.manager_id IS DISTINCT FROM v_uid
        THEN
          RAISE EXCEPTION 'Строка %: можно передавать только своих компаний', v_idx USING ERRCODE = '42501';
        END IF;
      END IF;

      UPDATE public.crm_clients
      SET
        name = v_name,
        digger_id = coalesce(digger_id, v_uid),
        business_scale = 'enterprise'
      WHERE bin = v_bin
      RETURNING bin, name, manager_id, digger_id, business_scale INTO v_client;
    END IF;

    SELECT l.id INTO v_existing
    FROM public.crm_enterprise_leads l
    WHERE l.bin = v_bin
      AND l.routing_status IN ('pending_distribution', 'assigned_to_manager')
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      v_lead_id := v_existing;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'bin', v_bin,
        'name', v_name,
        'lead_id', v_lead_id,
        'created', false,
        'meeting_scheduled', false,
        'skipped_existing', true
      ));
      CONTINUE;
    END IF;

    v_creator := coalesce(v_client.digger_id, v_uid);

    INSERT INTO public.crm_enterprise_leads (
      bin, creator_id, routing_status, transferred_at, transferred_on, meeting_requested
    )
    VALUES (
      v_bin,
      v_creator,
      'pending_distribution',
      now(),
      v_today,
      v_meeting
    )
    RETURNING id INTO v_lead_id;

    PERFORM public.log_crm_lead_event(
      v_lead_id,
      'transferred',
      jsonb_build_object('bin', v_bin, 'batch', true, 'meeting_requested', v_meeting)
    );

    v_meeting_id := NULL;
    IF v_meeting THEN
      v_report_id := public.ensure_crm_report_for_staff(v_uid, p_report_date);

      SELECT m.id INTO v_meeting_id
      FROM public.crm_assigned_meetings m
      WHERE m.report_id = v_report_id
        AND m.bin = v_bin
        AND m.meeting_date = p_report_date
        AND m.deleted_at IS NULL
      LIMIT 1;

      IF v_meeting_id IS NULL THEN
        INSERT INTO public.crm_assigned_meetings (
          report_id, entity_name, bin, meeting_date, meeting_type, sort_order
        )
        VALUES (
          v_report_id,
          v_name,
          v_bin,
          p_report_date,
          'Крупный лид',
          coalesce((SELECT max(m.sort_order) + 1 FROM public.crm_assigned_meetings m WHERE m.report_id = v_report_id), 0)
        )
        RETURNING id INTO v_meeting_id;
      END IF;
    END IF;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'bin', v_bin,
      'name', v_name,
      'lead_id', v_lead_id,
      'created', true,
      'meeting_scheduled', v_meeting,
      'meeting_id', v_meeting_id,
      'skipped_existing', false
    ));
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'items', v_results);
END;
$$;

-- Assign: create manager meeting only when meeting_requested
CREATE OR REPLACE FUNCTION public.admin_assign_enterprise_lead(p_lead_id uuid, p_manager_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead record;
  v_prev_manager uuid;
  v_report_id uuid;
  v_meeting_id uuid;
  v_client_name text;
  v_today date := (timezone('Asia/Almaty', now()))::date;
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

  v_prev_manager := v_lead.assigned_manager_id;
  SELECT c.name INTO v_client_name FROM public.crm_clients c WHERE c.bin = v_lead.bin;

  -- Drop stale auto-meeting if reassigning or meeting no longer requested
  IF v_lead.assigned_meeting_id IS NOT NULL THEN
    IF NOT coalesce(v_lead.meeting_requested, false)
      OR v_prev_manager IS DISTINCT FROM p_manager_id
    THEN
      UPDATE public.crm_enterprise_leads
      SET assigned_meeting_id = NULL
      WHERE id = p_lead_id;

      DELETE FROM public.crm_assigned_meetings WHERE id = v_lead.assigned_meeting_id;
      v_lead.assigned_meeting_id := NULL;
    END IF;
  END IF;

  v_meeting_id := NULL;
  IF coalesce(v_lead.meeting_requested, false) THEN
    v_report_id := public.ensure_crm_report_for_manager(p_manager_id, v_today);

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
      SET
        meeting_date = v_today,
        meeting_type = 'Крупный лид',
        entity_name = coalesce(v_client_name, v_lead.bin),
        report_id = v_report_id
      WHERE id = v_meeting_id;
    END IF;
  END IF;

  UPDATE public.crm_clients
  SET
    manager_id = p_manager_id,
    digger_id = coalesce(digger_id, v_lead.creator_id),
    business_scale = 'enterprise'
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
    jsonb_build_object(
      'manager_id', p_manager_id,
      'prev_manager_id', v_prev_manager,
      'auto_meeting', coalesce(v_lead.meeting_requested, false)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_enterprise_lead(p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead record;
  v_meeting_id uuid;
  v_extra uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_admin_write() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_lead
  FROM public.crm_enterprise_leads
  WHERE id = p_lead_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Лид не найден' USING ERRCODE = 'P0002';
  END IF;

  -- When deleting a return: wipe all returned rows for the same BIN
  IF v_lead.routing_status = 'returned_to_smb' THEN
    FOR v_extra IN
      SELECT l.id
      FROM public.crm_enterprise_leads l
      WHERE l.bin = v_lead.bin
        AND l.routing_status = 'returned_to_smb'
        AND l.id IS DISTINCT FROM p_lead_id
    LOOP
      PERFORM public.log_crm_lead_event(
        v_extra,
        'admin_deleted',
        jsonb_build_object('bin', v_lead.bin, 'cascade_same_bin', true)
      );
      DELETE FROM public.crm_enterprise_leads WHERE id = v_extra;
    END LOOP;
  END IF;

  v_meeting_id := v_lead.assigned_meeting_id;

  PERFORM public.log_crm_lead_event(
    p_lead_id,
    'admin_deleted',
    jsonb_build_object(
      'bin', v_lead.bin,
      'routing_status', v_lead.routing_status,
      'creator_id', v_lead.creator_id,
      'assigned_manager_id', v_lead.assigned_manager_id
    )
  );

  UPDATE public.crm_enterprise_leads
  SET assigned_meeting_id = NULL, updated_at = now()
  WHERE id = p_lead_id;

  IF v_meeting_id IS NOT NULL THEN
    DELETE FROM public.crm_assigned_meetings WHERE id = v_meeting_id;
  END IF;

  IF v_lead.creator_id IS NOT NULL THEN
    DELETE FROM public.crm_assigned_meetings m
    USING public.crm_reports r
    WHERE m.report_id = r.id
      AND r.manager_id = v_lead.creator_id
      AND m.bin = v_lead.bin
      AND m.deleted_at IS NULL;
  END IF;

  IF v_lead.assigned_manager_id IS NOT NULL THEN
    DELETE FROM public.crm_assigned_meetings m
    USING public.crm_reports r
    WHERE m.report_id = r.id
      AND r.manager_id = v_lead.assigned_manager_id
      AND m.bin = v_lead.bin
      AND m.deleted_at IS NULL
      AND m.meeting_type IN ('Крупный лид', 'Новая');
  END IF;

  DELETE FROM public.crm_enterprise_leads WHERE id = p_lead_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.crm_enterprise_leads l
    WHERE l.bin = v_lead.bin
      AND l.routing_status IN ('pending_distribution', 'assigned_to_manager')
  ) THEN
    UPDATE public.crm_clients
    SET business_scale = 'smb'
    WHERE bin = v_lead.bin
      AND business_scale = 'enterprise';
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.list_enterprise_leads(text);

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

-- Manager Telegram: exclude lead_digger reports
DROP FUNCTION IF EXISTS public.telegram_daily_analytics_rows(date);

CREATE OR REPLACE FUNCTION public.telegram_daily_analytics_rows(p_date date)
 RETURNS TABLE(
   manager text,
   assigned_meetings integer,
   conducted_fact integer,
   conducted_new integer,
   confirmed_orders_sum numeric,
   confirmed_orders_count integer,
   confirmed_orders_breakdown jsonb
 )
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH ranked AS (
    SELECT
      r.id,
      trim(coalesce(r.manager, '')) AS manager,
      row_number() OVER (
        PARTITION BY trim(coalesce(r.manager, '')), r.report_date
        ORDER BY (
          coalesce(r.processed_total, 0) +
          coalesce(r.new_in_work, 0) +
          coalesce(r.calls_total, 0) +
          coalesce(r.validated_total, 0)
        ) DESC,
        r.id DESC
      ) AS rn
    FROM public.crm_reports r
    LEFT JOIN public.profiles p ON p.id = r.manager_id
    WHERE r.report_date = p_date
      AND coalesce(p.role, 'manager') = 'manager'
      AND NOT EXISTS (
        SELECT 1
        FROM public.profiles pd
        WHERE pd.role = 'lead_digger'
          AND r.manager_id IS NULL
          AND lower(trim(coalesce(pd.full_name, ''))) = lower(trim(coalesce(r.manager, '')))
      )
  ),
  chosen AS (
    SELECT id, manager
    FROM ranked
    WHERE rn = 1
  ),
  assigned_rows AS (
    SELECT
      c.manager,
      c.id AS report_id,
      am.entity_name,
      am.bin,
      am.meeting_type,
      am.meeting_date
    FROM chosen c
    JOIN public.crm_assigned_meetings am ON am.report_id = c.id
  ),
  conducted_rows AS (
    SELECT
      c.manager,
      c.id AS report_id,
      cm.entity_name,
      cm.bin,
      cm.meeting_type,
      cm.meeting_date
    FROM chosen c
    JOIN public.crm_conducted_meetings cm ON cm.report_id = c.id
  ),
  plan_fact AS (
    SELECT
      c.manager,
      coalesce((SELECT count(*)::int FROM assigned_rows a WHERE a.manager = c.manager), 0)
        AS assigned_meetings,
      coalesce((SELECT count(*)::int FROM conducted_rows d WHERE d.manager = c.manager), 0)
        AS conducted_fact,
      coalesce((
        SELECT sum(coalesce(co.total_amount, 0))
        FROM public.crm_confirmed_orders co
        WHERE co.report_id = c.id
      ), 0)::numeric AS confirmed_orders_sum,
      coalesce((
        SELECT sum(coalesce(co.order_count, 0))::int
        FROM public.crm_confirmed_orders co
        WHERE co.report_id = c.id
      ), 0) AS confirmed_orders_count,
      coalesce(
        (
          SELECT jsonb_agg(t.json_obj ORDER BY t.total_sum DESC)
          FROM (
            SELECT
              jsonb_build_object(
                'name', trim(coalesce(s.entity_name, '')),
                'bin', trim(coalesce(s.bin, '')),
                'total', s.total_sum,
                'order_count', s.order_count_sum
              ) AS json_obj,
              s.total_sum
            FROM (
              SELECT
                trim(coalesce(co.entity_name, '')) AS entity_name,
                trim(coalesce(co.bin, '')) AS bin,
                sum(coalesce(co.total_amount, 0))::numeric AS total_sum,
                sum(coalesce(co.order_count, 0))::int AS order_count_sum
              FROM public.crm_confirmed_orders co
              WHERE co.report_id = c.id
              GROUP BY trim(coalesce(co.entity_name, '')), trim(coalesce(co.bin, ''))
            ) s
          ) t
        ),
        '[]'::jsonb
      ) AS confirmed_orders_breakdown,
      c.id AS report_id
    FROM chosen c
  ),
  conducted_new_calc AS (
    SELECT
      ar.manager,
      count(*)::int AS conducted_new
    FROM assigned_rows ar
    WHERE lower(trim(translate(trim(coalesce(ar.meeting_type, '')), 'ёЁ', 'еЕ'))) LIKE 'нов%'
      AND EXISTS (
        SELECT 1
        FROM public.crm_reports r2
        JOIN public.crm_conducted_meetings cm2 ON cm2.report_id = r2.id
        WHERE trim(coalesce(r2.manager, '')) = ar.manager
          AND r2.report_date >= p_date
          AND trim(coalesce(cm2.bin, '')) = trim(coalesce(ar.bin, ''))
          AND lower(trim(coalesce(cm2.entity_name, ''))) = lower(trim(coalesce(ar.entity_name, '')))
          AND lower(trim(coalesce(cm2.meeting_type, ''))) = lower(trim(coalesce(ar.meeting_type, '')))
          AND cm2.meeting_date >= ar.meeting_date
      )
    GROUP BY ar.manager
  )
  SELECT
    pf.manager AS manager,
    pf.assigned_meetings AS assigned_meetings,
    pf.conducted_fact AS conducted_fact,
    coalesce(cn.conducted_new, 0)::integer AS conducted_new,
    pf.confirmed_orders_sum AS confirmed_orders_sum,
    pf.confirmed_orders_count AS confirmed_orders_count,
    pf.confirmed_orders_breakdown AS confirmed_orders_breakdown
  FROM plan_fact pf
  LEFT JOIN conducted_new_calc cn ON cn.manager = pf.manager
  ORDER BY pf.manager;
$function$;

REVOKE EXECUTE ON FUNCTION public.telegram_daily_analytics_rows(date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.telegram_daily_analytics_rows(date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.telegram_daily_analytics_rows(date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_daily_analytics_rows(date) TO service_role;

-- Separate digger daily digest
CREATE OR REPLACE FUNCTION public.telegram_daily_digger_rows(p_date date)
 RETURNS TABLE(
   digger text,
   processed_total integer,
   new_in_work integer,
   calls_total integer,
   validated_total integer,
   transferred_count integer
 )
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH digger_profiles AS (
    SELECT p.id, trim(coalesce(p.full_name, '')) AS full_name
    FROM public.profiles p
    WHERE p.role = 'lead_digger'
  ),
  ranked AS (
    SELECT
      r.id,
      r.manager_id,
      trim(coalesce(r.manager, '')) AS digger,
      coalesce(r.processed_total, 0) AS processed_total,
      coalesce(r.new_in_work, 0) AS new_in_work,
      coalesce(r.calls_total, 0) AS calls_total,
      coalesce(r.validated_total, 0) AS validated_total,
      row_number() OVER (
        PARTITION BY coalesce(r.manager_id::text, trim(coalesce(r.manager, ''))), r.report_date
        ORDER BY (
          coalesce(r.processed_total, 0) +
          coalesce(r.new_in_work, 0) +
          coalesce(r.calls_total, 0) +
          coalesce(r.validated_total, 0)
        ) DESC,
        r.id DESC
      ) AS rn
    FROM public.crm_reports r
    JOIN digger_profiles dp ON (
      dp.id = r.manager_id
      OR (r.manager_id IS NULL AND lower(dp.full_name) = lower(trim(coalesce(r.manager, ''))))
    )
    WHERE r.report_date = p_date
  ),
  chosen AS (
    SELECT * FROM ranked WHERE rn = 1
  ),
  transfers AS (
    SELECT
      l.creator_id,
      count(*)::int AS transferred_count
    FROM public.crm_enterprise_leads l
    WHERE coalesce(l.transferred_on, (timezone('Asia/Almaty', l.transferred_at))::date) = p_date
    GROUP BY l.creator_id
  ),
  from_reports AS (
    SELECT
      c.digger,
      c.manager_id,
      c.processed_total::integer AS processed_total,
      c.new_in_work::integer AS new_in_work,
      c.calls_total::integer AS calls_total,
      c.validated_total::integer AS validated_total,
      coalesce(t.transferred_count, 0)::integer AS transferred_count
    FROM chosen c
    LEFT JOIN transfers t ON t.creator_id = c.manager_id
  ),
  transfer_only AS (
    SELECT
      coalesce(nullif(dp.full_name, ''), '—') AS digger,
      0 AS processed_total,
      0 AS new_in_work,
      0 AS calls_total,
      0 AS validated_total,
      t.transferred_count
    FROM transfers t
    JOIN digger_profiles dp ON dp.id = t.creator_id
    WHERE NOT EXISTS (
      SELECT 1 FROM from_reports fr WHERE fr.manager_id = t.creator_id
    )
  )
  SELECT digger, processed_total, new_in_work, calls_total, validated_total, transferred_count
  FROM (
    SELECT digger, processed_total, new_in_work, calls_total, validated_total, transferred_count FROM from_reports
    UNION ALL
    SELECT digger, processed_total, new_in_work, calls_total, validated_total, transferred_count FROM transfer_only
  ) u
  ORDER BY digger;
$function$;

REVOKE EXECUTE ON FUNCTION public.telegram_daily_digger_rows(date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.telegram_daily_digger_rows(date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.telegram_daily_digger_rows(date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_daily_digger_rows(date) TO service_role;
