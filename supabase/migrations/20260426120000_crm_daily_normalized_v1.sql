-- CRM daily normalized: применено к проекту; полный DDL для копий окружения.

DROP TABLE IF EXISTS public.client_gep_events CASCADE;
DROP TABLE IF EXISTS public.manager_daily_kpi CASCADE;

DO $$ BEGIN
  CREATE TYPE public.crm_meeting_kind AS ENUM ('new', 'repeat');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE public.crm_daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  report_date date NOT NULL,
  processed_total integer NOT NULL DEFAULT 0 CHECK (processed_total >= 0),
  new_in_work integer NOT NULL DEFAULT 0 CHECK (new_in_work >= 0),
  calls_total integer NOT NULL DEFAULT 0 CHECK (calls_total >= 0),
  validated_total integer NOT NULL DEFAULT 0 CHECK (validated_total >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_daily_reports_one_per_day UNIQUE (manager_id, report_date)
);

CREATE TABLE public.crm_planned_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.crm_daily_reports(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  meeting_date date NOT NULL,
  meeting_kind public.crm_meeting_kind NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE public.crm_conducted_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.crm_daily_reports(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  meeting_date date NOT NULL,
  meeting_kind public.crm_meeting_kind NOT NULL,
  result text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE public.crm_order_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.crm_daily_reports(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE public.crm_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_group_id uuid NOT NULL REFERENCES public.crm_order_groups(id) ON DELETE CASCADE,
  line_index integer NOT NULL CHECK (line_index >= 0),
  amount numeric NOT NULL DEFAULT 0 CHECK (amount >= 0),
  UNIQUE (order_group_id, line_index)
);

CREATE INDEX crm_planned_meetings_report_id_idx ON public.crm_planned_meetings (report_id);
CREATE INDEX crm_conducted_meetings_report_id_idx ON public.crm_conducted_meetings (report_id);
CREATE INDEX crm_order_groups_report_id_idx ON public.crm_order_groups (report_id);
CREATE INDEX crm_order_lines_group_id_idx ON public.crm_order_lines (order_group_id);
CREATE INDEX crm_daily_reports_date_idx ON public.crm_daily_reports (report_date);

ALTER TABLE public.crm_daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_planned_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_conducted_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_order_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_order_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_daily_reports_select ON public.crm_daily_reports
  FOR SELECT TO authenticated
  USING (manager_id = (select auth.uid()) OR public.is_admin());

CREATE POLICY crm_daily_reports_insert ON public.crm_daily_reports
  FOR INSERT TO authenticated
  WITH CHECK (manager_id = (select auth.uid()) OR public.is_admin());

CREATE POLICY crm_daily_reports_update ON public.crm_daily_reports
  FOR UPDATE TO authenticated
  USING (manager_id = (select auth.uid()) OR public.is_admin())
  WITH CHECK (manager_id = (select auth.uid()) OR public.is_admin());

CREATE POLICY crm_daily_reports_delete ON public.crm_daily_reports
  FOR DELETE TO authenticated
  USING (manager_id = (select auth.uid()) OR public.is_admin());

CREATE POLICY crm_planned_select ON public.crm_planned_meetings
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.crm_daily_reports r
    JOIN public.clients c ON c.id = crm_planned_meetings.client_id
    WHERE r.id = crm_planned_meetings.report_id
      AND c.manager_id = r.manager_id
      AND (r.manager_id = (select auth.uid()) OR public.is_admin())
  ));

CREATE POLICY crm_planned_mod ON public.crm_planned_meetings
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.crm_daily_reports r
    JOIN public.clients c ON c.id = crm_planned_meetings.client_id
    WHERE r.id = crm_planned_meetings.report_id
      AND c.manager_id = r.manager_id
      AND (r.manager_id = (select auth.uid()) OR public.is_admin())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.crm_daily_reports r
    JOIN public.clients c ON c.id = crm_planned_meetings.client_id
    WHERE r.id = crm_planned_meetings.report_id
      AND c.manager_id = r.manager_id
      AND (r.manager_id = (select auth.uid()) OR public.is_admin())
  ));

CREATE POLICY crm_conducted_select ON public.crm_conducted_meetings
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.crm_daily_reports r
    JOIN public.clients c ON c.id = crm_conducted_meetings.client_id
    WHERE r.id = crm_conducted_meetings.report_id
      AND c.manager_id = r.manager_id
      AND (r.manager_id = (select auth.uid()) OR public.is_admin())
  ));

CREATE POLICY crm_conducted_mod ON public.crm_conducted_meetings
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.crm_daily_reports r
    JOIN public.clients c ON c.id = crm_conducted_meetings.client_id
    WHERE r.id = crm_conducted_meetings.report_id
      AND c.manager_id = r.manager_id
      AND (r.manager_id = (select auth.uid()) OR public.is_admin())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.crm_daily_reports r
    JOIN public.clients c ON c.id = crm_conducted_meetings.client_id
    WHERE r.id = crm_conducted_meetings.report_id
      AND c.manager_id = r.manager_id
      AND (r.manager_id = (select auth.uid()) OR public.is_admin())
  ));

CREATE POLICY crm_og_select ON public.crm_order_groups
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.crm_daily_reports r
    JOIN public.clients c ON c.id = crm_order_groups.client_id
    WHERE r.id = crm_order_groups.report_id
      AND c.manager_id = r.manager_id
      AND (r.manager_id = (select auth.uid()) OR public.is_admin())
  ));

CREATE POLICY crm_og_mod ON public.crm_order_groups
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.crm_daily_reports r
    JOIN public.clients c ON c.id = crm_order_groups.client_id
    WHERE r.id = crm_order_groups.report_id
      AND c.manager_id = r.manager_id
      AND (r.manager_id = (select auth.uid()) OR public.is_admin())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.crm_daily_reports r
    JOIN public.clients c ON c.id = crm_order_groups.client_id
    WHERE r.id = crm_order_groups.report_id
      AND c.manager_id = r.manager_id
      AND (r.manager_id = (select auth.uid()) OR public.is_admin())
  ));

CREATE POLICY crm_ol_select ON public.crm_order_lines
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.crm_order_groups g
    JOIN public.crm_daily_reports r ON r.id = g.report_id
    JOIN public.clients c ON c.id = g.client_id
    WHERE g.id = crm_order_lines.order_group_id
      AND c.manager_id = r.manager_id
      AND (r.manager_id = (select auth.uid()) OR public.is_admin())
  ));

CREATE POLICY crm_ol_mod ON public.crm_order_lines
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.crm_order_groups g
    JOIN public.crm_daily_reports r ON r.id = g.report_id
    JOIN public.clients c ON c.id = g.client_id
    WHERE g.id = crm_order_lines.order_group_id
      AND c.manager_id = r.manager_id
      AND (r.manager_id = (select auth.uid()) OR public.is_admin())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.crm_order_groups g
    JOIN public.crm_daily_reports r ON r.id = g.report_id
    JOIN public.clients c ON c.id = g.client_id
    WHERE g.id = crm_order_lines.order_group_id
      AND c.manager_id = r.manager_id
      AND (r.manager_id = (select auth.uid()) OR public.is_admin())
  ));

COMMENT ON TABLE public.crm_daily_reports IS 'Дневной CRM-отчёт: один на менеджера и день';
