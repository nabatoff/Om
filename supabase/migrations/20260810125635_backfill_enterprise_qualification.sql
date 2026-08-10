-- Backfill +1 validated_total for already-assigned enterprise leads
-- that were never incremented (meeting_requested false or pre-RPC).
-- Idempotent: skip if any lead_event already has qualification_counted=true.

DO $$
DECLARE
  r record;
  v_report_id uuid;
  v_day date;
BEGIN
  FOR r IN
    SELECT l.*
    FROM public.crm_enterprise_leads l
    WHERE l.assigned_manager_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.crm_lead_events e
        WHERE e.lead_id = l.id
          AND coalesce((e.payload->>'qualification_counted')::boolean, false)
      )
    ORDER BY coalesce(l.assigned_at, l.transferred_at)
  LOOP
    v_day := coalesce(
      (timezone('Asia/Almaty', r.assigned_at))::date,
      r.transferred_on,
      (timezone('Asia/Almaty', r.transferred_at))::date,
      (timezone('Asia/Almaty', now()))::date
    );

    v_report_id := public.ensure_crm_report_for_manager(r.assigned_manager_id, v_day);

    UPDATE public.crm_reports
    SET validated_total = coalesce(validated_total, 0) + 1
    WHERE id = v_report_id;

    UPDATE public.crm_enterprise_leads
    SET qualification_counted = true, updated_at = now()
    WHERE id = r.id;

    IF EXISTS (
      SELECT 1 FROM public.crm_lead_events e
      WHERE e.lead_id = r.id AND e.action = 'assigned'
    ) THEN
      UPDATE public.crm_lead_events e
      SET payload = coalesce(e.payload, '{}'::jsonb)
        || jsonb_build_object(
          'qualification_counted', true,
          'backfill', true,
          'report_date', to_jsonb(v_day)
        )
      WHERE e.id = (
        SELECT e2.id
        FROM public.crm_lead_events e2
        WHERE e2.lead_id = r.id AND e2.action = 'assigned'
        ORDER BY e2.created_at
        LIMIT 1
      );
    ELSE
      INSERT INTO public.crm_lead_events (lead_id, actor_id, action, payload)
      VALUES (
        r.id,
        NULL,
        'qualification_backfill',
        jsonb_build_object(
          'manager_id', r.assigned_manager_id,
          'qualification_counted', true,
          'backfill', true,
          'report_date', to_jsonb(v_day)
        )
      );
    END IF;
  END LOOP;
END $$;
