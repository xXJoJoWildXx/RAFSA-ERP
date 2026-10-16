-- ─────────────────────────────────────────────────────────────────────────────
--  RAFSA-ERP · Almacén · Facturación CFDI y estado "entregada · factura pendiente"
--  Correlación: Total del CFDI (con IVA) vs total de la orden c/IVA (±$1.00).
--  Idempotente: se puede correr varias veces sin error.
-- ─────────────────────────────────────────────────────────────────────────────
begin;

-- 1) Nuevo estado "delivered" (entrega confirmada pero factura pendiente / sin CFDI que cuadre).
--    completed = 100% (entregada + CFDI que cuadra).
alter table public.inventory_orders drop constraint if exists inventory_orders_status_check;
alter table public.inventory_orders add constraint inventory_orders_status_check
  check (status = any (array['pending','in_progress','delivered','completed','cancelled']::text[]));

alter table public.inventory_orders add column if not exists delivered_at timestamptz;
alter table public.inventory_orders add column if not exists delivered_by uuid references public.app_users(id);

-- 2) Datos fiscales del CFDI en las facturas de la orden.
alter table public.inventory_order_invoices add column if not exists is_cfdi            boolean not null default false;
alter table public.inventory_order_invoices add column if not exists cfdi_uuid          text;
alter table public.inventory_order_invoices add column if not exists cfdi_total         numeric;
alter table public.inventory_order_invoices add column if not exists cfdi_subtotal      numeric;
alter table public.inventory_order_invoices add column if not exists cfdi_descuento     numeric;
alter table public.inventory_order_invoices add column if not exists cfdi_rfc_emisor    text;
alter table public.inventory_order_invoices add column if not exists cfdi_rfc_receptor  text;
alter table public.inventory_order_invoices add column if not exists cfdi_emisor_nombre text;
alter table public.inventory_order_invoices add column if not exists cfdi_serie         text;
alter table public.inventory_order_invoices add column if not exists cfdi_folio         text;
alter table public.inventory_order_invoices add column if not exists cfdi_fecha         timestamptz;
alter table public.inventory_order_invoices add column if not exists matches_order      boolean not null default false;

-- 3) Un mismo CFDI (UUID del timbre) no se puede registrar dos veces.
create unique index if not exists inventory_order_invoices_cfdi_uuid_key
  on public.inventory_order_invoices (cfdi_uuid) where cfdi_uuid is not null;

commit;
