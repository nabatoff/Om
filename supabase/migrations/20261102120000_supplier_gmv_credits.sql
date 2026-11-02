-- Ручное «засчитать порог GMV» поставщику за календарный месяц (ставит только админ в окне заказа).
-- Хранится отдельно от crm_confirmed_orders: при пересохранении отчёта менеджером заказы пересоздаются,
-- а отметка должна остаться.

CREATE TABLE IF NOT EXISTS public.supplier_gmv_credits (
  bin text NOT NULL,
  month text NOT NULL CHECK (month ~ '^\d{4}-\d{2}$'),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bin, month)
);

ALTER TABLE public.supplier_gmv_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supplier_gmv_credits_select ON public.supplier_gmv_credits;
CREATE POLICY supplier_gmv_credits_select ON public.supplier_gmv_credits
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.admin_set_supplier_gmv_credit(p_bin text, p_month text, p_on boolean)
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

  IF coalesce(p_on, false) THEN
    INSERT INTO public.supplier_gmv_credits (bin, month)
    VALUES (btrim(p_bin), p_month)
    ON CONFLICT (bin, month) DO NOTHING;
  ELSE
    DELETE FROM public.supplier_gmv_credits WHERE bin = btrim(p_bin) AND month = p_month;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_supplier_gmv_credit(text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_supplier_gmv_credit(text, text, boolean) TO authenticated;
