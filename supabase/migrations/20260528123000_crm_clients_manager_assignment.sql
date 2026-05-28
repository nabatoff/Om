-- Привязка контрагента к менеджеру + admin RPC для смены менеджера.

ALTER TABLE public.crm_clients
  ADD COLUMN IF NOT EXISTS manager_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'crm_clients_manager_id_fkey'
  ) THEN
    ALTER TABLE public.crm_clients
      ADD CONSTRAINT crm_clients_manager_id_fkey
      FOREIGN KEY (manager_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS crm_clients_manager_id_idx ON public.crm_clients(manager_id);

CREATE OR REPLACE FUNCTION public.set_crm_client_manager(
  p_bin text,
  p_manager_id uuid
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

  IF p_manager_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = p_manager_id
        AND p.role = 'manager'
        AND p.is_active IS NOT FALSE
    ) THEN
      RAISE EXCEPTION 'Менеджер не найден или неактивен';
    END IF;
  END IF;

  UPDATE public.crm_clients
  SET manager_id = p_manager_id
  WHERE bin = v_bin;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Контрагент не найден';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_crm_client_manager(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_crm_client_manager(text, uuid) TO authenticated;
