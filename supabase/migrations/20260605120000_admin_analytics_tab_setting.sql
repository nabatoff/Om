-- Вкладка «Аналитика» в админке: включена по умолчанию (1).

INSERT INTO public.crm_settings (key, value_numeric)
VALUES ('admin_analytics_tab_enabled', 1)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_crm_admin_analytics_tab_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT s.value_numeric <> 0 FROM public.crm_settings s WHERE s.key = 'admin_analytics_tab_enabled' LIMIT 1),
    true
  );
$$;

CREATE OR REPLACE FUNCTION public.set_crm_admin_analytics_tab_enabled(p_enabled boolean)
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

  INSERT INTO public.crm_settings (key, value_numeric, updated_at)
  VALUES ('admin_analytics_tab_enabled', CASE WHEN coalesce(p_enabled, false) THEN 1 ELSE 0 END, now())
  ON CONFLICT (key) DO UPDATE
  SET value_numeric = EXCLUDED.value_numeric, updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.get_crm_admin_analytics_tab_enabled() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_crm_admin_analytics_tab_enabled() TO authenticated;
REVOKE ALL ON FUNCTION public.set_crm_admin_analytics_tab_enabled(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_crm_admin_analytics_tab_enabled(boolean) TO authenticated;
