-- ============================================================================
-- El rol "user" (personal de administración) sólo CONSULTA el inventario
-- ----------------------------------------------------------------------------
-- Esconder los botones no es un permiso: con la llave pública cualquiera puede
-- llamar a la API de Supabase directo. El bloqueo real va aquí, en RLS.
--
-- Quién puede escribir el catálogo: admin y almacen.
-- Quién puede leerlo: cualquier sesión autenticada.
-- ============================================================================

-- Helper: el rol de quien hace la petición, desde app_users.
create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(role, ''))
    from public.app_users
   where id = auth.uid()
     and is_active is not false
$$;

comment on function public.current_app_role() is
  'Rol del usuario autenticado, para usarlo en políticas RLS sin recursión.';

grant execute on function public.current_app_role() to authenticated;

-- ── inventory_products ──
alter table public.inventory_products enable row level security;

drop policy if exists inventory_products_select on public.inventory_products;
drop policy if exists inventory_products_write  on public.inventory_products;
drop policy if exists inventory_products_authenticated_all on public.inventory_products;

create policy inventory_products_select
  on public.inventory_products
  for select to authenticated
  using (true);

-- Una sola política para insert/update/delete: sólo quien mantiene el catálogo
create policy inventory_products_write
  on public.inventory_products
  for all to authenticated
  using (public.current_app_role() in ('admin', 'almacen'))
  with check (public.current_app_role() in ('admin', 'almacen'));

-- ── Historial de precios: se escribe desde inventory_set_price ──
alter table public.inventory_price_history enable row level security;

drop policy if exists inventory_price_history_select on public.inventory_price_history;
drop policy if exists inventory_price_history_write  on public.inventory_price_history;
drop policy if exists inventory_price_history_authenticated_all on public.inventory_price_history;

create policy inventory_price_history_select
  on public.inventory_price_history
  for select to authenticated
  using (true);

create policy inventory_price_history_write
  on public.inventory_price_history
  for all to authenticated
  using (public.current_app_role() in ('admin', 'almacen'))
  with check (public.current_app_role() in ('admin', 'almacen'));

-- ── Comprobación ──
-- Debe listar: products → select (todos) + write (admin/almacen), igual para history
select tablename, policyname, cmd, roles
  from pg_policies
 where schemaname = 'public'
   and tablename in ('inventory_products', 'inventory_price_history')
 order by tablename, policyname;

-- ── OJO con inventory_set_price ──
-- El precio no se actualiza con un UPDATE directo sino con esta función. Si
-- está declarada SECURITY DEFINER, corre con los permisos de su dueño y RLS
-- NO la frena: habría que meterle la validación de rol adentro.
-- Esta consulta lo dice (seguridad = 'definer' → hay que revisarla):
select p.proname,
       case when p.prosecdef then 'definer (revisar)' else 'invoker (ok)' end as seguridad
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname = 'inventory_set_price';
