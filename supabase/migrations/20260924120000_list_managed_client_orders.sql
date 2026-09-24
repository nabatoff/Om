-- Показывает менеджеру исторические заказы по контрагентам, которые СЕЙЧАС закреплены за ним,
-- даже если заказ создал другой (в т.ч. уволенный) менеджер. Не переносит владельца заказа и не
-- влияет на КПИ — только чтение. Нужно при передаче клиента от одного менеджера другому:
-- новый менеджер видит всю историю по контрагенту, но его собственные показатели не задваиваются
-- и старые заказы прежнего менеджера ему не засчитываются.
CREATE OR REPLACE FUNCTION public.list_managed_client_orders()
RETURNS TABLE (
  id uuid,
  report_id uuid,
  entity_name text,
  bin text,
  via_entity_name text,
  via_bin text,
  order_count integer,
  amounts numeric[],
  total_amount numeric,
  mrp_kzt_applied numeric,
  is_ktp_applied boolean,
  commission_amount numeric,
  report_date date,
  manager text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    o.id, o.report_id, o.entity_name, o.bin, o.via_entity_name, o.via_bin,
    o.order_count, o.amounts, o.total_amount, o.mrp_kzt_applied, o.is_ktp_applied, o.commission_amount,
    r.report_date, r.manager
  FROM public.crm_confirmed_orders o
  JOIN public.crm_reports r ON r.id = o.report_id
  WHERE r.manager_id IS DISTINCT FROM auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.crm_clients c
      WHERE c.bin = o.bin AND c.manager_id = auth.uid()
    );
$$;

GRANT EXECUTE ON FUNCTION public.list_managed_client_orders() TO authenticated;
