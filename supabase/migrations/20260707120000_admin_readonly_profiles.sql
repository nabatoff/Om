-- Read-only администратор: profiles.admin_write = false (логин admin).
-- Полный доступ: admin_write = true (по умолчанию, напр. admin6477).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS admin_write boolean NOT NULL DEFAULT true;

UPDATE public.profiles
SET admin_write = false
WHERE role = 'admin'
  AND lower(trim(coalesce(login_code, ''))) = 'admin';

CREATE OR REPLACE FUNCTION public.is_admin_write()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
      AND COALESCE(p.is_active, true)
      AND COALESCE(p.admin_write, true)
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin_write() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_write() TO authenticated;

CREATE OR REPLACE FUNCTION public.user_may_write_crm_report_row(m text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin_write()
    OR (
      (SELECT p.is_active IS NOT FALSE FROM public.profiles p WHERE p.id = auth.uid())
      AND TRIM(COALESCE(m, '')) = TRIM(COALESCE((SELECT p.full_name FROM public.profiles p WHERE p.id = auth.uid()), ''))
    );
$$;

DROP POLICY IF EXISTS crm_reports_delete ON public.crm_reports;
CREATE POLICY crm_reports_delete ON public.crm_reports FOR DELETE TO authenticated
  USING (
    public.is_admin_write()
    OR (
      NOT public.is_admin()
      AND public.user_may_access_crm_report(id)
      AND public.user_may_write_crm_report_row(manager)
    )
  );

DROP POLICY IF EXISTS crm_ens_tru_codes_admin_write ON public.crm_ens_tru_codes;
CREATE POLICY crm_ens_tru_codes_admin_write ON public.crm_ens_tru_codes
  FOR ALL TO authenticated
  USING (public.is_admin_write())
  WITH CHECK (public.is_admin_write());

DROP POLICY IF EXISTS crm_client_categories_admin_update ON public.crm_client_categories;
CREATE POLICY crm_client_categories_admin_update ON public.crm_client_categories
  FOR UPDATE TO authenticated
  USING (public.is_admin_write())
  WITH CHECK (public.is_admin_write());

DROP POLICY IF EXISTS crm_client_categories_admin_delete ON public.crm_client_categories;
CREATE POLICY crm_client_categories_admin_delete ON public.crm_client_categories
  FOR DELETE TO authenticated
  USING (public.is_admin_write());

CREATE OR REPLACE FUNCTION public.guard_crm_client_profile_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin_write() THEN
    RETURN NEW;
  END IF;

  IF NEW.category_id IS DISTINCT FROM OLD.category_id
     OR NEW.gz_turnover_prev_year IS DISTINCT FROM OLD.gz_turnover_prev_year
     OR NEW.attraction_month IS DISTINCT FROM OLD.attraction_month THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- Патч write-RPC: is_admin() -> is_admin_write() там, где проверка на запись.
DO $patch$
DECLARE
  r record;
  def text;
  new_def text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_functiondef(p.oid) AS src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'update_crm_client',
        'set_crm_client_manager',
        'set_crm_client_cp_paid',
        'set_crm_client_ktp',
        'set_crm_mrp',
        'set_crm_admin_analytics_tab_enabled',
        'set_crm_telegram_weekly_forecast',
        'admin_update_confirmed_order',
        'set_crm_client_profile',
        'delete_crm_client_category',
        'recalc_order_commissions_for_client_bin',
        'set_conducted_meeting_cp_paid',
        'set_client_standalone_cp_paid',
        'backfill_order_commissions'
      )
  LOOP
    def := r.src;
    IF def IS NULL THEN
      CONTINUE;
    END IF;
    new_def := replace(def, 'IF NOT public.is_admin()', 'IF NOT public.is_admin_write()');
    new_def := replace(new_def, 'IF public.is_admin() AND p_manager_id', 'IF public.is_admin_write() AND p_manager_id');
    IF new_def IS DISTINCT FROM def THEN
      EXECUTE new_def;
    END IF;
  END LOOP;
END;
$patch$;

-- save_crm_report / save_crm_kpi_only: read-only админ не может сохранять отчёты.
DO $patch_save$
DECLARE
  r record;
  def text;
  needle text := 'IF v_uid IS NULL THEN';
  inject text := E'IF public.is_admin() AND NOT public.is_admin_write() THEN\n    RAISE EXCEPTION ''Forbidden'' USING ERRCODE = ''42501'';\n  END IF;\n\n  ';
  new_def text;
BEGIN
  FOR r IN
    SELECT p.oid, pg_get_functiondef(p.oid) AS src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('save_crm_report', 'save_crm_kpi_only')
  LOOP
    def := r.src;
    IF def IS NULL OR def LIKE '%NOT public.is_admin_write()%' THEN
      CONTINUE;
    END IF;
    new_def := replace(def, needle, inject || needle);
    IF new_def IS DISTINCT FROM def THEN
      EXECUTE new_def;
    END IF;
  END LOOP;
END;
$patch_save$;
