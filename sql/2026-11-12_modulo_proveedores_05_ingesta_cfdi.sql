-- =====================================================================
-- RAFSA ERP · Proveedores — Parte 5
-- Ingesta de facturas CFDI y procesado a catálogo / precios / stock
--
-- Corre después de 01, 02, 03 y 04.
--
-- Son dos pasos a propósito, no uno:
--
--   registrar  → guarda la factura tal cual viene del XML, clasifica cada
--                renglón y sugiere obra. Nada toca el inventario todavía.
--   procesar   → ya que un humano revisó y confirmó las obras, crea o
--                enlaza los productos, registra precios, mete el stock
--                y abre las rentas.
--
-- Separarlos permite corregir una factura mal leída antes de que ensucie
-- el catálogo, y hace que reprocesar sea seguro.
-- =====================================================================

begin;

-- =====================================================================
-- 1. REGISTRAR — recibe el JSON que produce lib/cfdi.ts
-- =====================================================================

create or replace function public.proveedores_registrar_factura(
  p_cfdi              jsonb,
  p_xml_object_path   text default null,
  p_pdf_object_path   text default null,
  p_file_name         text default null,
  p_fecha_vencimiento date default null
)
returns uuid
language plpgsql
as $$
declare
  v_uuid        text := nullif(upper(trim(p_cfdi->>'uuid')), '');
  v_rfc_emisor  text := nullif(upper(trim(p_cfdi->>'rfc_emisor')), '');
  v_rfc_recep   text := nullif(upper(trim(p_cfdi->>'rfc_receptor')), '');
  v_proveedor   uuid;
  v_entidad     uuid;
  v_factura     uuid;
  v_repetida    text;
  v_fecha       timestamptz;
  v_label       text;
begin
  if v_rfc_emisor is null then
    raise exception 'El CFDI no trae RFC del emisor.';
  end if;
  if jsonb_typeof(p_cfdi->'conceptos') <> 'array'
     or jsonb_array_length(p_cfdi->'conceptos') = 0 then
    raise exception 'El CFDI no trae conceptos.';
  end if;

  -- Misma factura cargada dos veces: se detiene con un mensaje que diga
  -- cuál es, no con una violación de índice.
  if v_uuid is not null then
    select coalesce(nullif(trim(concat_ws('-', f.serie, f.folio)), ''), 'sin folio')
           || ' de ' || pr.razon_social
      into v_repetida
      from public.proveedores_facturas f
      join public.proveedores pr on pr.id = f.proveedor_id
     where f.uuid_fiscal = v_uuid;

    if v_repetida is not null then
      raise exception 'Esta factura ya está cargada: % (UUID %).', v_repetida, v_uuid
        using errcode = 'unique_violation';
    end if;
  end if;

  -- ¿A cuál de nuestras razones sociales viene dirigida?
  -- Si no es ninguna, se registra igual y queda en blanco para que se vea
  -- en la pantalla; bloquear aquí dejaría varada una empresa nueva.
  select id into v_entidad
    from public.proveedores_entidades_propias
   where rfc = v_rfc_recep and is_active
   limit 1;

  -- Alta o enlace del proveedor. Si alguien ya le corrigió el nombre a
  -- mano, no se lo pisamos con el del XML.
  insert into public.proveedores (rfc, razon_social, autocreado, created_by)
  values (
    v_rfc_emisor,
    coalesce(nullif(trim(p_cfdi->>'nombre_emisor'), ''), v_rfc_emisor),
    true,
    auth.uid()
  )
  on conflict (rfc) do update
     set razon_social = case
           when public.proveedores.autocreado
             then coalesce(nullif(trim(excluded.razon_social), ''), public.proveedores.razon_social)
           else public.proveedores.razon_social
         end,
         updated_at = now()
  returning id into v_proveedor;

  -- La Fecha del CFDI viene sin zona: es hora local de México.
  v_fecha := case
    when nullif(p_cfdi->>'fecha', '') is null then null
    else (p_cfdi->>'fecha')::timestamp at time zone 'America/Mexico_City'
  end;

  insert into public.proveedores_facturas (
    proveedor_id, entidad_propia_id, uuid_fiscal, serie, folio, fecha,
    rfc_emisor, nombre_emisor, rfc_receptor, nombre_receptor,
    moneda, tipo_cambio, tipo_comprobante, forma_pago, metodo_pago,
    condiciones_pago, uso_cfdi,
    subtotal, descuento, iva, total,
    xml_object_path, pdf_object_path, file_name,
    fecha_vencimiento, status, created_by
  ) values (
    v_proveedor, v_entidad, v_uuid,
    nullif(trim(p_cfdi->>'serie'), ''), nullif(trim(p_cfdi->>'folio'), ''), v_fecha,
    v_rfc_emisor, nullif(trim(p_cfdi->>'nombre_emisor'), ''),
    v_rfc_recep,  nullif(trim(p_cfdi->>'nombre_receptor'), ''),
    coalesce(nullif(p_cfdi->>'moneda', ''), 'MXN'),
    coalesce((p_cfdi->>'tipo_cambio')::numeric, 1),
    nullif(p_cfdi->>'tipo_comprobante', ''),
    nullif(p_cfdi->>'forma_pago', ''),
    nullif(p_cfdi->>'metodo_pago', ''),
    nullif(p_cfdi->>'condiciones_pago', ''),
    nullif(p_cfdi->>'uso_cfdi', ''),
    coalesce((p_cfdi->>'subtotal')::numeric, 0),
    coalesce((p_cfdi->>'descuento')::numeric, 0),
    coalesce((p_cfdi->>'iva')::numeric, 0),
    coalesce((p_cfdi->>'total')::numeric, 0),
    p_xml_object_path, p_pdf_object_path, p_file_name,
    p_fecha_vencimiento, 'por_revisar', auth.uid()
  )
  returning id into v_factura;

  -- Renglones. La clasificación y la sugerencia de obra las hace la base
  -- para que la regla sea una sola, entre la factura por donde entre.
  insert into public.proveedores_facturas_items (
    factura_id, line_no, no_identificacion, descripcion,
    clave_prod_serv, clave_unidad, unidad,
    cantidad, valor_unitario, importe, descuento, iva_importe, objeto_imp,
    kind, obra_sugerida_id, obra_texto
  )
  select
    v_factura,
    coalesce((c->>'line_no')::int, (ord)::int),
    nullif(trim(c->>'no_identificacion'), ''),
    coalesce(nullif(trim(c->>'descripcion'), ''), '(sin descripción)'),
    nullif(trim(c->>'clave_prod_serv'), ''),
    nullif(trim(c->>'clave_unidad'), ''),
    nullif(trim(c->>'unidad'), ''),
    coalesce((c->>'cantidad')::numeric, 0),
    coalesce((c->>'valor_unitario')::numeric, 0),
    coalesce((c->>'importe')::numeric, 0),
    coalesce((c->>'descuento')::numeric, 0),
    coalesce((c->>'iva_importe')::numeric, 0),
    nullif(c->>'objeto_imp', ''),
    public.proveedores_clasificar_concepto(
      c->>'clave_prod_serv', c->>'clave_unidad', c->>'descripcion'),
    public.proveedores_sugerir_obra(c->>'descripcion'),
    nullif(trim(c->>'descripcion'), '')
  from jsonb_array_elements(p_cfdi->'conceptos') with ordinality as t(c, ord);

  select concat_ws(' · ',
           coalesce(nullif(trim(concat_ws('-', f.serie, f.folio)), ''), 'Factura'),
           pr.razon_social)
    into v_label
    from public.proveedores_facturas f
    join public.proveedores pr on pr.id = f.proveedor_id
   where f.id = v_factura;

  insert into public.activity_log
    (actor_user_id, actor_email, event_type, entity_type, entity_id, entity_label, metadata)
  values (
    auth.uid(),
    (select u.email from public.app_users u where u.id = auth.uid()),
    'proveedor.factura_subida', 'proveedores_factura', v_factura::text, v_label,
    jsonb_build_object(
      'total',    coalesce((p_cfdi->>'total')::numeric, 0),
      'moneda',   coalesce(nullif(p_cfdi->>'moneda', ''), 'MXN'),
      'conceptos', jsonb_array_length(p_cfdi->'conceptos'),
      'vence',    p_fecha_vencimiento
    )
  );

  return v_factura;
end;
$$;

comment on function public.proveedores_registrar_factura(jsonb, text, text, text, date) is
  'Registra una factura de proveedor desde el JSON que produce lib/cfdi.ts. No toca inventario.';


-- =====================================================================
-- 2. PROCESAR — catálogo, precios, stock y rentas
--    Idempotente: solo toma los renglones que siguen sin procesar.
-- =====================================================================

create or replace function public.proveedores_procesar_factura(p_factura_id uuid)
returns jsonb
language plpgsql
as $$
declare
  f              record;
  it             record;
  v_producto     uuid;
  v_creados      integer := 0;
  v_enlazados    integer := 0;
  v_entradas     integer := 0;
  v_rentas       integer := 0;
  v_omitidos     integer := 0;
begin
  select * into f from public.proveedores_facturas where id = p_factura_id;
  if not found then
    raise exception 'La factura % no existe.', p_factura_id;
  end if;
  if f.status = 'cancelada' then
    raise exception 'La factura está cancelada: no se puede procesar.';
  end if;

  for it in
    select * from public.proveedores_facturas_items
     where factura_id = p_factura_id and not procesado
     order by line_no
  loop
    -- Comisiones, fletes y ajustes no son inventario ni gasto de obra.
    if it.kind = 'other' then
      update public.proveedores_facturas_items
         set procesado = true where id = it.id;
      v_omitidos := v_omitidos + 1;
      continue;
    end if;

    -- Buscar el producto igual que lo buscan los índices únicos:
    -- por código cuando hay, por descripción cuando no.
    v_producto := null;
    if it.no_identificacion is not null then
      select id into v_producto
        from public.proveedores_productos
       where proveedor_id = f.proveedor_id
         and codigo = it.no_identificacion;
    else
      select id into v_producto
        from public.proveedores_productos
       where proveedor_id = f.proveedor_id
         and codigo is null
         and lower(descripcion) = lower(it.descripcion);
    end if;

    if v_producto is null then
      insert into public.proveedores_productos (
        proveedor_id, codigo, descripcion, kind,
        unidad, clave_unidad, clave_prod_serv, autocreado
      ) values (
        f.proveedor_id, it.no_identificacion, it.descripcion, it.kind,
        it.unidad, it.clave_unidad, it.clave_prod_serv, true
      )
      returning id into v_producto;
      v_creados := v_creados + 1;
    else
      v_enlazados := v_enlazados + 1;
    end if;

    -- Historial de precio. Dispara el recálculo de último y promedio.
    if it.valor_unitario > 0 and it.cantidad > 0 then
      insert into public.proveedores_productos_precios (
        producto_id, factura_id, factura_item_id, fecha, valor_unitario, cantidad
      ) values (
        v_producto, f.id, it.id, coalesce(f.fecha, now()), it.valor_unitario, it.cantidad
      );
    end if;

    -- Solo lo que se compra entra al almacén. Una renta no se almacena.
    if it.kind = 'product' and it.cantidad > 0 then
      insert into public.proveedores_stock_movimientos (
        producto_id, tipo, cantidad, motivo, factura_item_id, created_by
      ) values (
        v_producto, 'entrada', it.cantidad,
        'Entrada por factura ' || coalesce(nullif(trim(concat_ws('-', f.serie, f.folio)), ''), 'sin folio'),
        it.id, auth.uid()
      );
      v_entradas := v_entradas + 1;
    end if;

    if it.kind = 'rental' then
      insert into public.proveedores_rentas (
        proveedor_id, factura_item_id, obra_id, descripcion, importe, status
      ) values (
        f.proveedor_id, it.id, coalesce(it.obra_id, it.obra_sugerida_id),
        it.descripcion, it.importe, 'activa'
      );
      v_rentas := v_rentas + 1;
    end if;

    update public.proveedores_facturas_items
       set producto_id = v_producto, procesado = true
     where id = it.id;
  end loop;

  update public.proveedores_facturas
     set status       = 'procesada',
         procesada_at = now(),
         procesada_by = auth.uid(),
         updated_at   = now()
   where id = p_factura_id;

  return jsonb_build_object(
    'factura_id',          p_factura_id,
    'productos_creados',   v_creados,
    'productos_enlazados', v_enlazados,
    'entradas_stock',      v_entradas,
    'rentas_abiertas',     v_rentas,
    'renglones_omitidos',  v_omitidos
  );
end;
$$;

comment on function public.proveedores_procesar_factura(uuid) is
  'Convierte los renglones de una factura en catálogo, precios, stock y rentas. Idempotente.';


grant execute on function public.proveedores_registrar_factura(jsonb, text, text, text, date) to authenticated;
grant execute on function public.proveedores_procesar_factura(uuid) to authenticated;


-- =====================================================================
-- 3. Ajuste a la vista de cobranza
--    Los proveedores que se crean solos desde el CFDI no traen nombre
--    comercial, así que proveedor_corto salía vacío. Que caiga al
--    razón social en lugar de dejar la columna inservible.
-- =====================================================================

create or replace view public.proveedores_facturas_pago_v as
select
  f.id,
  f.proveedor_id,
  pr.razon_social                                     as proveedor,
  coalesce(pr.nombre_comercial, pr.razon_social)      as proveedor_corto,
  f.entidad_propia_id,
  ep.nombre_corto           as entidad_propia,
  f.serie,
  f.folio,
  coalesce(nullif(trim(concat_ws('-', f.serie, f.folio)), ''), 'sin folio') as folio_completo,
  f.uuid_fiscal,
  f.fecha,
  f.moneda,
  f.total,
  f.monto_pagado,
  f.saldo,
  f.estado_pago,
  f.pagada_at,
  f.fecha_vencimiento,
  f.status,

  case when f.fecha_vencimiento is null then null
       else f.fecha_vencimiento - (timezone('America/Mexico_City', now())::date)
  end as dias_restantes,

  case
    when f.estado_pago = 'pagada'        then 'pagada'
    when f.fecha_vencimiento is null     then 'sin_fecha'
    when f.fecha_vencimiento <  timezone('America/Mexico_City', now())::date then 'vencida'
    when f.fecha_vencimiento =  timezone('America/Mexico_City', now())::date then 'vence_hoy'
    when f.fecha_vencimiento <= timezone('America/Mexico_City', now())::date + 5 then 'por_vencer'
    else 'en_tiempo'
  end as estado_vencimiento,

  (select count(*) from public.proveedores_facturas_pagos p where p.factura_id = f.id)
    as num_pagos,
  (select max(p.fecha_pago) from public.proveedores_facturas_pagos p where p.factura_id = f.id)
    as ultimo_pago_at
from public.proveedores_facturas f
join public.proveedores pr on pr.id = f.proveedor_id
left join public.proveedores_entidades_propias ep on ep.id = f.entidad_propia_id
where f.status <> 'cancelada';

-- create or replace view no conserva las opciones: hay que reponerlas,
-- o la vista vuelve a correr como su dueño y se salta el RLS.
alter view public.proveedores_facturas_pago_v set (security_invoker = on);
revoke all  on public.proveedores_facturas_pago_v from anon;
grant select on public.proveedores_facturas_pago_v to authenticated;

commit;
