-- Realtime for digger lead status updates
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_enterprise_leads;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

ALTER TABLE public.crm_enterprise_leads REPLICA IDENTITY FULL;
