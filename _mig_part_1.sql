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
      SELECT 1 FROM public.profiles p
      WHERE p.id = p_manager_id
        AND p.role = 'manager'
        AND coalesce(p.is_active, true)
    ) THEN
      RAISE EXCEPTION 'Менеджер не найден' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  UPDATE public.crm_clients
  SET manager_id = p_manager_id
  WHERE bin = v_bin;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Контрагент не найден' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_crm_client_digger(p_bin text, p_digger_id uuid)
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

  IF p_digger_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = p_digger_id
        AND p.role = 'lead_digger'
        AND coalesce(p.is_active, true)
    ) THEN
      RAISE EXCEPTION 'Лидоруб не найден' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  UPDATE public.crm_clients
  SET digger_id = p_digger_id
  WHERE bin = v_bin;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Контрагент не найден' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_crm_client_digger(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_crm_client_digger(text, uuid) TO authenticated;

