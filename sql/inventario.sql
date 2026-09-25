-- ═══════════════════════════════════════════════════════════════════════════
--  RAFSA ERP · MÓDULO DE INVENTARIO (Almacén)
--  Migración manual para Supabase — aplicar en el SQL Editor
--
--  Contenido:
--    0. Extensiones (pg_cron, pg_net)
--    1. Modificaciones a tablas existentes (rol 'almacen')
--    2. Tablas nuevas del módulo de inventario
--    3. Índices
--    4. Funciones RPC (precios, órdenes, kardex, notificaciones)
--    5. pg_cron (generación diaria de notificaciones de caducidad de precio)
--    6. Row Level Security (RLS) + policies
--    7. Storage bucket 'inventory-invoices' + policies
--    8. Seed del catálogo (43 productos del Excel)
--
--  Orden de columnas y patrón RLS consistentes con sql/estimaciones_facturas.sql
--  Convención del proyecto: RLS permisivo `to authenticated` — la separación por
--  rol (admin / almacen) se refuerza en la capa de app (RoleGuard + middleware).
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- 0. EXTENSIONES
--    pg_cron y pg_net normalmente se habilitan desde el Dashboard:
--    Database → Extensions. Si tienes permisos, estas líneas también funcionan.
-- ═══════════════════════════════════════════════════════════════════════════
create extension if not exists pg_cron;
-- create extension if not exists pg_net;  -- (no requerido: las notificaciones son 100% en DB)


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. MODIFICACIONES A TABLAS EXISTENTES — nuevo rol 'almacen'
-- ═══════════════════════════════════════════════════════════════════════════

-- 1.1 app_users.role  ->  admin | user | worker | almacen
alter table public.app_users
  drop constraint if exists app_users_role_check;
alter table public.app_users
  add constraint app_users_role_check
  check (role = any (array['admin'::text, 'user'::text, 'worker'::text, 'almacen'::text]));

-- 1.2 permissions_matrix.role  ->  admin | user | worker | almacen
alter table public.permissions_matrix
  drop constraint if exists permissions_matrix_role_check;
alter table public.permissions_matrix
  add constraint permissions_matrix_role_check
  check (role = any (array['admin'::text, 'user'::text, 'worker'::text, 'almacen'::text]));


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. TABLAS NUEVAS
-- ═══════════════════════════════════════════════════════════════════════════

-- 2.1 Catálogo de productos --------------------------------------------------
create table public.inventory_products (
  id uuid not null default gen_random_uuid(),
  codigo text not null,                              -- SKU (ej. 19A0227703)
  descripcion text not null,
  unidad_venta text not null default 'pz',
  multiplo_venta numeric not null default 1,
  capacidad text null,                               -- ej. '19 L'
  peso numeric null,
  um_peso text not null default 'kg',
  linea text null,                                   -- ej. VINILICAS
  codigo_barras text null,
  -- Precio vigente (espejo de la fila is_current en inventory_price_history)
  current_price numeric(14, 4) not null default 0,
  price_valid_from date null,
  price_valid_until date null,                       -- fecha de caducidad del precio
  price_updated_at timestamptz null,
  -- Existencias (kardex)
  stock numeric(14, 3) not null default 0,
  stock_min numeric(14, 3) not null default 0,
  ubicacion text null,
  is_active boolean not null default true,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_products_pkey primary key (id),
  constraint inventory_products_codigo_key unique (codigo),
  constraint inventory_products_created_by_fkey foreign key (created_by) references public.app_users(id),
  constraint inventory_products_unidad_check check (multiplo_venta >= 0),
  constraint inventory_products_stock_check check (stock_min >= 0)
) tablespace pg_default;

-- 2.2 Historial de precios ---------------------------------------------------
create table public.inventory_price_history (
  id uuid not null default gen_random_uuid(),
  product_id uuid not null,
  price numeric(14, 4) not null,
  valid_from date not null default current_date,
  valid_until date null,                             -- fecha de caducidad de este precio
  is_current boolean not null default true,
  source text not null default 'manual',             -- manual | import | order
  note text null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  constraint inventory_price_history_pkey primary key (id),
  constraint inventory_price_history_product_fkey foreign key (product_id) references public.inventory_products(id) on delete cascade,
  constraint inventory_price_history_created_by_fkey foreign key (created_by) references public.app_users(id)
) tablespace pg_default;

-- 2.3 Notificaciones de caducidad de precio (las genera pg_cron) -------------
create table public.inventory_price_notifications (
  id uuid not null default gen_random_uuid(),
  product_id uuid not null,
  price_valid_until date not null,                   -- fecha que está por caducir
  notify_date date not null,                         -- price_valid_until - 7
  status text not null default 'pending',            -- pending | acknowledged | resolved | dismissed
  message text null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz null,
  resolved_by uuid null,
  constraint inventory_price_notifications_pkey primary key (id),
  constraint inventory_price_notifications_product_fkey foreign key (product_id) references public.inventory_products(id) on delete cascade,
  constraint inventory_price_notifications_resolved_by_fkey foreign key (resolved_by) references public.app_users(id),
  -- una notificación por (producto, fecha de caducidad) — evita duplicados del cron
  constraint inventory_price_notifications_unique unique (product_id, price_valid_until),
  constraint inventory_price_notifications_status_check check (
    status = any (array['pending'::text, 'acknowledged'::text, 'resolved'::text, 'dismissed'::text])
  )
) tablespace pg_default;

-- 2.4 Órdenes (reabasto = entrada / salida = despacho a obra) ----------------
create table public.inventory_orders (
  id uuid not null default gen_random_uuid(),
  folio text not null,                               -- folio legible (ej. RE-2026-0001 / SA-2026-0001)
  type text not null,                                -- restock (entrada) | dispatch (salida)
  status text not null default 'pending',            -- pending | in_progress | completed | cancelled
  obra_id uuid null,                                 -- destino (obligatorio en dispatch)
  supplier_name text null,                           -- proveedor (texto libre, para restock)
  notes text null,
  created_by uuid null,
  created_by_role text null,                         -- admin | almacen (quién la generó)
  assigned_to uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null,
  completed_by uuid null,
  cancelled_at timestamptz null,
  cancelled_by uuid null,
  constraint inventory_orders_pkey primary key (id),
  constraint inventory_orders_folio_key unique (folio),
  constraint inventory_orders_obra_fkey foreign key (obra_id) references public.obras(id) on delete set null,
  constraint inventory_orders_created_by_fkey foreign key (created_by) references public.app_users(id),
  constraint inventory_orders_completed_by_fkey foreign key (completed_by) references public.app_users(id),
  constraint inventory_orders_cancelled_by_fkey foreign key (cancelled_by) references public.app_users(id),
  constraint inventory_orders_type_check check (type = any (array['restock'::text, 'dispatch'::text])),
  constraint inventory_orders_status_check check (
    status = any (array['pending'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text])
  )
) tablespace pg_default;

-- 2.5 Renglones de la orden --------------------------------------------------
create table public.inventory_order_items (
  id uuid not null default gen_random_uuid(),
  order_id uuid not null,
  product_id uuid not null,
  codigo text null,                                  -- snapshot del código
  descripcion text null,                             -- snapshot de la descripción
  quantity numeric(14, 3) not null default 0,
  unit_price numeric(14, 4) not null default 0,      -- snapshot del precio al crear la orden
  note text null,
  created_at timestamptz not null default now(),
  constraint inventory_order_items_pkey primary key (id),
  constraint inventory_order_items_order_fkey foreign key (order_id) references public.inventory_orders(id) on delete cascade,
  constraint inventory_order_items_product_fkey foreign key (product_id) references public.inventory_products(id),
  constraint inventory_order_items_qty_check check (quantity > 0)
) tablespace pg_default;

-- 2.6 Facturas de la orden (las sube almacén) --------------------------------
create table public.inventory_order_invoices (
  id uuid not null default gen_random_uuid(),
  order_id uuid not null,
  invoice_number text null,
  amount numeric(14, 2) not null default 0,
  date date not null default current_date,
  bucket text not null default 'inventory-invoices',
  object_path text not null,                         -- ruta del archivo en storage
  file_name text null,
  mime_type text null,
  size_bytes bigint null,
  note text null,
  uploaded_by uuid null,
  uploaded_at timestamptz not null default now(),
  constraint inventory_order_invoices_pkey primary key (id),
  constraint inventory_order_invoices_order_fkey foreign key (order_id) references public.inventory_orders(id) on delete cascade,
  constraint inventory_order_invoices_uploaded_by_fkey foreign key (uploaded_by) references public.app_users(id)
) tablespace pg_default;

-- 2.7 Kardex — movimientos de existencias ------------------------------------
create table public.inventory_stock_movements (
  id uuid not null default gen_random_uuid(),
  product_id uuid not null,
  movement_type text not null,                       -- in | out | adjustment
  quantity numeric(14, 3) not null,                  -- cantidad del movimiento (con signo en adjustment)
  stock_before numeric(14, 3) not null default 0,
  stock_after numeric(14, 3) not null default 0,
  reason text not null default 'manual',             -- order_restock | order_dispatch | manual_adjustment | initial_load | import
  order_id uuid null,
  obra_id uuid null,
  note text null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  constraint inventory_stock_movements_pkey primary key (id),
  constraint inventory_stock_movements_product_fkey foreign key (product_id) references public.inventory_products(id) on delete cascade,
  constraint inventory_stock_movements_order_fkey foreign key (order_id) references public.inventory_orders(id) on delete set null,
  constraint inventory_stock_movements_obra_fkey foreign key (obra_id) references public.obras(id) on delete set null,
  constraint inventory_stock_movements_created_by_fkey foreign key (created_by) references public.app_users(id),
  constraint inventory_stock_movements_type_check check (
    movement_type = any (array['in'::text, 'out'::text, 'adjustment'::text])
  )
) tablespace pg_default;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. ÍNDICES
-- ═══════════════════════════════════════════════════════════════════════════
create index idx_inv_products_linea         on public.inventory_products using btree (linea);
create index idx_inv_products_active        on public.inventory_products using btree (is_active);
create index idx_inv_products_price_until    on public.inventory_products using btree (price_valid_until);
create index idx_inv_price_hist_product     on public.inventory_price_history using btree (product_id);
create index idx_inv_price_hist_current     on public.inventory_price_history using btree (product_id, is_current);
create index idx_inv_price_notif_status     on public.inventory_price_notifications using btree (status);
create index idx_inv_price_notif_product    on public.inventory_price_notifications using btree (product_id);
create index idx_inv_orders_status          on public.inventory_orders using btree (status);
create index idx_inv_orders_type            on public.inventory_orders using btree (type);
create index idx_inv_orders_obra            on public.inventory_orders using btree (obra_id);
create index idx_inv_order_items_order      on public.inventory_order_items using btree (order_id);
create index idx_inv_order_items_product    on public.inventory_order_items using btree (product_id);
create index idx_inv_order_invoices_order   on public.inventory_order_invoices using btree (order_id);
create index idx_inv_movements_product      on public.inventory_stock_movements using btree (product_id);
create index idx_inv_movements_order        on public.inventory_stock_movements using btree (order_id);
create index idx_inv_movements_created      on public.inventory_stock_movements using btree (created_at desc);


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. FUNCIONES RPC
--    SECURITY DEFINER para operar de forma atómica y evitar bordes de RLS.
-- ═══════════════════════════════════════════════════════════════════════════

-- 4.1 Generador de folio secuencial por tipo y año ---------------------------
create or replace function public.inventory_next_folio(p_type text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prefix text;
  v_year   text := to_char(current_date, 'YYYY');
  v_seq    int;
begin
  v_prefix := case when p_type = 'restock' then 'RE' else 'SA' end;
  select coalesce(max( (regexp_replace(folio, '^[A-Z]{2}-\d{4}-', ''))::int ), 0) + 1
    into v_seq
  from public.inventory_orders
  where folio like v_prefix || '-' || v_year || '-%';
  return v_prefix || '-' || v_year || '-' || lpad(v_seq::text, 4, '0');
end;
$$;

-- 4.2 Fijar precio de un producto (rota el historial y actualiza el espejo) ---
create or replace function public.inventory_set_price(
  p_product_id  uuid,
  p_price       numeric,
  p_valid_from  date default current_date,
  p_valid_until date default null,
  p_note        text default null,
  p_source      text default 'manual'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
begin
  -- cerrar la fila vigente anterior
  update public.inventory_price_history
     set is_current = false,
         valid_until = coalesce(valid_until, (p_valid_from - 1))
   where product_id = p_product_id
     and is_current = true;

  -- insertar la nueva fila vigente
  insert into public.inventory_price_history
    (product_id, price, valid_from, valid_until, is_current, source, note, created_by)
  values
    (p_product_id, p_price, p_valid_from, p_valid_until, true, coalesce(p_source,'manual'), p_note, v_actor);

  -- actualizar el espejo en el producto
  update public.inventory_products
     set current_price     = p_price,
         price_valid_from  = p_valid_from,
         price_valid_until = p_valid_until,
         price_updated_at  = now(),
         updated_at        = now()
   where id = p_product_id;

  -- si cambió la fecha de caducidad, resolver notificaciones viejas pendientes
  update public.inventory_price_notifications
     set status = 'resolved', resolved_at = now(), resolved_by = v_actor
   where product_id = p_product_id
     and status in ('pending','acknowledged')
     and (p_valid_until is null or price_valid_until <> p_valid_until);
end;
$$;

-- 4.3 Registrar un movimiento manual de kardex (entrada/salida/ajuste) --------
create or replace function public.inventory_register_movement(
  p_product_id uuid,
  p_type       text,             -- in | out | adjustment
  p_quantity   numeric,          -- in/out: positivo · adjustment: delta con signo
  p_reason     text default 'manual_adjustment',
  p_note       text default null,
  p_obra_id    uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor  uuid := auth.uid();
  v_before numeric;
  v_delta  numeric;
  v_after  numeric;
begin
  select stock into v_before from public.inventory_products where id = p_product_id for update;
  if v_before is null then
    raise exception 'Producto % no existe', p_product_id;
  end if;

  v_delta := case
    when p_type = 'in'         then abs(p_quantity)
    when p_type = 'out'        then -abs(p_quantity)
    when p_type = 'adjustment' then p_quantity
    else 0
  end;

  v_after := v_before + v_delta;
  if v_after < 0 then
    raise exception 'Stock insuficiente: % disponible, movimiento de %', v_before, v_delta;
  end if;

  update public.inventory_products
     set stock = v_after, updated_at = now()
   where id = p_product_id;

  insert into public.inventory_stock_movements
    (product_id, movement_type, quantity, stock_before, stock_after, reason, obra_id, note, created_by)
  values
    (p_product_id, p_type, abs(p_quantity), v_before, v_after, coalesce(p_reason,'manual_adjustment'), p_obra_id, p_note, v_actor);
end;
$$;

-- 4.4 Completar una orden (mueve stock según el tipo, de forma atómica) -------
--     Requiere que la orden tenga al menos una factura subida.
create or replace function public.inventory_complete_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_order public.inventory_orders%rowtype;
  v_item  record;
  v_before numeric;
  v_after  numeric;
  v_invoices int;
begin
  select * into v_order from public.inventory_orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'Orden % no existe', p_order_id;
  end if;
  if v_order.status = 'completed' then
    raise exception 'La orden ya está completada';
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'La orden está cancelada';
  end if;

  -- debe existir al menos una factura
  select count(*) into v_invoices from public.inventory_order_invoices where order_id = p_order_id;
  if v_invoices = 0 then
    raise exception 'La orden requiere al menos una factura antes de completarse';
  end if;

  -- aplicar cada renglón al stock
  for v_item in
    select * from public.inventory_order_items where order_id = p_order_id
  loop
    select stock into v_before from public.inventory_products where id = v_item.product_id for update;

    if v_order.type = 'restock' then
      v_after := v_before + v_item.quantity;
      update public.inventory_products set stock = v_after, updated_at = now() where id = v_item.product_id;
      insert into public.inventory_stock_movements
        (product_id, movement_type, quantity, stock_before, stock_after, reason, order_id, obra_id, created_by)
      values
        (v_item.product_id, 'in', v_item.quantity, v_before, v_after, 'order_restock', p_order_id, v_order.obra_id, v_actor);

    else -- dispatch
      v_after := v_before - v_item.quantity;
      if v_after < 0 then
        raise exception 'Stock insuficiente para % (disponible %, requerido %)',
          v_item.codigo, v_before, v_item.quantity;
      end if;
      update public.inventory_products set stock = v_after, updated_at = now() where id = v_item.product_id;
      insert into public.inventory_stock_movements
        (product_id, movement_type, quantity, stock_before, stock_after, reason, order_id, obra_id, created_by)
      values
        (v_item.product_id, 'out', v_item.quantity, v_before, v_after, 'order_dispatch', p_order_id, v_order.obra_id, v_actor);
    end if;
  end loop;

  update public.inventory_orders
     set status = 'completed', completed_at = now(), completed_by = v_actor, updated_at = now()
   where id = p_order_id;
end;
$$;

-- 4.5 Generar notificaciones de caducidad de precio (la ejecuta pg_cron) -----
--     Crea una notificación por producto cuyo precio caduca dentro de 7 días.
create or replace function public.inventory_generate_price_notifications()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int := 0;
begin
  insert into public.inventory_price_notifications
    (product_id, price_valid_until, notify_date, status, message)
  select
    p.id,
    p.price_valid_until,
    (p.price_valid_until - 7),
    'pending',
    'El precio de "' || p.descripcion || '" (' || p.codigo || ') caduca el '
      || to_char(p.price_valid_until, 'DD/MM/YYYY') || '. Actualízalo antes de esa fecha.'
  from public.inventory_products p
  where p.is_active = true
    and p.price_valid_until is not null
    and p.price_valid_until >= current_date
    and p.price_valid_until <= current_date + 7
  on conflict (product_id, price_valid_until) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- permisos de ejecución para el cliente autenticado
grant execute on function public.inventory_next_folio(text)                                   to authenticated;
grant execute on function public.inventory_set_price(uuid, numeric, date, date, text, text)    to authenticated;
grant execute on function public.inventory_register_movement(uuid, text, numeric, text, text, uuid) to authenticated;
grant execute on function public.inventory_complete_order(uuid)                                to authenticated;
grant execute on function public.inventory_generate_price_notifications()                      to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. pg_cron — generar notificaciones todos los días 07:00 (America/Mexico_City = 13:00 UTC)
-- ═══════════════════════════════════════════════════════════════════════════
-- Si ya existe un job con el mismo nombre, se re-crea.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'inventory-price-notifications') then
    perform cron.unschedule('inventory-price-notifications');
  end if;
exception when others then null;
end $$;

select cron.schedule(
  'inventory-price-notifications',
  '0 13 * * *',
  $$ select public.inventory_generate_price_notifications(); $$
);


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. ROW LEVEL SECURITY
--    Patrón permisivo del proyecto: acceso a `authenticated`.
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.inventory_products            enable row level security;
alter table public.inventory_price_history       enable row level security;
alter table public.inventory_price_notifications enable row level security;
alter table public.inventory_orders              enable row level security;
alter table public.inventory_order_items         enable row level security;
alter table public.inventory_order_invoices      enable row level security;
alter table public.inventory_stock_movements     enable row level security;

-- Helper: cuatro policies (select/insert/update/delete) por tabla, todas `authenticated`.
-- inventory_products
create policy "auth read inventory_products"   on public.inventory_products for select to authenticated using (true);
create policy "auth insert inventory_products" on public.inventory_products for insert to authenticated with check (true);
create policy "auth update inventory_products" on public.inventory_products for update to authenticated using (true);
create policy "auth delete inventory_products" on public.inventory_products for delete to authenticated using (true);
-- inventory_price_history
create policy "auth read inventory_price_history"   on public.inventory_price_history for select to authenticated using (true);
create policy "auth insert inventory_price_history" on public.inventory_price_history for insert to authenticated with check (true);
create policy "auth update inventory_price_history" on public.inventory_price_history for update to authenticated using (true);
create policy "auth delete inventory_price_history" on public.inventory_price_history for delete to authenticated using (true);
-- inventory_price_notifications
create policy "auth read inventory_price_notifications"   on public.inventory_price_notifications for select to authenticated using (true);
create policy "auth insert inventory_price_notifications" on public.inventory_price_notifications for insert to authenticated with check (true);
create policy "auth update inventory_price_notifications" on public.inventory_price_notifications for update to authenticated using (true);
create policy "auth delete inventory_price_notifications" on public.inventory_price_notifications for delete to authenticated using (true);
-- inventory_orders
create policy "auth read inventory_orders"   on public.inventory_orders for select to authenticated using (true);
create policy "auth insert inventory_orders" on public.inventory_orders for insert to authenticated with check (true);
create policy "auth update inventory_orders" on public.inventory_orders for update to authenticated using (true);
create policy "auth delete inventory_orders" on public.inventory_orders for delete to authenticated using (true);
-- inventory_order_items
create policy "auth read inventory_order_items"   on public.inventory_order_items for select to authenticated using (true);
create policy "auth insert inventory_order_items" on public.inventory_order_items for insert to authenticated with check (true);
create policy "auth update inventory_order_items" on public.inventory_order_items for update to authenticated using (true);
create policy "auth delete inventory_order_items" on public.inventory_order_items for delete to authenticated using (true);
-- inventory_order_invoices
create policy "auth read inventory_order_invoices"   on public.inventory_order_invoices for select to authenticated using (true);
create policy "auth insert inventory_order_invoices" on public.inventory_order_invoices for insert to authenticated with check (true);
create policy "auth update inventory_order_invoices" on public.inventory_order_invoices for update to authenticated using (true);
create policy "auth delete inventory_order_invoices" on public.inventory_order_invoices for delete to authenticated using (true);
-- inventory_stock_movements
create policy "auth read inventory_stock_movements"   on public.inventory_stock_movements for select to authenticated using (true);
create policy "auth insert inventory_stock_movements" on public.inventory_stock_movements for insert to authenticated with check (true);
create policy "auth update inventory_stock_movements" on public.inventory_stock_movements for update to authenticated using (true);
create policy "auth delete inventory_stock_movements" on public.inventory_stock_movements for delete to authenticated using (true);


-- ═══════════════════════════════════════════════════════════════════════════
-- 7. STORAGE — bucket privado para facturas de órdenes
-- ═══════════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public)
values ('inventory-invoices', 'inventory-invoices', false)
on conflict (id) do nothing;

-- Policies de storage (objetos del bucket). La subida real se hace vía API con
-- service_role (signed upload url), pero dejamos lectura/gestión a authenticated.
create policy "auth read inventory-invoices"
  on storage.objects for select to authenticated
  using (bucket_id = 'inventory-invoices');
create policy "auth insert inventory-invoices"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'inventory-invoices');
create policy "auth update inventory-invoices"
  on storage.objects for update to authenticated
  using (bucket_id = 'inventory-invoices');
create policy "auth delete inventory-invoices"
  on storage.objects for delete to authenticated
  using (bucket_id = 'inventory-invoices');


-- ═══════════════════════════════════════════════════════════════════════════
-- 8. SEED — catálogo inicial (43 productos del Excel "Inventario Pinturas")
--    stock/stock_min/ubicacion arrancan en 0/NULL; el precio queda sin fecha de
--    caducidad (price_valid_until = NULL) hasta que se capture la fecha real.
--    También se inserta la fila de historial vigente por cada producto.
-- ═══════════════════════════════════════════════════════════════════════════
insert into public.inventory_products
  (codigo, descripcion, unidad_venta, multiplo_venta, capacidad, peso, um_peso, linea, codigo_barras, current_price)
values
  ('19A0227703', 'VINIMEX ANTIBACTERIAL MATE V3', 'pz', 1, '19 L', 23.49, 'kg', 'VINILICAS', '7500112902054', 2484.894),
  ('19A0227712', 'VINIMEX CLASICA NF BLANCO MATE', 'pz', 1, '19 L', 26.837, 'kg', 'VINILICAS', '7500025196977', 2484.894),
  ('19A0227713', 'VINIMEX CLASICA NF MATE V1', 'pz', 1, '19 L', 27.014, 'kg', 'VINILICAS', '7500025197004', 2484.894),
  ('19A0227714', 'VINIMEX CLASICA NF MATE V2', 'pz', 1, '19 L', 23.719, 'kg', 'VINILICAS', '7500025197059', 2484.894),
  ('19A0227715', 'VINIMEX CLASICA NF MATE V3', 'pz', 1, '19 L', 22.387, 'kg', 'VINILICAS', '7500025197103', 2484.894),
  ('19A0227716', 'VINIMEX CLASICA NF MATE V4', 'pz', 1, '19 L', 21.527, 'kg', 'VINILICAS', '7500025197127', 2484.894),
  ('19A0275063', 'VINIMEX CLASICA NF BLANCO SATINADO', 'pz', 1, '19 L', 24.842, 'kg', 'VINILICAS', '7500025195314', 2484.894),
  ('19A0275064', 'VINIMEX CLASICA NF SAT V1', 'pz', 1, '19 L', 24.569, 'kg', 'VINILICAS', '7500025195352', 2484.894),
  ('19A0275065', 'VINIMEX CLASICA NF SAT V2', 'pz', 1, '19 L', 23.291, 'kg', 'VINILICAS', '7500025195383', 2484.894),
  ('19A0275066', 'VINIMEX CLASICA NF SAT V3', 'pz', 1, '19 L', 21.602, 'kg', 'VINILICAS', '7500025195413', 2484.894),
  ('19A0275067', 'VINIMEX CLASICA NF SAT V4', 'pz', 1, '19 L', 20.686, 'kg', 'VINILICAS', '7500025195529', 2484.894),
  ('19A0275069', 'VINIMEX CLASICA NF AMARILLO CONC', 'pz', 1, '19 L', 22.22, 'kg', 'VINILICAS', '7500025219355', 2484.894),
  ('19A0275070', 'VINIMEX CLASICA NF AMA NAPOLITAN', 'pz', 1, '19 L', 23.17, 'kg', 'VINILICAS', '7500025219386', 2484.894),
  ('19A0275071', 'VINIMEX CLASICA NF AZUL OLIMPIA', 'pz', 1, '19 L', 23.341, 'kg', 'VINILICAS', '7500025219416', 2484.894),
  ('19A0275072', 'VINIMEX CLASICA NF AZUL REY', 'pz', 1, '19 L', 22.334, 'kg', 'VINILICAS', '7500025219447', 2484.894),
  ('19A0275073', 'VINIMEX CLASICA NF BLANCO OSTION', 'pz', 1, '19 L', 24.23, 'kg', 'VINILICAS', '7500025219478', 2484.894),
  ('19A0275074', 'VINIMEX CLASICA NF CHAMPAÑA', 'pz', 1, '19 L', 24.25, 'kg', 'VINILICAS', '7500025219508', 2484.894),
  ('19A0275075', 'VINIMEX CLASICA NF NARANJA CONC', 'pz', 1, '19 L', 22.125, 'kg', 'VINILICAS', '7500025219539', 2484.894),
  ('19A0275076', 'VINIMEX CLASICA NF ROJO CARDENAL', 'pz', 1, '19 L', 22.41, 'kg', 'VINILICAS', '7500025219560', 2484.894),
  ('19A0275077', 'VINIMEX CLASICA NF COCOA', 'pz', 1, '19 L', 22.63, 'kg', 'VINILICAS', '7500025219591', 2484.894),
  ('19A0275078', 'VINIMEX CLASICA NF MOSTAZA', 'pz', 1, '19 L', 23.89, 'kg', 'VINILICAS', '7500025219621', 2484.894),
  ('19A0275079', 'VINIMEX CLASICA NF NEGRO', 'pz', 1, '19 L', 22.23, 'kg', 'VINILICAS', '7500025219652', 2484.894),
  ('19A0275080', 'VINIMEX CLASICA NF ROJO INDIO', 'pz', 1, '19 L', 25.29, 'kg', 'VINILICAS', '7500025219683', 2484.894),
  ('19A0275081', 'VINIMEX CLASICA NF TANGERINA', 'pz', 1, '19 L', 22.67, 'kg', 'VINILICAS', '7500025219713', 2484.894),
  ('19A0275088', 'VINIMEX CLASICA NF AZUL COLONIAL', 'pz', 1, '19 L', 21.85, 'kg', 'VINILICAS', '7500025221525', 2484.894),
  ('19A0275432', 'VINIMEX TOTAL ULTRALAVABLE SAT BCO', 'pz', 1, '19 L', 26.134, 'kg', 'VINILICAS', '7500025221174', 2814.0208),
  ('19A0275433', 'VINIMEX TOTAL ULTRALAVABLE SAT V1', 'pz', 1, '19 L', 25.885, 'kg', 'VINILICAS', '7500025221204', 2814.0208),
  ('19A0275434', 'VINIMEX TOTAL ULTRALAVABLE SAT V2', 'pz', 1, '19 L', 23.288, 'kg', 'VINILICAS', '7500025221235', 2814.0208),
  ('19A0275435', 'VINIMEX TOTAL ULTRALAVABLE SAT V3', 'pz', 1, '19 L', 21.481, 'kg', 'VINILICAS', '7500025221266', 2814.0208),
  ('19A0275436', 'VINIMEX TOTAL ULTRALAVABLE SAT V4', 'pz', 1, '19 L', 20.477, 'kg', 'VINILICAS', '7500025221297', 2814.0208),
  ('19A0275437', 'VINIMEX TOTAL ULTRALAVABLE MATE BCO', 'pz', 1, '19 L', 26.856, 'kg', 'VINILICAS', '7500025221334', 2814.0208),
  ('19A0275438', 'VINIMEX TOTAL ULTRALAVABLE MATE V1', 'pz', 1, '19 L', 26.675, 'kg', 'VINILICAS', '7500025221365', 2814.0208),
  ('19A0275439', 'VINIMEX TOTAL ULTRALAVABLE MATE V2', 'pz', 1, '19 L', 22.09, 'kg', 'VINILICAS', '7500025221396', 2814.0208),
  ('19A0275440', 'VINIMEX TOTAL ULTRALAVABLE MATE V3', 'pz', 1, '19 L', 21.243, 'kg', 'VINILICAS', '7500025221426', 2814.0208),
  ('19A0275441', 'VINIMEX TOTAL ULTRALAVABLE MATE V4', 'pz', 1, '19 L', 18.99, 'kg', 'VINILICAS', '7500025221457', 2814.0208),
  ('19A0279401', 'VINIMEX 3 EN 1 SATINADO BLANCO', 'pz', 1, '19 L', 25.3, 'kg', 'VINILICAS', '7500025019856', 2738.3308),
  ('19A0279402', 'VINIMEX 3 EN 1 SATINADO V1', 'pz', 1, '19 L', 25.06, 'kg', 'VINILICAS', '7500025019887', 2738.3308),
  ('19A0279403', 'VINIMEX 3 EN 1 SATINADO V2', 'pz', 1, '19 L', 24.068, 'kg', 'VINILICAS', '7500025019917', 2738.3308),
  ('19A0279404', 'VINIMEX 3 EN 1 SATINADO V3', 'pz', 1, '19 L', 22.43, 'kg', 'VINILICAS', '7500025019948', 2738.3308),
  ('19A0279405', 'VINIMEX 3 EN 1 MATE BLANCO', 'pz', 1, '19 L', 25.792, 'kg', 'VINILICAS', '7500025131053', 2738.3308),
  ('19A0279406', 'VINIMEX 3 EN 1 MATE V1', 'pz', 1, '19 L', 25.496, 'kg', 'VINILICAS', '7500025131084', 2738.3308),
  ('19A0279407', 'VINIMEX 3 EN 1 MATE V2', 'pz', 1, '19 L', 24.893, 'kg', 'VINILICAS', '7500025131114', 2738.3308),
  ('19A0279408', 'VINIMEX 3 EN 1 MATE V3', 'pz', 1, '19 L', 23.752, 'kg', 'VINILICAS', '7500025131145', 2738.3308);

-- fila de historial de precios vigente para cada producto sembrado
insert into public.inventory_price_history (product_id, price, valid_from, is_current, source, note)
  select id, current_price, current_date, true, 'import', 'Carga inicial (Excel Inventario Pinturas)'
  from public.inventory_products
  where not exists (select 1 from public.inventory_price_history h where h.product_id = inventory_products.id);

-- ═══ FIN DE LA MIGRACIÓN ═══
