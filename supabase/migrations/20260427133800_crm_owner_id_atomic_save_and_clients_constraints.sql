-- Переход CRM ownership с manager(full_name) -> manager_id(uuid),
-- атомарное сохранение отчёта через RPC и ограничения для crm_clients.bin.

ALTER TABLE public.crm_reports
  ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES public.profiles(id);

-- Бэкфилл manager_id из legacy-поля manager (по совпадению full_name).
WITH matched AS (
  SELECT
    r.id AS report_id,
    p.id AS profile_id,
    row_number() OVER (
      PARTITION BY r.id
      ORDER BY p.created_at NULLS LAST, p.id
    ) AS rn
  FROM public.crm_reports r
  JOIN public.profiles p
    ON trim(coalesce(r.manager, '')) = trim(coalesce(p.full_name, ''))
  WHERE r.manager_id IS NULL
)
UPDATE public.crm_reports r
SET manager_id = m.profile_id
FROM matched m
WHERE r.id = m.report_id
  AND m.rn = 1;

CREATE INDEX IF NOT EXISTS crm_reports_manager_id_idx
  ON public.crm_reports (manager_id);

CREATE OR REPLACE FUNCTION public.user_may_access_crm_report(rid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.crm_reports r
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE r.id = rid
        AND p.is_active IS NOT FALSE
        AND (
          r.manager_id = p.id
          OR (
            r.manager_id IS NULL
            AND trim(coalesce(r.manager, '')) = trim(coalesce(p.full_name, ''))
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.user_may_write_crm_report_row(mid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_active IS NOT FALSE
        AND mid = p.id
    );
$$;

DROP POLICY IF EXISTS crm_reports_select ON public.crm_reports;
DROP POLICY IF EXISTS crm_reports_insert ON public.crm_reports;
DROP POLICY IF EXISTS crm_reports_update ON public.crm_reports;
DROP POLICY IF EXISTS crm_reports_delete ON public.crm_reports;

CREATE POLICY crm_reports_select ON public.crm_reports FOR SELECT TO authenticated
  USING (public.user_may_access_crm_report(id));
CREATE POLICY crm_reports_insert ON public.crm_reports FOR INSERT TO authenticated
  WITH CHECK (public.user_may_write_crm_report_row(manager_id));
CREATE POLICY crm_reports_update ON public.crm_reports FOR UPDATE TO authenticated
  USING (public.user_may_access_crm_report(id))
  WITH CHECK (public.user_may_write_crm_report_row(manager_id));
CREATE POLICY crm_reports_delete ON public.crm_reports FOR DELETE TO authenticated
  USING (public.user_may_access_crm_report(id));

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
    (payload->>'reportDate')::date,
    v_manager_name,
    v_uid,
    coalesce((v_stats->>'processedTotal')::int, 0),
    coalesce((v_stats->>'newInWork')::int, 0),
    coalesce((v_stats->>'callsTotal')::int, 0),
    coalesce((v_stats->>'validatedTotal')::int, 0)
  )
  RETURNING id INTO v_report_id;

  INSERT INTO public.crm_assigned_meetings (
    report_id,
    entity_name,
    bin,
    meeting_date,
    meeting_type,
    sort_order
  )
  SELECT
    v_report_id,
    trim(coalesce(raw."entityName", '')) AS entity_name,
    trim(coalesce(raw.bin, '')) AS bin,
    raw.date AS meeting_date,
    trim(coalesce(raw.type, '')) AS meeting_type,
    row_number() OVER () - 1 AS sort_order
  FROM jsonb_to_recordset(v_assigned) AS raw(
    "entityName" text,
    bin text,
    date date,
    type text
  )
  WHERE trim(coalesce(raw."entityName", '')) <> ''
    AND trim(coalesce(raw.bin, '')) <> '';

  INSERT INTO public.crm_conducted_meetings (
    report_id,
    entity_name,
    bin,
    meeting_date,
    meeting_type,
    result,
    sort_order
  )
  SELECT
    v_report_id,
    trim(coalesce(raw."entityName", '')) AS entity_name,
    trim(coalesce(raw.bin, '')) AS bin,
    raw.date AS meeting_date,
    trim(coalesce(raw.type, '')) AS meeting_type,
    coalesce(raw.result, '') AS result,
    row_number() OVER () - 1 AS sort_order
  FROM jsonb_to_recordset(v_conducted) AS raw(
    "entityName" text,
    bin text,
    date date,
    type text,
    result text
  )
  WHERE trim(coalesce(raw."entityName", '')) <> ''
    AND trim(coalesce(raw.bin, '')) <> '';

  INSERT INTO public.crm_confirmed_orders (
    report_id,
    entity_name,
    bin,
    order_count,
    amounts,
    total_amount,
    sort_order
  )
  SELECT
    v_report_id,
    trim(coalesce(raw."entityName", '')) AS entity_name,
    trim(coalesce(raw.bin, '')) AS bin,
    coalesce(raw."orderCount", 0) AS order_count,
    coalesce(raw.amounts, ARRAY[]::numeric[]) AS amounts,
    coalesce(raw."totalAmount", 0) AS total_amount,
    row_number() OVER () - 1 AS sort_order
  FROM jsonb_to_recordset(v_orders) AS raw(
    "entityName" text,
    bin text,
    "orderCount" int,
    amounts numeric[],
    "totalAmount" numeric
  )
  WHERE trim(coalesce(raw."entityName", '')) <> ''
    AND trim(coalesce(raw.bin, '')) <> '';

  RETURN v_report_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_crm_report(jsonb) TO authenticated;

-- Нормализация и ограничения по БИН.
UPDATE public.crm_clients
SET bin = regexp_replace(trim(coalesce(bin, '')), '[^0-9]', '', 'g')
WHERE bin IS NOT NULL;

ALTER TABLE public.crm_clients
  ADD CONSTRAINT crm_clients_bin_format_chk CHECK (bin ~ '^[0-9]{12}$');

ALTER TABLE public.crm_clients
  ADD CONSTRAINT crm_clients_bin_unique UNIQUE (bin);
