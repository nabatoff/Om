-- Сколько кодов «Нацизъятия» действует сейчас: все минус те, у кого срок (dd.mm.yyyy) уже вышел.
CREATE OR REPLACE FUNCTION public.count_active_national_exemption_codes()
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT count(*)::integer
  FROM public.crm_ens_tru_national_exemption_codes
  WHERE valid_until = ''
     OR valid_until !~ '^\d{2}\.\d{2}\.\d{4}$'
     OR to_date(valid_until, 'DD.MM.YYYY') >= current_date;
$$;

GRANT EXECUTE ON FUNCTION public.count_active_national_exemption_codes() TO authenticated, service_role;
