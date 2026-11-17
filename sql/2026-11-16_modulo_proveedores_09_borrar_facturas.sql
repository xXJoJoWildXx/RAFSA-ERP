-- =====================================================================
-- RAFSA ERP · Proveedores — Parte 9
-- Borrar facturas: sólo admin, y dejando el inventario cuadrado
--
-- Corre después del 08.
--
-- DOS PROBLEMAS QUE RESUELVE
--
-- 1. HOY BORRA CUALQUIERA. La política del archivo 02 es FOR ALL para
--    admin, user y almacén, y FOR ALL incluye DELETE. Como las políticas
--    permisivas se suman con OR, no sirve agregar una restricción encima:
--    hay que partir esa política en INSERT/UPDATE por un lado y DELETE
--    por otro.
--
-- 2. BORRAR DEJABA INVENTARIO FANTASMA. proveedores_stock_movimientos
--    apunta a la factura con ON DELETE SET NULL, así que al borrar una
--    factura procesada los movimientos de ENTRADA se quedaban y el stock
--    no bajaba. El producto seguía existiendo con piezas que entraron por
--    una factura que ya no existe. Lo mismo con el historial de precios,
--    que seguía pesando en el promedio, y con las rentas.
-- =====================================================================

begin;

-- =====================================================================
-- 1. Permisos: partir el FOR ALL
-- =====================================================================

drop policy if exists proveedores_facturas_write  on public.proveedores_facturas;
drop policy if exists proveedores_facturas_insert on public.proveedores_facturas;
drop policy if exists proveedores_facturas_update on public.proveedores_facturas;
drop policy if exists proveedores_facturas_delete on public.proveedores_facturas;

create policy proveedores_facturas_insert
  on public.proveedores_facturas for insert to authenticated
  with check (public.current_app_role() in ('admin','user','almacen'));

create policy proveedores_facturas_update
  on public.proveedores_facturas for update to authenticated
  using      (public.current_app_role() in ('admin','user','almacen'))
  with check (public.current_app_role() in ('admin','user','almacen'));

-- Sólo admin. Borrar una factura mueve inventario y tira pagos: no es
-- una acción de captura.
create policy proveedores_facturas_delete
  on public.proveedores_facturas for delete to authenticated
  using (public.current_app_role() = 'admin');


-- =====================================================================
-- 2. Limpieza al borrar
--    Corre ANTES del borrado, mientras las llaves siguen en pie.
-- =====================================================================

create or replace function public.proveedores_limpiar_factura_borrada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pagos    integer;
  v_folio    text;
  v_negativo record;
begin
  v_folio := coalesce(nullif(trim(concat_ws('-', old.serie, old.folio)), ''), 'sin folio');

  -- 2.1 Con pagos aplicados no se borra. Son datos financieros y se irían
  --     en cascada sin que nadie los vea desaparecer.
  select count(*) into v_pagos
    from public.proveedores_facturas_pagos where factura_id = old.id;
  if v_pagos > 0 then
    raise exception
      'La factura % tiene % pago(s) registrado(s). Elimínalos primero si de verdad quieres borrarla.',
      v_folio, v_pagos
      using errcode = 'restrict_violation';
  end if;

  -- 2.2 ¿Alcanza el stock para revertir lo que entró por esta factura?
  --     Si ya se envió a obra, no hay forma honesta de deshacerlo: el
  --     material físicamente ya no está.
  select p.descripcion, p.stock, sum(m.cantidad) as entro
    into v_negativo
    from public.proveedores_stock_movimientos m
    join public.proveedores_facturas_items i on i.id = m.factura_item_id
    join public.proveedores_productos p      on p.id = m.producto_id
   where i.factura_id = old.id and m.tipo = 'entrada'
   group by p.id, p.descripcion, p.stock
  having p.stock < sum(m.cantidad)
   limit 1;

  if found then
    raise exception
      'No se puede borrar la factura %: de "%" entraron % piezas por ella y sólo quedan % en almacén, así que ya se enviaron a obra.',
      v_folio, v_negativo.descripcion, v_negativo.entro, v_negativo.stock
      using errcode = 'restrict_violation';
  end if;

  -- 2.3 Revertir. Borrar los movimientos dispara el recálculo de stock,
  --     y borrar el historial dispara el de precios.
  delete from public.proveedores_stock_movimientos m
   using public.proveedores_facturas_items i
   where i.id = m.factura_item_id and i.factura_id = old.id;

  delete from public.proveedores_productos_precios
   where factura_id = old.id;

  delete from public.proveedores_rentas r
   using public.proveedores_facturas_items i
   where i.id = r.factura_item_id and i.factura_id = old.id;

  -- 2.4 Los productos que nacieron de esta factura y se quedaron sin
  --     ninguna compra ni existencia ya no son catálogo, son basura.
  delete from public.proveedores_productos p
   where p.autocreado
     and p.stock = 0
     and not exists (select 1 from public.proveedores_productos_precios h where h.producto_id = p.id)
     and not exists (select 1 from public.proveedores_stock_movimientos m where m.producto_id = p.id)
     and not exists (select 1 from public.proveedores_envios_items e where e.producto_id = p.id);

  insert into public.activity_log
    (actor_user_id, actor_email, event_type, entity_type, entity_id, entity_label, metadata)
  values (
    auth.uid(),
    (select u.email from public.app_users u where u.id = auth.uid()),
    'proveedor.factura_eliminada', 'proveedores_factura', old.id::text,
    v_folio || ' · ' || coalesce(old.nombre_emisor, old.rfc_emisor),
    jsonb_build_object('total', old.total, 'moneda', old.moneda, 'uuid_fiscal', old.uuid_fiscal)
  );

  return old;
end;
$$;

drop trigger if exists trg_proveedores_limpiar_factura on public.proveedores_facturas;
create trigger trg_proveedores_limpiar_factura
  before delete on public.proveedores_facturas
  for each row execute function public.proveedores_limpiar_factura_borrada();

comment on function public.proveedores_limpiar_factura_borrada() is
  'Al borrar una factura revierte su stock, precios y rentas. Se niega si ya tiene pagos o si el material salió a obra.';

commit;

-- =====================================================================
-- Comprobación
-- =====================================================================
-- select polname,
--        case polcmd when 'r' then 'SELECT' when 'a' then 'INSERT'
--             when 'w' then 'UPDATE' when 'd' then 'DELETE' when '*' then 'ALL' end as cmd,
--        pg_get_expr(polqual, polrelid) as using_expr
--   from pg_policy where polrelid='public.proveedores_facturas'::regclass order by 2;
