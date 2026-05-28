-- Дата оплаты ЦП на уровне клиента.

ALTER TABLE public.crm_clients
  ADD COLUMN IF NOT EXISTS cp_paid_at date;

CREATE OR REPLACE FUNCTION public.set_crm_client_cp_paid(
  p_bin text,
  p_paid boolean,
  p_paid_at date DEFAULT NULL
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
  IF coalesce(p_paid, false) AND p_paid_at IS NULL THEN
    RAISE EXCEPTION 'Укажите дату оплаты' USING ERRCODE = '23514';
  END IF;

  UPDATE public.crm_clients
  SET
    cp_paid = coalesce(p_paid, false),
    cp_paid_at = CASE WHEN coalesce(p_paid, false) THEN p_paid_at ELSE NULL END
  WHERE bin = v_bin;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Контрагент не найден';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_crm_client_cp_paid(text, boolean, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_crm_client_cp_paid(text, boolean, date) TO authenticated;
