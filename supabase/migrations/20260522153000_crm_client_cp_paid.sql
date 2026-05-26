-- Админский флаг оплаты ЦП на уровне карточки контрагента.

ALTER TABLE public.crm_clients
  ADD COLUMN IF NOT EXISTS cp_paid boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.set_crm_client_cp_paid(
  p_bin text,
  p_paid boolean
)
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
  SET cp_paid = coalesce(p_paid, false)
  WHERE bin = v_bin;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Контрагент не найден';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_crm_client_cp_paid(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_crm_client_cp_paid(text, boolean) TO authenticated;
