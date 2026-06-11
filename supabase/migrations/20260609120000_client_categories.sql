-- Справочник категорий клиентов + поля профиля на crm_clients.

CREATE TABLE IF NOT EXISTS public.crm_client_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_client_categories_name_unique UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS crm_client_categories_sort_idx
  ON public.crm_client_categories (sort_order, name);

ALTER TABLE public.crm_clients
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.crm_client_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gz_turnover_prev_year numeric,
  ADD COLUMN IF NOT EXISTS attraction_month date;

ALTER TABLE public.crm_clients
  DROP CONSTRAINT IF EXISTS crm_clients_gz_turnover_nonneg;

ALTER TABLE public.crm_clients
  ADD CONSTRAINT crm_clients_gz_turnover_nonneg
  CHECK (gz_turnover_prev_year IS NULL OR gz_turnover_prev_year >= 0);

ALTER TABLE public.crm_clients
  ALTER COLUMN attraction_month SET DEFAULT (date_trunc('month', now()))::date;

-- RLS categories
ALTER TABLE public.crm_client_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_client_categories_select ON public.crm_client_categories;
CREATE POLICY crm_client_categories_select ON public.crm_client_categories
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS crm_client_categories_insert ON public.crm_client_categories;
CREATE POLICY crm_client_categories_insert ON public.crm_client_categories
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS crm_client_categories_admin_update ON public.crm_client_categories;
CREATE POLICY crm_client_categories_admin_update ON public.crm_client_categories
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS crm_client_categories_admin_delete ON public.crm_client_categories;
CREATE POLICY crm_client_categories_admin_delete ON public.crm_client_categories
  FOR DELETE TO authenticated
  USING (public.is_admin());

GRANT SELECT, INSERT ON TABLE public.crm_client_categories TO authenticated;
GRANT UPDATE, DELETE ON TABLE public.crm_client_categories TO authenticated;

-- Менеджер не может менять профильные поля после создания
CREATE OR REPLACE FUNCTION public.guard_crm_client_profile_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.category_id IS DISTINCT FROM OLD.category_id
     OR NEW.gz_turnover_prev_year IS DISTINCT FROM OLD.gz_turnover_prev_year
     OR NEW.attraction_month IS DISTINCT FROM OLD.attraction_month THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_crm_client_profile_fields ON public.crm_clients;
CREATE TRIGGER guard_crm_client_profile_fields
  BEFORE UPDATE ON public.crm_clients
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_crm_client_profile_fields();

CREATE OR REPLACE FUNCTION public.upsert_crm_client_category(p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := trim(coalesce(p_name, ''));
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
  END IF;
  IF length(v_name) < 2 THEN
    RAISE EXCEPTION 'Название категории слишком короткое' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.crm_client_categories (name)
  VALUES (v_name)
  ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_crm_client_category(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_crm_client_category(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_crm_client_category(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'id required' USING ERRCODE = '23514';
  END IF;

  DELETE FROM public.crm_client_categories WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_crm_client_category(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_crm_client_category(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_crm_client_profile(
  p_bin text,
  p_category_id uuid,
  p_gz_turnover numeric,
  p_attraction_month date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bin text := regexp_replace(trim(coalesce(p_bin, '')), '[^0-9]', '', 'g');
  v_attraction date;
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

  v_attraction := CASE
    WHEN p_attraction_month IS NULL THEN NULL
    ELSE (date_trunc('month', p_attraction_month))::date
  END;

  UPDATE public.crm_clients
  SET category_id = p_category_id,
      gz_turnover_prev_year = p_gz_turnover,
      attraction_month = v_attraction
  WHERE bin = v_bin;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Контрагент не найден';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_crm_client_profile(text, uuid, numeric, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_crm_client_profile(text, uuid, numeric, date) TO authenticated;
