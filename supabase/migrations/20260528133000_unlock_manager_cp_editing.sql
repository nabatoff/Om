-- Возвращаем менеджерам возможность редактировать/обнулять/удалять ЦП.

DROP TRIGGER IF EXISTS guard_manager_cp_locked_conducted ON public.crm_conducted_meetings;
DROP TRIGGER IF EXISTS guard_manager_cp_locked_standalone_u ON public.crm_client_standalone_cp;
DROP TRIGGER IF EXISTS guard_manager_cp_locked_standalone_d ON public.crm_client_standalone_cp;

DROP FUNCTION IF EXISTS public.guard_manager_cp_locked();
