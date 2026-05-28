-- ЦП без встречи: разрешить несколько записей на одного менеджера и клиента.

ALTER TABLE public.crm_client_standalone_cp
  DROP CONSTRAINT IF EXISTS crm_client_standalone_cp_manager_bin_uniq;

CREATE INDEX IF NOT EXISTS crm_client_standalone_cp_manager_bin_idx
  ON public.crm_client_standalone_cp (manager_id, bin);

-- Совместимость со старым RPC: теперь обновляет последнюю запись, если есть, иначе создаёт новую.
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
  v_target_id uuid;
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

  SELECT s.id
    INTO v_target_id
  FROM public.crm_client_standalone_cp s
  WHERE s.manager_id = v_mid
    AND s.bin = v_bin
  ORDER BY s.updated_at DESC, s.id DESC
  LIMIT 1;

  IF v_qty = 0 THEN
    IF v_target_id IS NOT NULL THEN
      DELETE FROM public.crm_client_standalone_cp WHERE id = v_target_id;
    END IF;
    RETURN;
  END IF;

  IF v_target_id IS NULL THEN
    INSERT INTO public.crm_client_standalone_cp (manager_id, bin, cp_quantity, cp_paid, updated_at)
    VALUES (v_mid, v_bin, v_qty, false, now());
  ELSE
    UPDATE public.crm_client_standalone_cp
    SET cp_quantity = v_qty,
        cp_paid = CASE WHEN v_qty >= 1 THEN cp_paid ELSE false END,
        updated_at = now()
    WHERE id = v_target_id;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.upsert_client_standalone_cp(text, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_client_standalone_cp(text, integer, uuid) TO authenticated;
