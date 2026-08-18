-- Проведённые «Новая» ошибочно сохранились как «Повторная» из‑за плана в том же отчёте.
UPDATE public.crm_conducted_meetings cm
SET meeting_type = 'Новая'
FROM public.crm_reports r
WHERE cm.report_id = r.id
  AND cm.deleted_at IS NULL
  AND cm.meeting_type = 'Повторная'
  AND regexp_replace(coalesce(cm.bin, ''), '[^0-9]', '', 'g') IN ('751122402460', '230240032834')
  AND EXISTS (
    SELECT 1
    FROM public.crm_assigned_meetings am
    JOIN public.crm_reports ar ON ar.id = am.report_id
    WHERE am.deleted_at IS NULL
      AND am.meeting_type = 'Новая'
      AND regexp_replace(coalesce(am.bin, ''), '[^0-9]', '', 'g') = regexp_replace(coalesce(cm.bin, ''), '[^0-9]', '', 'g')
      AND ar.manager_id = r.manager_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.crm_conducted_meetings cm2
    JOIN public.crm_reports r2 ON r2.id = cm2.report_id
    WHERE cm2.id <> cm.id
      AND cm2.deleted_at IS NULL
      AND cm2.meeting_type = 'Новая'
      AND regexp_replace(coalesce(cm2.bin, ''), '[^0-9]', '', 'g') = regexp_replace(coalesce(cm.bin, ''), '[^0-9]', '', 'g')
      AND r2.manager_id = r.manager_id
      AND cm2.meeting_date < cm.meeting_date
  );
