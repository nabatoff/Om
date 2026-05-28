-- Исправление 403 на PostgREST: таблица была с RLS/policies, но без GRANT для authenticated.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.crm_client_standalone_cp TO authenticated;
