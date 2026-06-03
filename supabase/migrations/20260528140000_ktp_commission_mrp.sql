-- КТП на клиенте, настройка MRP, снимок комиссии на заказе.

ALTER TABLE public.crm_clients
  ADD COLUMN IF NOT EXISTS is_ktp boolean NOT NULL DEFAULT false;

ALTER TABLE public.crm_confirmed_orders
  ADD COLUMN IF NOT EXISTS mrp_kzt_applied numeric,
  ADD COLUMN IF NOT EXISTS is_ktp_applied boolean,
  ADD COLUMN IF NOT EXISTS commission_amount numeric;

CREATE TABLE IF NOT EXISTS public.crm_settings (
  key text PRIMARY KEY,
  value_numeric numeric NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.crm_settings (key, value_numeric)
VALUES ('mrp_kzt', 4325)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.crm_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_settings_select ON public.crm_settings;
CREATE POLICY crm_settings_select ON public.crm_settings
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS crm_settings_admin_write ON public.crm_settings;
CREATE POLICY crm_settings_admin_write ON public.crm_settings
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT ON TABLE public.crm_settings TO authenticated;

-- Расчёт комиссии (логика дублирует src/lib/commission.ts).
CREATE OR REPLACE FUNCTION public.calc_order_commission(
  p_amount numeric,
  p_is_ktp boolean,
  p_mrp numeric
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_mrp numeric := greatest(coalesce(p_mrp, 0), 1);
  v_amount numeric := greatest(coalesce(p_amount, 0), 0);
  v_tier1_non_ktp numeric;
  v_tier1_ktp numeric;
  v_fixed numeric;
BEGIN
  v_tier1_non_ktp := 800 * v_mrp;
  v_tier1_ktp := v_tier1_non_ktp * 5 / 3;
  v_fixed := 40 * v_mrp;

  IF coalesce(p_is_ktp, false) THEN
    IF v_amount <= v_tier1_ktp THEN
      RETURN round(v_amount * 0.03);
    END IF;
    RETURN v_fixed;
  END IF;

  IF v_amount <= v_tier1_non_ktp THEN
    RETURN round(v_amount * 0.05);
  END IF;
  RETURN v_fixed;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_crm_mrp()
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT s.value_numeric FROM public.crm_settings s WHERE s.key = 'mrp_kzt' LIMIT 1),
    4325
  );
$$;

CREATE OR REPLACE FUNCTION public.set_crm_mrp(p_mrp numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF coalesce(p_mrp, 0) < 1 THEN
    RAISE EXCEPTION 'MRP должен быть не меньше 1' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.crm_settings (key, value_numeric, updated_at)
  VALUES ('mrp_kzt', p_mrp, now())
  ON CONFLICT (key) DO UPDATE
  SET value_numeric = EXCLUDED.value_numeric, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.set_crm_client_ktp(p_bin text, p_ktp boolean)
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
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF length(v_bin) <> 12 THEN
    RAISE EXCEPTION 'БИН должен состоять ровно из 12 цифр' USING ERRCODE = '23514';
  END IF;

  UPDATE public.crm_clients
  SET is_ktp = coalesce(p_ktp, false)
  WHERE bin = v_bin;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Контрагент не найден';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.count_orders_without_commission()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM public.crm_confirmed_orders o
  WHERE o.commission_amount IS NULL
    AND coalesce(o.total_amount, 0) > 0;
$$;

CREATE OR REPLACE FUNCTION public.backfill_order_commissions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mrp numeric;
  v_updated integer := 0;
  r record;
  v_comm numeric;
  v_ktp boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  v_mrp := public.get_crm_mrp();

  FOR r IN
    SELECT o.id, o.bin, o.total_amount
    FROM public.crm_confirmed_orders o
    WHERE o.commission_amount IS NULL
      AND coalesce(o.total_amount, 0) > 0
  LOOP
    SELECT coalesce(c.is_ktp, false)
      INTO v_ktp
    FROM public.crm_clients c
    WHERE c.bin = r.bin;

    v_ktp := coalesce(v_ktp, false);
    v_comm := public.calc_order_commission(r.total_amount, v_ktp, v_mrp);

    UPDATE public.crm_confirmed_orders
    SET
      mrp_kzt_applied = v_mrp,
      is_ktp_applied = v_ktp,
      commission_amount = v_comm
    WHERE id = r.id;

    v_updated := v_updated + 1;
  END LOOP;

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.get_crm_mrp() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_crm_mrp() TO authenticated;
REVOKE ALL ON FUNCTION public.set_crm_mrp(numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_crm_mrp(numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.set_crm_client_ktp(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_crm_client_ktp(text, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.count_orders_without_commission() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_orders_without_commission() TO authenticated;
REVOKE ALL ON FUNCTION public.backfill_order_commissions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.backfill_order_commissions() TO authenticated;

-- save_crm_report: валидация max суммы + снимок комиссии при insert заказов.
CREATE OR REPLACE FUNCTION public.save_crm_report(payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_active boolean := false;
  v_is_admin boolean := false;
  v_manager_name text := '';
  v_report_id uuid;
  v_input_report_id uuid := nullif(payload->>'reportId', '')::uuid;
  v_report_date date := (payload->>'reportDate')::date;
  v_stats jsonb := coalesce(payload->'stats', '{}'::jsonb);
  v_assigned jsonb := coalesce(payload->'assignedMeetings', '[]'::jsonb);
  v_conducted jsonb := coalesce(payload->'conductedMeetings', '[]'::jsonb);
  v_orders jsonb := coalesce(payload->'confirmedOrders', '[]'::jsonb);
  v_mrp numeric;
  v_max_order numeric;
  o record;
  v_ktp boolean;
  v_comm numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
  END IF;

  SELECT
    (p.is_active IS NOT FALSE),
    trim(coalesce(p.full_name, '')),
    public.is_admin()
  INTO v_is_active, v_manager_name, v_is_admin
  FROM public.profiles p
  WHERE p.id = v_uid;

  IF NOT coalesce(v_is_active, false) THEN
    RAISE EXCEPTION 'User is inactive' USING ERRCODE = '42501';
  END IF;

  IF coalesce(v_manager_name, '') = '' THEN
    RAISE EXCEPTION 'Заполните ФИО в profiles.full_name' USING ERRCODE = '23514';
  END IF;

  v_mrp := public.get_crm_mrp();
  v_max_order := 4000 * v_mrp;

  FOR o IN
    SELECT
      trim(coalesce(raw.bin, '')) AS bin,
      coalesce(raw."totalAmount", 0)::numeric AS total_amount
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
      AND trim(coalesce(raw.bin, '')) <> ''
  LOOP
    IF o.total_amount > v_max_order THEN
      RAISE EXCEPTION 'Сумма заказа не может превышать % ₸ (4000 МРП)', v_max_order
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  IF v_input_report_id IS NOT NULL THEN
    SELECT r.id
      INTO v_report_id
    FROM public.crm_reports r
    WHERE r.id = v_input_report_id
      AND (public.is_admin() OR r.manager_id = v_uid)
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

  CREATE TEMP TABLE tmp_old_conducted_cp_paid (
    id uuid PRIMARY KEY,
    cp_paid boolean NOT NULL DEFAULT false
  ) ON COMMIT DROP;

  IF v_report_id IS NOT NULL THEN
    INSERT INTO tmp_old_conducted_cp_paid (id, cp_paid)
    SELECT cm.id, coalesce(cm.cp_paid, false)
    FROM public.crm_conducted_meetings cm
    WHERE cm.report_id = v_report_id;
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

  INSERT INTO public.crm_conducted_meetings (
    id,
    report_id,
    entity_name,
    bin,
    meeting_date,
    meeting_type,
    result,
    sort_order,
    cp_sent,
    cp_quantity,
    cp_paid
  )
  SELECT
    coalesce(raw.id, gen_random_uuid()),
    v_report_id,
    trim(coalesce(raw."entityName", '')),
    trim(coalesce(raw.bin, '')),
    raw.date,
    trim(coalesce(raw.type, '')),
    coalesce(raw.result, ''),
    row_number() OVER () - 1,
    coalesce(raw."cpSent", false),
    CASE
      WHEN coalesce(raw."cpSent", false) THEN greatest(coalesce(raw."cpQuantity", 0), 0)
      ELSE 0
    END,
    CASE
      WHEN NOT coalesce(raw."cpSent", false) THEN false
      WHEN v_is_admin THEN coalesce(raw."cpPaid", false)
      ELSE coalesce((SELECT t.cp_paid FROM tmp_old_conducted_cp_paid t WHERE t.id = raw.id), false)
    END
  FROM jsonb_to_recordset(v_conducted) AS raw(
    id uuid,
    "entityName" text,
    bin text,
    date date,
    type text,
    result text,
    "cpSent" boolean,
    "cpQuantity" int,
    "cpPaid" boolean
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
    sort_order,
    via_entity_name,
    via_bin,
    mrp_kzt_applied,
    is_ktp_applied,
    commission_amount
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
    trim(coalesce(raw."viaBin", '')),
    v_mrp,
    coalesce(c.is_ktp, false),
    public.calc_order_commission(
      coalesce(raw."totalAmount", 0)::numeric,
      coalesce(c.is_ktp, false),
      v_mrp
    )
  FROM jsonb_to_recordset(v_orders) AS raw(
    "entityName" text,
    bin text,
    "orderCount" int,
    amounts numeric[],
    "totalAmount" numeric,
    "viaEntityName" text,
    "viaBin" text
  )
  LEFT JOIN public.crm_clients c ON c.bin = trim(coalesce(raw.bin, ''))
  WHERE trim(coalesce(raw."entityName", '')) <> ''
    AND trim(coalesce(raw.bin, '')) <> '';

  RETURN v_report_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_crm_report(jsonb) TO authenticated;
