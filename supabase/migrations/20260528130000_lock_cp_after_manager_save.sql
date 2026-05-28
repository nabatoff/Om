-- После сохранения ЦП менеджером редактирование/обнуление/удаление запрещено.
-- Админ сохраняет полный доступ.

CREATE OR REPLACE FUNCTION public.guard_manager_cp_locked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_admin() THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_TABLE_NAME = 'crm_conducted_meetings' THEN
    IF OLD.cp_sent IS TRUE AND coalesce(OLD.cp_quantity, 0) >= 1 THEN
      IF TG_OP = 'UPDATE'
         AND (
           NEW.cp_sent IS DISTINCT FROM OLD.cp_sent
           OR coalesce(NEW.cp_quantity, 0) IS DISTINCT FROM coalesce(OLD.cp_quantity, 0)
         ) THEN
        RAISE EXCEPTION 'ЦП по встрече уже сохранено и не может быть изменено менеджером'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'crm_client_standalone_cp' THEN
    IF coalesce(OLD.cp_quantity, 0) >= 1 THEN
      IF TG_OP = 'UPDATE'
         AND coalesce(NEW.cp_quantity, 0) IS DISTINCT FROM coalesce(OLD.cp_quantity, 0) THEN
        RAISE EXCEPTION 'ЦП без встречи уже сохранено и не может быть изменено менеджером'
          USING ERRCODE = '42501';
      ELSIF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'ЦП без встречи уже сохранено и не может быть удалено менеджером'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

DROP TRIGGER IF EXISTS guard_manager_cp_locked_conducted ON public.crm_conducted_meetings;
CREATE TRIGGER guard_manager_cp_locked_conducted
BEFORE UPDATE ON public.crm_conducted_meetings
FOR EACH ROW
EXECUTE FUNCTION public.guard_manager_cp_locked();

DROP TRIGGER IF EXISTS guard_manager_cp_locked_standalone_u ON public.crm_client_standalone_cp;
CREATE TRIGGER guard_manager_cp_locked_standalone_u
BEFORE UPDATE ON public.crm_client_standalone_cp
FOR EACH ROW
EXECUTE FUNCTION public.guard_manager_cp_locked();

DROP TRIGGER IF EXISTS guard_manager_cp_locked_standalone_d ON public.crm_client_standalone_cp;
CREATE TRIGGER guard_manager_cp_locked_standalone_d
BEFORE DELETE ON public.crm_client_standalone_cp
FOR EACH ROW
EXECUTE FUNCTION public.guard_manager_cp_locked();
