-- Dual attachment: manager_id (sales) + digger_id (lead digger). Admin clear returned leads.

ALTER TABLE public.crm_clients
  ADD COLUMN IF NOT EXISTS digger_id uuid REFERENCES public.profiles(id);

CREATE INDEX IF NOT EXISTS crm_clients_digger_id_idx ON public.crm_clients (digger_id);

-- Move lead_digger owners out of manager_id into digger_id
UPDATE public.crm_clients c
SET digger_id = c.manager_id,
    manager_id = NULL
WHERE c.manager_id IS NOT NULL
  AND c.digger_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = c.manager_id AND p.role = 'lead_digger'
  );

-- Also stamp digger_id from enterprise lead creators where still missing
UPDATE public.crm_clients c
SET digger_id = l.creator_id
FROM (
  SELECT DISTINCT ON (bin) bin, creator_id
  FROM public.crm_enterprise_leads
  ORDER BY bin, transferred_at DESC
) l
WHERE c.bin = l.bin
  AND c.digger_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = l.creator_id AND p.role = 'lead_digger'
  );

