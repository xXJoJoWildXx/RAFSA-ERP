-- =====================================================================
-- RAFSA ERP · Proveedores — Parte 10
-- Borrar envíos a obra: sólo admin, devolviendo el material al almacén
--
-- Corre después del 09.
--
-- Mismo par de problemas que con las facturas, en espejo:
--
--   1. La política del archivo 02 es FOR ALL para admin, user y almacén,
--      y FOR ALL incluye DELETE. Hay que partirla.
--
--   2. proveedores_stock_movimientos apunta al envío con ON DELETE SET
--      NULL, así que al borrar un envío los movimientos de SALIDA se
--      quedaban y el material nunca regresaba al almacén: el stock
--      seguía descontado por un envío que ya no existe.
-- =====================================================================

begin;

-- =====================================================================
-- 1. Permisos
-- =====================================================================

drop policy if exists proveedores_envios_write  on public.proveedores_envios;
drop policy if exists proveedores_envios_insert on public.proveedores_envios;
drop policy if exists proveedores_envios_update on public.proveedores_envios;
drop policy if exists proveedores_envios_delete on public.proveedores_envios;

create policy proveedores_envios_insert
  on public.proveedores_envios for insert to authenticated
  with check (public.current_app_role() in ('admin','user','almacen'));

create policy proveedores_envios_update
  on public.proveedores_envios for update to authenticated
  using      (public.current_app_role() in ('admin','user','almacen'))
  with check (public.current_app_role() in ('admin','user','almacen'));

create policy proveedores_envios_delete
  on public.proveedores_envios for delete to authenticated
  using (public.current_app_role() = 'admin');

-- Los renglones se van en cascada con su envío, pero nadie debe poder
-- borrarlos sueltos de un envío ya hecho.
drop policy if exists proveedores_envios_items_write  on public.proveedores_envios_items;
drop policy if exists proveedores_envios_items_insert on public.proveedores_envios_items;
drop policy if exists proveedores_envios_items_update on public.proveedores_envios_items;
drop policy if exists proveedores_envios_items_delete on public.proveedores_envios_items;

create policy proveedores_envios_items_insert
  on public.proveedores_envios_items for insert to authenticated
  with check (public.current_app_role() in ('admin','user','almacen'));

create policy proveedores_envios_items_update
  on public.proveedores_envios_items for update to authenticated
  using      (public.current_app_role() in ('admin','user','almacen'))
  with check (public.current_app_role() in ('admin','user','almacen'));

create policy proveedores_envios_items_delete
  on public.proveedores_envios_items for delete to authenticated
  using (public.current_app_role() = 'admin');


-- =====================================================================
-- 2. Al borrar, el material regresa al almacén
-- =====================================================================

create or replace function public.proveedores_limpiar_envio_borrado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_obra  text;
  v_items integer;
  v_total numeric(14,2);
begin
  select o.name into v_obra from public.obras o where o.id = old.obra_id;

  select count(*), coalesce(sum(i.importe), 0)
    into v_items, v_total
    from public.proveedores_envios_items i
   where i.envio_id = old.id;

  -- Borrar las salidas devuelve el stock: el trigger de recálculo lo
  -- vuelve a sumar solo. Regresar material nunca deja stock negativo,
  -- así que aquí no hace falta ninguna guarda.
  delete from public.proveedores_stock_movimientos m
   using public.proveedores_envios_items i
   where i.id = m.envio_item_id and i.envio_id = old.id;

  insert into public.activity_log
    (actor_user_id, actor_email, event_type, entity_type, entity_id, entity_label, metadata)
  values (
    auth.uid(),
    (select u.email from public.app_users u where u.id = auth.uid()),
    'proveedor.envio_eliminado', 'proveedores_envio', old.id::text,
    coalesce(old.folio, 'sin folio') || ' · ' || coalesce(v_obra, 'sin obra'),
    jsonb_build_object('obra', v_obra, 'renglones', v_items, 'importe', v_total,
                       'material_devuelto', true)
  );

  return old;
end;
$$;

drop trigger if exists trg_proveedores_limpiar_envio on public.proveedores_envios;
create trigger trg_proveedores_limpiar_envio
  before delete on public.proveedores_envios
  for each row execute function public.proveedores_limpiar_envio_borrado();

comment on function public.proveedores_limpiar_envio_borrado() is
  'Al borrar un envío regresa su material al almacén y deja el movimiento en actividades.';

commit;
