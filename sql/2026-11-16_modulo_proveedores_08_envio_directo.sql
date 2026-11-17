-- =====================================================================
-- RAFSA ERP · Proveedores — Parte 8
-- Envío directo a obra, en una sola operación
--
-- Corre después del 07.
--
-- POR QUÉ
-- Los envíos ya no se arman como borrador: se capturan completos en un
-- popup y salen de una vez. Si el front hiciera eso en tres pasos
-- (crear envío → insertar renglones → confirmar) y el stock no alcanzara
-- en el tercero, quedaría un envío huérfano en la base que nadie pidió.
--
-- Esta función hace los tres pasos en una transacción: o sale completo,
-- o no queda rastro.
-- =====================================================================

begin;

create or replace function public.proveedores_crear_y_enviar(
  p_obra_id uuid,
  p_items   jsonb,
  p_notas   text default null
)
returns text
language plpgsql
as $$
declare
  v_envio uuid;
  v_folio text;
  v_n     integer;
begin
  if p_obra_id is null then
    raise exception 'Elige la obra a la que va el material.';
  end if;
  if not exists (select 1 from public.obras where id = p_obra_id) then
    raise exception 'La obra no existe.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Agrega al menos un producto al envío.';
  end if;

  insert into public.proveedores_envios (obra_id, notas, created_by)
  values (p_obra_id, nullif(btrim(coalesce(p_notas, '')), ''), auth.uid())
  returning id into v_envio;

  -- Si el mismo producto viene dos veces, se suman las cantidades en vez
  -- de crear dos renglones del mismo artículo.
  insert into public.proveedores_envios_items (envio_id, producto_id, cantidad, costo_unitario)
  select v_envio,
         (i->>'producto_id')::uuid,
         sum((i->>'cantidad')::numeric),
         0                                 -- el costo lo congela confirmar_envio
    from jsonb_array_elements(p_items) as i
   where coalesce((i->>'cantidad')::numeric, 0) > 0
   group by (i->>'producto_id')::uuid;

  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'Ningún renglón traía cantidad mayor a cero.';
  end if;

  -- Valida stock, congela costos, descuenta inventario y deja la actividad.
  -- Si algo falla aquí, toda la transacción se revierte y el envío no existe.
  v_folio := public.proveedores_confirmar_envio(v_envio);

  return v_folio;
end;
$$;

comment on function public.proveedores_crear_y_enviar(uuid, jsonb, text) is
  'Crea un envío a obra y lo manda en un solo paso. Todo o nada.';

grant execute on function public.proveedores_crear_y_enviar(uuid, jsonb, text) to authenticated;

commit;

-- =====================================================================
-- Comprobación
-- =====================================================================
-- select public.proveedores_crear_y_enviar(
--   '<obra_id>',
--   '[{"producto_id":"<id>","cantidad":10}]'::jsonb,
--   'Lo lleva Martín');
