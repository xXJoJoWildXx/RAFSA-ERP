-- ============================================================================
--  Los servicios también son rentas
--
--  El módulo nació con las plataformas (RENTOM, PLATAFORMEX), así que sólo
--  mandaba a Rentas lo que traía clave SAT 7214xxxx o la palabra "renta" en
--  la descripción. Una factura de baño portátil (clave 80131506, descripción
--  "DE SANITARIO PORTATIL") caía como 'service' y no aparecía en ningún lado.
--
--  Ahora todo servicio entra a Rentas. Dos señales lo identifican:
--    · La clase de la clave SAT: de 70 a 94 son servicios en el catálogo del
--      SAT (72 construcción, 76 limpieza, 78 transporte, 80 gestión, 81
--      ingeniería...). De 10 a 60 son bienes.
--    · ClaveUnidad E48 ("Unidad de servicio"), que es como la venían
--      marcando tanto las plataformas como el baño.
--
--  Los conceptos administrativos (comisión, flete, ajuste) se siguen
--  descartando ANTES, para que un flete no termine en Rentas.
--
--  Idempotente.
-- ============================================================================

begin;

-- ── 1. Clasificador ───────────────────────────────────────────────────────
create or replace function public.proveedores_clasificar_concepto(
  p_clave_prod_serv text,
  p_clave_unidad    text,
  p_descripcion     text
) returns text
language sql
immutable
as $$
  select case
    -- Conceptos administrativos: no son inventario ni gasto de obra
    when lower(coalesce(p_descripcion, '')) ~ '(comisi[oó]n|flete|env[ií]o|ajuste|redondeo|descuento|anticipo)'
      then 'other'
    -- Alquiler de maquinaria y equipo para construcción
    when coalesce(p_clave_prod_serv, '') like '7214%'
      or lower(coalesce(p_descripcion, '')) ~ '(renta|alquiler|arrendamiento)'
      then 'rental'
    -- Cualquier otro servicio: clases 70 a 94 del catálogo del SAT
    when coalesce(p_clave_prod_serv, '') ~ '^(7[0-9]|8[0-9]|9[0-4])'
      then 'rental'
    -- Unidad de servicio
    when upper(coalesce(p_clave_unidad, '')) = 'E48'
      then 'rental'
    else 'product'
  end
$$;

comment on function public.proveedores_clasificar_concepto(text, text, text) is
  'Decide si un concepto del CFDI es producto (stock), renta/servicio u otro (comisión/flete/ajuste). Todo servicio se trata como renta.';

-- ── 2. Parseo tolerante ───────────────────────────────────────────────────
-- Se agrega la bandera es_equipo. Una renta de maquinaria trae modelo, número
-- interno o serie; un servicio como "DE SANITARIO PORTATIL" no trae nada de
-- eso. Saberlo evita darle a un servicio el trato de máquina.
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
  m := regexp_match(d, 'Renta\s+de\s+(.+?)\s*,\s*Modelo', 'i');
  if m is not null then
    v_tipo := btrim(m[1]);
  end if;

  m := regexp_match(d, 'Modelo\s*:?\s*([^\s,;]+)', 'i');
  if m is not null then
    v_modelo := btrim(m[1]);
  end if;

  m := regexp_match(d, 'No\.?\s*Int(?:erno)?\.?\s*:?\s*([A-Za-z0-9][A-Za-z0-9\-/]*)', 'i');
  if m is not null then
    v_int := upper(btrim(m[1]));
  end if;

  m := regexp_match(d, 'N\s*/\s*S\s*:?\s*([A-Za-z0-9][A-Za-z0-9\-]*)', 'i');
  if m is not null then
    v_serie := btrim(m[1]);
  end if;

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
        v_ini := null; v_fin := null;
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
    'dias',           case when v_ini is not null and v_fin is not null and v_fin >= v_ini
                           then (v_fin - v_ini) + 1 end,
    -- Sin modelo, número interno ni serie no hay máquina que identificar:
    -- es un servicio, y su código estable es el NoIdentificacion del CFDI.
    'es_equipo',      (v_modelo is not null or v_int is not null or v_serie is not null)
  );
end;
$$;

comment on function public.proveedores_parse_renta(text) is
  'Saca modelo, No. Int., N/S y periodo de la descripción. es_equipo distingue una renta de maquinaria de un servicio simple.';

-- ── 3. Procesado: distinguir máquina de servicio ──────────────────────────
-- Igual que antes, salvo el tramo marcado: una renta de maquinaria se
-- identifica por su número interno o modelo, porque el NoIdentificacion del
-- CFDI cambia en cada factura de la MISMA máquina. Un servicio simple no
-- tiene esos datos, así que ahí el NoIdentificacion sí es el código estable
-- y se usa como en cualquier producto.
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

      -- ── Único cambio respecto de la versión anterior ──
      -- Sólo una máquina se identifica por número interno o modelo. Para un
      -- servicio se deja el NoIdentificacion y la descripción tal cual.
      if coalesce((r->>'es_equipo')::boolean, false) then
        v_codigo := coalesce(r->>'num_interno', r->>'modelo');

        v_desc := btrim(concat_ws(' ', r->>'tipo', r->>'modelo'));
        if v_desc = '' then
          v_desc := it.descripcion;
        end if;
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
        it.no_identificacion,
        (r->>'periodo_inicio')::date,
        (r->>'periodo_fin')::date,
        (r->>'dias')::int,
        it.importe,
        case
          when (r->>'periodo_fin')::date is null then 'activa'
          when (r->>'periodo_fin')::date < public.hoy_cdmx() then 'vencida'
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

-- ── 4. Reclasificar lo que ya estaba guardado como servicio ───────────────
update public.proveedores_facturas_items
   set kind = 'rental'
 where kind = 'service';

update public.proveedores_productos
   set kind = 'rental'
 where kind = 'service';

-- ── 5. Abrir las rentas que faltaron ──────────────────────────────────────
-- Servicios de facturas YA PROCESADAS que nunca generaron su renglón en
-- Rentas, como el baño portátil. Se arman con lo que la descripción dé: si
-- no trae periodo, la renta queda activa y se cierra a mano.
insert into public.proveedores_rentas (
  proveedor_id, factura_item_id, obra_id, descripcion,
  modelo, num_serie, num_interno, contrato,
  periodo_inicio, periodo_fin, dias, importe, status, notas
)
select
  f.proveedor_id,
  it.id,
  coalesce(it.obra_id, it.obra_sugerida_id),
  case
    when btrim(concat_ws(' ', r.d->>'tipo', r.d->>'modelo')) <> ''
      then btrim(concat_ws(' ', r.d->>'tipo', r.d->>'modelo'))
    else it.descripcion
  end,
  r.d->>'modelo',
  r.d->>'num_serie',
  r.d->>'num_interno',
  it.no_identificacion,
  (r.d->>'periodo_inicio')::date,
  (r.d->>'periodo_fin')::date,
  (r.d->>'dias')::int,
  it.importe,
  case
    when (r.d->>'periodo_fin')::date is null then 'activa'
    when (r.d->>'periodo_fin')::date < public.hoy_cdmx() then 'vencida'
    else 'activa'
  end,
  case when r.d->>'remision' is not null
       then 'Remisión de salida ' || (r.d->>'remision') end
  from public.proveedores_facturas_items it
  join public.proveedores_facturas f on f.id = it.factura_id
 cross join lateral (
   select public.proveedores_parse_renta(it.descripcion) as d
 ) r
 where it.kind = 'rental'
   and it.procesado = true
   and f.status = 'procesada'
   and not exists (
     select 1 from public.proveedores_rentas pr
      where pr.factura_item_id = it.id
   );

commit;

-- ── Revisión manual (no cambia nada) ──────────────────────────────────────
-- Conceptos que siguen guardados como producto pero que el clasificador
-- nuevo llamaría servicio. No se mueven solos porque pueden tener entradas
-- de almacén; si alguno es realmente un servicio, dímelo y lo pasamos.
-- select pr.razon_social, f.serie, f.folio, it.descripcion,
--        it.clave_prod_serv, it.clave_unidad, it.importe
--   from public.proveedores_facturas_items it
--   join public.proveedores_facturas f on f.id = it.factura_id
--   join public.proveedores pr         on pr.id = f.proveedor_id
--  where it.kind = 'product'
--    and public.proveedores_clasificar_concepto(
--          it.clave_prod_serv, it.clave_unidad, it.descripcion) = 'rental'
--  order by f.fecha desc;

-- ── Comprobación ──────────────────────────────────────────────────────────
-- Debe aparecer el baño portátil:
-- select pr.razon_social, r.descripcion, r.importe, r.status, r.periodo_fin
--   from public.proveedores_rentas r
--   join public.proveedores pr on pr.id = r.proveedor_id
--  order by r.created_at desc limit 10;
