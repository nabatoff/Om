-- Автоподтягивание кодов «Нацизъятия» со страницы zakup.gov.kz/nr (Edge Function sync-national-exemption).
-- Здесь хранится, какие документы уже обработаны: по хэшу файла видно, обновился ли он под тем же адресом.

CREATE TABLE IF NOT EXISTS public.crm_ens_tru_nr_sources (
  url text PRIMARY KEY,
  label text NOT NULL DEFAULT '',
  content_hash text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('ok', 'empty', 'skipped', 'error', 'pending', 'expired')),
  codes_found integer NOT NULL DEFAULT 0,
  codes_added integer NOT NULL DEFAULT 0,
  error text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

ALTER TABLE public.crm_ens_tru_nr_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_ens_tru_nr_sources_admin_select ON public.crm_ens_tru_nr_sources;
CREATE POLICY crm_ens_tru_nr_sources_admin_select ON public.crm_ens_tru_nr_sources
  FOR SELECT TO authenticated
  USING (public.is_admin());

GRANT SELECT ON TABLE public.crm_ens_tru_nr_sources TO authenticated;
