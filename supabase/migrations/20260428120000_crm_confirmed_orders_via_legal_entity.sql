-- Юр. лицо, через которое оформлен заказ (отдельно от контрагента заказа).

ALTER TABLE public.crm_confirmed_orders
  ADD COLUMN IF NOT EXISTS via_entity_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS via_bin text NOT NULL DEFAULT '';

CREATE OR REPLACE FUNCTION public.update_crm_client(
  p_old_bin text,
  p_name text,
  p_new_bin text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old text := regexp_replace(trim(coalesce(p_old_bin, '')), '[^0-9]', '', 'g');
  v_new text := regexp_replace(trim(coalesce(p_new_bin, '')), '[^0-9]', '', 'g');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF length(v_old) <> 12 OR length(v_new) <> 12 THEN
    RAISE EXCEPTION 'БИН должен состоять ровно из 12 цифр' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.crm_clients WHERE bin = v_old) THEN
    RAISE EXCEPTION 'Контрагент не найден';
  END IF;
  IF v_old IS DISTINCT FROM v_new AND EXISTS (SELECT 1 FROM public.crm_clients WHERE bin = v_new) THEN
    RAISE EXCEPTION 'Контрагент с таким БИН уже существует' USING ERRCODE = '23505';
  END IF;

  IF v_old IS DISTINCT FROM v_new THEN
    UPDATE public.crm_assigned_meetings SET bin = v_new WHERE bin = v_old;
    UPDATE public.crm_conducted_meetings SET bin = v_new WHERE bin = v_old;
    UPDATE public.crm_confirmed_orders SET bin = v_new WHERE bin = v_old;
    UPDATE public.crm_confirmed_orders SET via_bin = v_new WHERE via_bin = v_old;
  END IF;

  UPDATE public.crm_clients
  SET name = nullif(trim(p_name), ''),
      bin = v_new
  WHERE bin = v_old;
END;
$$;

REVOKE ALL ON FUNCTION public.update_crm_client(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_crm_client(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_crm_report(payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_active boolean := false;
  v_manager_name text := '';
  v_report_id uuid;
  v_input_report_id uuid := nullif(payload->>'reportId', '')::uuid;
  v_report_date date := (payload->>'reportDate')::date;
  v_stats jsonb := coalesce(payload->'stats', '{}'::jsonb);
  v_assigned jsonb := coalesce(payload->'assignedMeetings', '[]'::jsonb);
  v_conducted jsonb := coalesce(payload->'conductedMeetings', '[]'::jsonb);
  v_orders jsonb := coalesce(payload->'confirmedOrders', '[]'::jsonb);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
  END IF;

  SELECT (p.is_active IS NOT FALSE), trim(coalesce(p.full_name, ''))
  INTO v_is_active, v_manager_name
  FROM public.profiles p
  WHERE p.id = v_uid;

  IF NOT coalesce(v_is_active, false) THEN
    RAISE EXCEPTION 'User is inactive' USING ERRCODE = '42501';
  END IF;

  IF coalesce(v_manager_name, '') = '' THEN
    RAISE EXCEPTION 'Заполните ФИО в profiles.full_name' USING ERRCODE = '23514';
  END IF;

  IF v_input_report_id IS NOT NULL THEN
    SELECT r.id
      INTO v_report_id
    FROM public.crm_reports r
    WHERE r.id = v_input_report_id
      AND (is_admin() OR r.manager_id = v_uid)
    LIMIT 1;
  END IF;

  IF v_report_id IS NULL THEN
    SELECT r.id
      INTO v_report_id
    FROM public.crm_reports r
    WHERE r.report_date = v_report_date
      AND (
        r.manager_id = v_uid
        OR (r.manager_id IS NULL AND trim(coalesce(r.manager, '')) = v_manager_name)
      )
    ORDER BY (r.manager_id IS NULL), (r.processed_total + r.new_in_work + r.calls_total + r.validated_total) DESC, r.id DESC
    LIMIT 1;
  END IF;

  IF v_report_id IS NULL THEN
    INSERT INTO public.crm_reports (
      report_date,
      manager,
      manager_id,
      processed_total,
      new_in_work,
      calls_total,
      validated_total
    )
    VALUES (
      v_report_date,
      v_manager_name,
      v_uid,
      coalesce((v_stats->>'processedTotal')::int, 0),
      coalesce((v_stats->>'newInWork')::int, 0),
      coalesce((v_stats->>'callsTotal')::int, 0),
      coalesce((v_stats->>'validatedTotal')::int, 0)
    )
    RETURNING id INTO v_report_id;
  ELSE
    UPDATE public.crm_reports
    SET
      report_date = v_report_date,
      manager = v_manager_name,
      manager_id = v_uid,
      processed_total = coalesce((v_stats->>'processedTotal')::int, 0),
      new_in_work = coalesce((v_stats->>'newInWork')::int, 0),
      calls_total = coalesce((v_stats->>'callsTotal')::int, 0),
      validated_total = coalesce((v_stats->>'validatedTotal')::int, 0)
    WHERE id = v_report_id;

    DELETE FROM public.crm_assigned_meetings WHERE report_id = v_report_id;
    DELETE FROM public.crm_conducted_meetings WHERE report_id = v_report_id;
    DELETE FROM public.crm_confirmed_orders WHERE report_id = v_report_id;
  END IF;

  INSERT INTO public.crm_assigned_meetings (report_id, entity_name, bin, meeting_date, meeting_type, sort_order)
  SELECT
    v_report_id,
    trim(coalesce(raw."entityName", '')),
    trim(coalesce(raw.bin, '')),
    raw.date,
    trim(coalesce(raw.type, '')),
    row_number() OVER () - 1
  FROM jsonb_to_recordset(v_assigned) AS raw("entityName" text, bin text, date date, type text)
  WHERE trim(coalesce(raw."entityName", '')) <> ''
    AND trim(coalesce(raw.bin, '')) <> '';

  INSERT INTO public.crm_conducted_meetings (report_id, entity_name, bin, meeting_date, meeting_type, result, sort_order)
  SELECT
    v_report_id,
    trim(coalesce(raw."entityName", '')),
    trim(coalesce(raw.bin, '')),
    raw.date,
    trim(coalesce(raw.type, '')),
    coalesce(raw.result, ''),
    row_number() OVER () - 1
  FROM jsonb_to_recordset(v_conducted) AS raw("entityName" text, bin text, date date, type text, result text)
  WHERE trim(coalesce(raw."entityName", '')) <> ''
    AND trim(coalesce(raw.bin, '')) <> '';

  INSERT INTO public.crm_confirmed_orders (
    report_id,
    entity_name,
    bin,
    order_count,
    amounts,
    total_amount,
    sort_order,
    via_entity_name,
    via_bin
  )
  SELECT
    v_report_id,
    trim(coalesce(raw."entityName", '')),
    trim(coalesce(raw.bin, '')),
    coalesce(raw."orderCount", 0),
    coalesce(raw.amounts, ARRAY[]::numeric[]),
    coalesce(raw."totalAmount", 0),
    row_number() OVER () - 1,
    trim(coalesce(raw."viaEntityName", '')),
    trim(coalesce(raw."viaBin", ''))
  FROM jsonb_to_recordset(v_orders) AS raw(
    "entityName" text,
    bin text,
    "orderCount" int,
    amounts numeric[],
    "totalAmount" numeric,
    "viaEntityName" text,
    "viaBin" text
  )
  WHERE trim(coalesce(raw."entityName", '')) <> ''
    AND trim(coalesce(raw.bin, '')) <> '';

  RETURN v_report_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_crm_report(jsonb) TO authenticated;
