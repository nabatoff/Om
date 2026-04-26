-- Менеджер: только свои отчёты (по profiles.full_name = crm_reports.manager). Админ: все.

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
        AND TRIM(COALESCE(r.manager, '')) = TRIM(COALESCE(p.full_name, ''))
    );
$$;

CREATE OR REPLACE FUNCTION public.user_may_write_crm_report_row(m text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    is_admin()
    OR (
      (SELECT p.is_active IS NOT FALSE FROM public.profiles p WHERE p.id = auth.uid())
      AND TRIM(COALESCE(m, '')) = TRIM(COALESCE((SELECT p.full_name FROM public.profiles p WHERE p.id = auth.uid()), ''))
    );
$$;

DROP POLICY IF EXISTS crm_reports_auth ON public.crm_reports;
CREATE POLICY crm_reports_select ON public.crm_reports FOR SELECT TO authenticated
  USING (public.user_may_access_crm_report(id));
CREATE POLICY crm_reports_insert ON public.crm_reports FOR INSERT TO authenticated
  WITH CHECK (public.user_may_write_crm_report_row(manager));
CREATE POLICY crm_reports_update ON public.crm_reports FOR UPDATE TO authenticated
  USING (public.user_may_access_crm_report(id))
  WITH CHECK (public.user_may_write_crm_report_row(manager));
CREATE POLICY crm_reports_delete ON public.crm_reports FOR DELETE TO authenticated
  USING (public.user_may_access_crm_report(id));

DROP POLICY IF EXISTS crm_assigned_meetings_auth ON public.crm_assigned_meetings;
CREATE POLICY crm_assigned_meetings_all ON public.crm_assigned_meetings FOR ALL TO authenticated
  USING (public.user_may_access_crm_report(report_id))
  WITH CHECK (public.user_may_access_crm_report(report_id));

DROP POLICY IF EXISTS crm_conducted_meetings_auth ON public.crm_conducted_meetings;
CREATE POLICY crm_conducted_meetings_all ON public.crm_conducted_meetings FOR ALL TO authenticated
  USING (public.user_may_access_crm_report(report_id))
  WITH CHECK (public.user_may_access_crm_report(report_id));

DROP POLICY IF EXISTS crm_confirmed_orders_auth ON public.crm_confirmed_orders;
CREATE POLICY crm_confirmed_orders_all ON public.crm_confirmed_orders FOR ALL TO authenticated
  USING (public.user_may_access_crm_report(report_id))
  WITH CHECK (public.user_may_access_crm_report(report_id));
