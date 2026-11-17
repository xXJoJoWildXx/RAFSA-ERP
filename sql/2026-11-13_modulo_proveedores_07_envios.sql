-- =====================================================================
-- RAFSA ERP · Proveedores — Parte 7
-- Envíos a obra: folio automático y confirmación más estricta
--
-- Corre después del 06.
--
-- QUÉ ARREGLA
--
--   1. Dejaba confirmar un envío SIN RENGLONES: el loop no hacía nada y
--      el envío pasaba a "enviado" sin mover una sola pieza, apareciendo
--      en la vista de egresos con importe cero.
--   2. No registraba quién lo envió (enviado_by se quedaba en null).
--   3. No dejaba rastro en el panel de actividades.
--
-- SOBRE EL FOLIO
-- El folio YA lo asigna el trigger trg_proveedores_set_folio_envio al
-- insertar el borrador (archivo 02), así que aquí solo se conserva. Eso
-- significa que un borrador tiene folio desde que nace, lo cual es
-- deseable — el almacenista necesita el folio para anotarlo en la lista
-- de surtido antes de que salga el material — con dos consecuencias que
-- conviene tener presentes:
--
--   · Un borrador que se cancela o se borra deja un hueco en la serie.
--     No es un problema contable: la serie EN-YYYY-NNNN es interna, no
--     fiscal.
--   · Dos borradores creados en el mismo instante pueden chocar, porque
--     el folio se calcula como max+1. El índice único lo detiene y al
--     segundo le toca reintentar.
-- =====================================================================

begin;

-- El tipo de retorno cambia (void -> text), así que hay que soltarla antes.
drop function if exists public.proveedores_confirmar_envio(uuid);

create or replace function public.proveedores_confirmar_envio(p_envio_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_envio   public.proveedores_envios%rowtype;
  v_items   integer;
  v_folio   text;
  r         record;
begin
  select * into v_envio from public.proveedores_envios where id = p_envio_id for update;
  if not found then
    raise exception 'El envío no existe.';
  end if;
  if v_envio.status <> 'borrador' then
    raise exception 'Sólo se puede enviar un envío en borrador (está en "%").', v_envio.status;
  end if;

  select count(*) into v_items
    from public.proveedores_envios_items where envio_id = p_envio_id;
  if v_items = 0 then
    raise exception 'El envío no tiene renglones: agrega material antes de enviarlo.';
  end if;

  for r in
    select i.*, p.last_price
      from public.proveedores_envios_items i
      join public.proveedores_productos p on p.id = i.producto_id
     where i.envio_id = p_envio_id
  loop
    -- Congelar el costo si no se capturó a mano
    if coalesce(r.costo_unitario, 0) = 0 then
      update public.proveedores_envios_items
         set costo_unitario = coalesce(r.last_price, 0),
             importe = round(coalesce(r.last_price, 0) * r.cantidad, 2)
       where id = r.id;
    else
      update public.proveedores_envios_items
         set importe = round(r.costo_unitario * r.cantidad, 2)
       where id = r.id;
    end if;

    -- Salida de stock (negativa). El trigger de validación frena si no alcanza.
    insert into public.proveedores_stock_movimientos
      (producto_id, tipo, cantidad, motivo, envio_item_id, obra_id)
    values
      (r.producto_id, 'salida', -r.cantidad, 'Envío a obra', r.id, v_envio.obra_id);
  end loop;

  -- Normalmente ya viene del trigger; el coalesce cubre una fila que se
  -- hubiera insertado sin él.
  v_folio := coalesce(v_envio.folio, public.proveedores_siguiente_folio_envio());

  update public.proveedores_envios
     set folio      = v_folio,
         status     = 'enviado',
         enviado_at = now(),
         enviado_by = auth.uid(),
         updated_at = now()
   where id = p_envio_id;

  insert into public.activity_log
    (actor_user_id, actor_email, event_type, entity_type, entity_id, entity_label, metadata)
  select
    auth.uid(),
    (select u.email from public.app_users u where u.id = auth.uid()),
    'proveedor.envio_confirmado',
    'proveedores_envio',
    p_envio_id::text,
    v_folio || ' · ' || o.name,
    jsonb_build_object(
      'obra',      o.name,
      'renglones', v_items,
      'importe',   (select coalesce(sum(i.importe), 0)
                      from public.proveedores_envios_items i
                     where i.envio_id = p_envio_id)
    )
    from public.obras o
   where o.id = v_envio.obra_id;

  return v_folio;
end;
$$;

comment on function public.proveedores_confirmar_envio(uuid) is
  'Pasa un envío de borrador a enviado: asigna folio, congela costos y descuenta stock. Todo o nada.';

grant execute on function public.proveedores_confirmar_envio(uuid) to authenticated;
grant execute on function public.proveedores_siguiente_folio_envio() to authenticated;

commit;

-- =====================================================================
-- Comprobación
-- =====================================================================
-- select public.proveedores_siguiente_folio_envio();   -- EN-2026-0001
