-- Отдел (менеджер/лидоруб/админ) сейчас определяется на лету по ТЕКУЩЕЙ роли сотрудника —
-- значит, стоит поменять роль или уволить человека (is_active=false), и все его СТАРЫЕ
-- отчёты мгновенно "уезжают" в другую вкладку (Лидорубы -> Менеджеры, или в "неизвестный"
-- при увольнении). Фиксируем отдел на самом отчёте в момент его первого создания — дальше
-- ничего не пересчитывается, что бы ни случилось с профилем сотрудника.

ALTER TABLE public.crm_reports ADD COLUMN IF NOT EXISTS staff_dept text;

ALTER TABLE public.crm_reports DROP CONSTRAINT IF EXISTS crm_reports_staff_dept_check;
ALTER TABLE public.crm_reports ADD CONSTRAINT crm_reports_staff_dept_check
  CHECK (staff_dept IS NULL OR staff_dept IN ('managers', 'diggers', 'admin'));

-- Общая логика вычисления отдела по менеджеру отчёта (по id, иначе по имени) — использует
-- ЛЮБОЙ профиль (активный или нет), чтобы бэкфилл был максимально точным по факту роли.
CREATE OR REPLACE FUNCTION public.resolve_staff_dept_for_manager(p_manager_id uuid, p_manager_name text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_name text := trim(coalesce(p_manager_name, ''));
  v_name_norm text;
BEGIN
  IF p_manager_id IS NOT NULL THEN
    SELECT role INTO v_role FROM public.profiles WHERE id = p_manager_id;
    IF v_role IS NOT NULL THEN
      IF v_role = 'admin' THEN RETURN 'admin'; END IF;
      IF v_role = 'lead_digger' THEN RETURN 'diggers'; END IF;
      RETURN 'managers';
    END IF;
  END IF;

  IF v_name = '' THEN
    RETURN NULL;
  END IF;

  v_name_norm := lower(replace(v_name, 'ё', 'е'));
  IF v_name_norm IN ('administrator', 'admin', 'админ', 'администратор') OR v_name_norm LIKE '%администратор%' THEN
    RETURN 'admin';
  END IF;

  SELECT role INTO v_role
  FROM public.profiles
  WHERE lower(trim(full_name)) = lower(v_name)
  LIMIT 1;

  IF v_role IS NOT NULL THEN
    IF v_role = 'admin' THEN RETURN 'admin'; END IF;
    IF v_role = 'lead_digger' THEN RETURN 'diggers'; END IF;
    RETURN 'managers';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_staff_dept_for_manager(uuid, text) FROM PUBLIC;

-- Бэкфилл существующих отчётов — фиксируем отдел "как сейчас", раз более раннего снимка
-- никогда не было. С этого момента изменения роли/увольнения их больше не затронут.
UPDATE public.crm_reports
SET staff_dept = public.resolve_staff_dept_for_manager(manager_id, manager)
WHERE staff_dept IS NULL;

-- На все новые отчёты отдел проставляется один раз при создании и больше не трогается.
CREATE OR REPLACE FUNCTION public.trg_stamp_report_staff_dept()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.staff_dept IS NULL THEN
    NEW.staff_dept := public.resolve_staff_dept_for_manager(NEW.manager_id, NEW.manager);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_reports_stamp_staff_dept ON public.crm_reports;
CREATE TRIGGER trg_crm_reports_stamp_staff_dept
BEFORE INSERT ON public.crm_reports
FOR EACH ROW EXECUTE FUNCTION public.trg_stamp_report_staff_dept();
