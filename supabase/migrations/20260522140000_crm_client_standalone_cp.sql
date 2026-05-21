-- ЦП по клиенту без привязки к проведённой встрече (отдельно от crm_conducted_meetings.cp_*).

CREATE TABLE IF NOT EXISTS public.crm_client_standalone_cp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id uuid NOT NULL REFERENCES public.profiles(id),
  bin text NOT NULL,
  cp_quantity integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_client_standalone_cp_bin_chk CHECK (bin ~ '^[0-9]{12}$'),
  CONSTRAINT crm_client_standalone_cp_qty_chk CHECK (cp_quantity >= 0),
  CONSTRAINT crm_client_standalone_cp_manager_bin_uniq UNIQUE (manager_id, bin)
);

CREATE INDEX IF NOT EXISTS crm_client_standalone_cp_bin_idx ON public.crm_client_standalone_cp (bin);
CREATE INDEX IF NOT EXISTS crm_client_standalone_cp_manager_idx ON public.crm_client_standalone_cp (manager_id);

ALTER TABLE public.crm_client_standalone_cp ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_client_standalone_cp_select ON public.crm_client_standalone_cp;
CREATE POLICY crm_client_standalone_cp_select ON public.crm_client_standalone_cp
  FOR SELECT TO authenticated
  USING (public.is_admin() OR manager_id = auth.uid());

DROP POLICY IF EXISTS crm_client_standalone_cp_insert ON public.crm_client_standalone_cp;
CREATE POLICY crm_client_standalone_cp_insert ON public.crm_client_standalone_cp
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR manager_id = auth.uid());

DROP POLICY IF EXISTS crm_client_standalone_cp_update ON public.crm_client_standalone_cp;
CREATE POLICY crm_client_standalone_cp_update ON public.crm_client_standalone_cp
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR manager_id = auth.uid())
  WITH CHECK (public.is_admin() OR manager_id = auth.uid());

DROP POLICY IF EXISTS crm_client_standalone_cp_delete ON public.crm_client_standalone_cp;
CREATE POLICY crm_client_standalone_cp_delete ON public.crm_client_standalone_cp
  FOR DELETE TO authenticated
  USING (public.is_admin() OR manager_id = auth.uid());

CREATE OR REPLACE FUNCTION public.upsert_client_standalone_cp(
  p_bin text,
  p_quantity integer,
  p_manager_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_mid uuid;
  v_bin text := trim(coalesce(p_bin, ''));
  v_qty integer := greatest(coalesce(p_quantity, 0), 0);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Требуется авторизация' USING ERRCODE = '42501';
  END IF;

  IF v_bin !~ '^[0-9]{12}$' THEN
    RAISE EXCEPTION 'БИН должен состоять из 12 цифр' USING ERRCODE = '23514';
  END IF;

  IF public.is_admin() AND p_manager_id IS NOT NULL THEN
    v_mid := p_manager_id;
  ELSE
    v_mid := v_uid;
  END IF;

  IF NOT public.is_admin() AND v_mid IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Недостаточно прав' USING ERRCODE = '42501';
  END IF;

  IF v_qty = 0 THEN
    DELETE FROM public.crm_client_standalone_cp
    WHERE manager_id = v_mid AND bin = v_bin;
    RETURN;
  END IF;

  INSERT INTO public.crm_client_standalone_cp (manager_id, bin, cp_quantity, updated_at)
  VALUES (v_mid, v_bin, v_qty, now())
  ON CONFLICT (manager_id, bin)
  DO UPDATE SET cp_quantity = EXCLUDED.cp_quantity, updated_at = now();
END;
$function$;

REVOKE ALL ON FUNCTION public.upsert_client_standalone_cp(text, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_client_standalone_cp(text, integer, uuid) TO authenticated;
