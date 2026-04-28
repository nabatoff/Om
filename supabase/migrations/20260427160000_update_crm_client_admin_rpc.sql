-- Админ: обновление карточки контрагента и при смене БИН — синхронизация bin во всех строках отчётов.

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
  END IF;

  UPDATE public.crm_clients
  SET name = nullif(trim(p_name), ''),
      bin = v_new
  WHERE bin = v_old;
END;
$$;

REVOKE ALL ON FUNCTION public.update_crm_client(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_crm_client(text, text, text) TO authenticated;
