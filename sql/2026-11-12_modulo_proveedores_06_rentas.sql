-- =====================================================================
-- RAFSA ERP · Proveedores — Parte 6
-- Rentas de maquinaria: identidad por máquina y datos del periodo
--
-- Corre después del 05.
--
-- EL PROBLEMA QUE ARREGLA
-- En las facturas de renta (RENTOM, PLATAFORMEX) el NoIdentificacion del
-- CFDI no es un código de producto: trae embebido el folio de remisión,
-- así que cambia en cada factura.
--
--   RENTOM      03-03-3731-5933   ← el 3731 es la remisión
--   PLATAFORMEX 01-01-2456-4695   ← el 2456 es la remisión
--
-- Como el procesado busca el producto por (proveedor, código), cada mes
-- de renta de la MISMA máquina creaba un producto nuevo en el catálogo.
--
-- LA SOLUCIÓN
-- Para una renta, la identidad estable no es el folio sino la máquina:
-- el "No. Int." del proveedor (PLS-34, RTZ-07). De paso, la descripción
-- del CFDI trae modelo, número de serie y periodo, que estaban yéndose
-- a la basura teniendo columnas donde guardarlos.
--
-- El NoIdentificacion no se pierde: pasa a proveedores_rentas.contrato,
-- que es donde tiene sentido, porque identifica ESA renta y no la máquina.
-- =====================================================================

begin;

-- =====================================================================
-- 1. Mes en español -> número
-- =====================================================================

create or replace function public.proveedores_mes_es(p_mes text)
returns integer
language sql
immutable
as $$
  select case lower(left(btrim(coalesce(p_mes, '')), 3))
    when 'ene' then 1  when 'feb' then 2  when 'mar' then 3
    when 'abr' then 4  when 'may' then 5  when 'jun' then 6
    when 'jul' then 7  when 'ago' then 8  when 'sep' then 9
    when 'set' then 9
    when 'oct' then 10 when 'nov' then 11 when 'dic' then 12
    else null
  end
$$;


-- =====================================================================
-- 2. Sacar los datos de la renta de la descripción del concepto
--
--    "Renta de PLATAFORMA ARTICULADA, Modelo: Z45/25J RT ...
--     28/SEP/2026 al 27/OCT/2026 No. Int. RTZ-07
--     N/S: Z452515A-53516 Rem. Salida: 855"
-- =====================================================================

create or replace function public.proveedores_parse_renta(p_desc text)
returns jsonb
language plpgsql
immutable
as $$
declare
  d        text := coalesce(p_desc, '');
  m        text[];
  v_tipo   text;
  v_modelo text;
  v_int    text;
  v_serie  text;
  v_rem    text;
  v_ini    date;
  v_fin    date;
  v_mi     integer;
  v_mf     integer;
begin
  -- Tipo de equipo: lo que va entre "Renta de" y ", Modelo"
  m := regexp_match(d, 'Renta\s+de\s+(.+?)\s*,\s*Modelo', 'i');
  if m is not null then
    v_tipo := btrim(m[1]);
  end if;

  -- Modelo: el primer token después de "Modelo:". Lo que sigue es la
  -- ficha técnica, que no nos sirve para identificar la máquina.
  m := regexp_match(d, 'Modelo\s*:?\s*([^\s,;]+)', 'i');
  if m is not null then
    v_modelo := btrim(m[1]);
  end if;

  -- Número interno del proveedor: PLS-34, RTZ-07
  m := regexp_match(d, 'No\.?\s*Int(?:erno)?\.?\s*:?\s*([A-Za-z0-9][A-Za-z0-9\-/]*)', 'i');
  if m is not null then
    v_int := upper(btrim(m[1]));
  end if;

  -- Número de serie
  m := regexp_match(d, 'N\s*/\s*S\s*:?\s*([A-Za-z0-9][A-Za-z0-9\-]*)', 'i');
  if m is not null then
    v_serie := btrim(m[1]);
  end if;

  -- Remisión de salida
  m := regexp_match(d, 'Rem\.?\s*(?:de\s+)?Salida\s*:?\s*([A-Za-z0-9\-]+)', 'i');
  if m is not null then
    v_rem := btrim(m[1]);
  end if;

  -- Periodo: 28/SEP/2026 al 27/OCT/2026
  m := regexp_match(
         d,
         '(\d{1,2})\s*/\s*([A-Za-zÁÉÍÓÚáéíóú]{3,12})\s*/\s*(\d{4})\s*al\s*' ||
         '(\d{1,2})\s*/\s*([A-Za-zÁÉÍÓÚáéíóú]{3,12})\s*/\s*(\d{4})',
         'i');
  if m is not null then
    v_mi := public.proveedores_mes_es(m[2]);
    v_mf := public.proveedores_mes_es(m[5]);
    if v_mi is not null and v_mf is not null then
      begin
        v_ini := make_date(m[3]::int, v_mi, m[1]::int);
        v_fin := make_date(m[6]::int, v_mf, m[4]::int);
      exception when others then
        v_ini := null; v_fin := null;   -- fecha imposible: mejor nada que basura
      end;
    end if;
  end if;

  return jsonb_build_object(
    'tipo',           v_tipo,
    'modelo',         v_modelo,
    'num_interno',    v_int,
    'num_serie',      v_serie,
    'remision',       v_rem,
    'periodo_inicio', v_ini,
    'periodo_fin',    v_fin,
    -- Inclusive: del 28/SEP al 27/OCT son los 30 días de un mes de renta.
    'dias',           case when v_ini is not null and v_fin is not null and v_fin >= v_ini
                           then (v_fin - v_ini) + 1 end
  );
end;
$$;

comment on function public.proveedores_parse_renta(text) is
  'Saca modelo, No. Int., N/S y periodo de la descripción de un concepto de renta.';


-- =====================================================================
-- 3. Procesado, ahora con rentas de verdad
-- =====================================================================

create or replace function public.proveedores_procesar_factura(p_factura_id uuid)
returns jsonb
language plpgsql
as $$
declare
  f           record;
  it          record;
  r           jsonb;
  v_producto  uuid;
  v_codigo    text;
  v_desc      text;
  v_creados   integer := 0;
  v_enlazados integer := 0;
  v_entradas  integer := 0;
  v_rentas    integer := 0;
  v_omitidos  integer := 0;
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
      update public.proveedores_facturas_items set procesado = true where id = it.id;
      v_omitidos := v_omitidos + 1;
      continue;
    end if;

    r        := null;
    v_codigo := it.no_identificacion;
    v_desc   := it.descripcion;

    if it.kind = 'rental' then
      r := public.proveedores_parse_renta(it.descripcion);

      -- La máquina, no el folio de la renta. Si no viene No. Int. nos
      -- quedamos con el modelo; y si tampoco, con la descripción, que al
      -- menos no cambia tan seguido como el NoIdentificacion.
      v_codigo := coalesce(r->>'num_interno', r->>'modelo');

      v_desc := btrim(concat_ws(' ', r->>'tipo', r->>'modelo'));
      if v_desc = '' then
        v_desc := it.descripcion;
      end if;
    end if;

    -- Buscar el producto igual que lo buscan los índices únicos.
    v_producto := null;
    if v_codigo is not null then
      select id into v_producto
        from public.proveedores_productos
       where proveedor_id = f.proveedor_id and codigo = v_codigo;
    else
      select id into v_producto
        from public.proveedores_productos
       where proveedor_id = f.proveedor_id
         and codigo is null
         and lower(descripcion) = lower(v_desc);
    end if;

    if v_producto is null then
      insert into public.proveedores_productos (
        proveedor_id, codigo, descripcion, kind,
        unidad, clave_unidad, clave_prod_serv, autocreado
      ) values (
        f.proveedor_id, v_codigo, v_desc, it.kind,
        it.unidad, it.clave_unidad, it.clave_prod_serv, true
      )
      returning id into v_producto;
      v_creados := v_creados + 1;
    else
      v_enlazados := v_enlazados + 1;
    end if;

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
        proveedor_id, factura_item_id, obra_id, descripcion,
        modelo, num_serie, num_interno, contrato,
        periodo_inicio, periodo_fin, dias, importe, status, notas
      ) values (
        f.proveedor_id, it.id, coalesce(it.obra_id, it.obra_sugerida_id), v_desc,
        r->>'modelo',
        r->>'num_serie',
        r->>'num_interno',
        -- El NoIdentificacion identifica ESTA renta, no la máquina:
        -- aquí sí es el dato correcto.
        it.no_identificacion,
        (r->>'periodo_inicio')::date,
        (r->>'periodo_fin')::date,
        (r->>'dias')::int,
        it.importe,
        case
          when (r->>'periodo_fin')::date is null then 'activa'
          when (r->>'periodo_fin')::date < current_date then 'vencida'
          else 'activa'
        end,
        case when r->>'remision' is not null
             then 'Remisión de salida ' || (r->>'remision') end
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

grant execute on function public.proveedores_mes_es(text) to authenticated;
grant execute on function public.proveedores_parse_renta(text) to authenticated;

commit;

-- =====================================================================
-- Comprobación: debe sacar los datos de las dos descripciones reales
-- =====================================================================
-- select public.proveedores_parse_renta(
--   'Renta de PLATAFORMA ARTICULADA, Modelo: Z45/25J RT Plataforma Articulada '
--   'Diesel : Altura de trabajo 15.86 mts 28/SEP/2026 al 27/OCT/2026 '
--   'No. Int. RTZ-07 N/S: Z452515A-53516 Rem. Salida: 855');
