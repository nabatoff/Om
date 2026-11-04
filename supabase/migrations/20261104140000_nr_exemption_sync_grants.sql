-- Edge Function sync-national-exemption работает под service_role: в этом проекте у неё нет прав по умолчанию.
GRANT SELECT, INSERT, UPDATE ON TABLE public.crm_ens_tru_national_exemption_codes TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.crm_ens_tru_nr_sources TO service_role;
