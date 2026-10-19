-- Чекбокс «показывать в РНП» у сотрудника (админка → Настройки). По умолчанию показываем всех.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS show_in_rnp boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.set_profile_show_in_rnp(p_id uuid, p_show boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_admin_write() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
  SET show_in_rnp = coalesce(p_show, true)
  WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_profile_show_in_rnp(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_profile_show_in_rnp(uuid, boolean) TO authenticated;
