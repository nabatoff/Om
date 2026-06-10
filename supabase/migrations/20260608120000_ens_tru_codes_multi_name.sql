-- Разрешить несколько наименований на один код ЕНС ТРУ.

TRUNCATE public.crm_ens_tru_codes;

ALTER TABLE public.crm_ens_tru_codes DROP CONSTRAINT IF EXISTS crm_ens_tru_codes_pkey;

ALTER TABLE public.crm_ens_tru_codes ADD COLUMN IF NOT EXISTS id bigserial;

UPDATE public.crm_ens_tru_codes SET id = DEFAULT WHERE id IS NULL;

ALTER TABLE public.crm_ens_tru_codes ADD PRIMARY KEY (id);

CREATE INDEX IF NOT EXISTS crm_ens_tru_codes_code_idx ON public.crm_ens_tru_codes (code);

CREATE UNIQUE INDEX IF NOT EXISTS crm_ens_tru_codes_code_name_uidx
  ON public.crm_ens_tru_codes (code, name);

CREATE OR REPLACE FUNCTION public.check_ens_tru_codes(p_codes text[])
RETURNS TABLE (
  input_code text,
  found boolean,
  name text,
  category text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_norm text;
  v_seen text[] := ARRAY[]::text[];
  v_has_match boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
  END IF;
  IF public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_codes IS NULL OR array_length(p_codes, 1) IS NULL THEN
    RETURN;
  END IF;

  FOREACH v_code IN ARRAY p_codes LOOP
    v_norm := public.normalize_ens_tru_code(v_code);
    IF v_norm IS NULL THEN
      CONTINUE;
    END IF;
    IF v_norm = ANY (v_seen) THEN
      CONTINUE;
    END IF;
    v_seen := array_append(v_seen, v_norm);

    SELECT EXISTS (
      SELECT 1 FROM public.crm_ens_tru_codes e WHERE e.code = v_norm
    ) INTO v_has_match;

    IF v_has_match THEN
      RETURN QUERY
      SELECT
        v_norm AS input_code,
        true AS found,
        e.name,
        e.category
      FROM public.crm_ens_tru_codes e
      WHERE e.code = v_norm
      ORDER BY e.id;
    ELSE
      RETURN QUERY
      SELECT v_norm, false, NULL::text, NULL::text;
    END IF;
  END LOOP;
END;
$$;
