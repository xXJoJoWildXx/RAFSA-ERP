-- ============================================================================
-- MÓDULO DE PROVEEDORES  ·  2/2: lógica, triggers, vistas y permisos
-- Correr DESPUÉS de 2026-11-11_modulo_proveedores_01_tablas.sql
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 0) Utilidades
-- ─────────────────────────────────────────────────────────────────────────
-- Quitar acentos sin depender de la extensión unaccent, que puede no estar
create or replace function public.unaccent_simple(p text)
returns text
language sql
immutable
as $$
  select translate(coalesce(p, ''),
                   'áéíóúÁÉÍÓÚàèìòùÀÈÌÒÙäëïöüÄËÏÖÜñÑ',
                   'aeiouAEIOUaeiouAEIOUaeiouAEIOUnN')
$$;

-- El rol del usuario autenticado, usado por las políticas RLS de abajo.
-- Se recrea aquí para que este script no dependa del orden en que se corran
-- los demás; es idéntica y repetible.
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

grant execute on function public.current_app_role() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Clasificar un concepto del CFDI
-- ─────────────────────────────────────────────────────────────────────────
-- Vive en la base y no sólo en el front para que la pantalla, un reproceso
-- o una carga masiva clasifiquen EXACTAMENTE igual.
--
-- Las señales, en orden de confianza:
--   · clave_prod_serv 7214xxxx  → alquiler de maquinaria = renta
--   · clave_unidad E48 ("Unidad de servicio") → servicio
--   · descripción con comisión/flete/ajuste/redondeo → ni stock ni obra
--   · lo demás → producto
--
-- OJO: clave_prod_serv '01010101' NO implica servicio. Presidium la usa para
-- productos reales (candados, calzado). Por eso no se usa como señal.
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
    -- Unidad de servicio
    when upper(coalesce(p_clave_unidad, '')) = 'E48'
      then 'service'
    else 'product'
  end
$$;

comment on function public.proveedores_clasificar_concepto(text, text, text) is
  'Decide si un concepto del CFDI es producto (stock), renta, servicio u otro (comisión/flete/ajuste).';

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Sugerir la obra a partir del texto de la factura
-- ─────────────────────────────────────────────────────────────────────────
-- Las rentas traen la obra escrita en la descripción ("Obra: CEDIS LIVERPOOL",
-- "UBICACIÓN: 4 PIT 5 HINES"). Esto PROPONE una obra; la confirma una persona.
-- Nunca asigna sola: un nombre parecido cargaría el gasto a la obra equivocada.
create or replace function public.proveedores_sugerir_obra(p_texto text)
returns uuid
language plpgsql
stable
as $$
declare
  v_texto text := upper(unaccent_simple(coalesce(p_texto, '')));
  v_obra  uuid;
begin
  if length(v_texto) < 4 then
    return null;
  end if;

  -- Coincidencia por nombre de obra contenido en el texto, el más largo
  -- primero: "PIT 5 HINES" debe ganarle a "PIT".
  select o.id into v_obra
    from public.obras o
   where length(o.name) >= 4
     and v_texto like '%' || upper(unaccent_simple(o.name)) || '%'
   order by length(o.name) desc
   limit 1;

  if v_obra is not null then
    return v_obra;
  end if;

  -- Segundo intento: por código de obra
  select o.id into v_obra
    from public.obras o
   where o.code is not null
     and length(o.code) >= 4
     and v_texto like '%' || upper(o.code) || '%'
   limit 1;

  return v_obra;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) El stock se DERIVA del libro de movimientos
-- ─────────────────────────────────────────────────────────────────────────
-- Se recalcula sumando, no incrementando. Un incremento se desalinea en
-- cuanto una pantalla olvida aplicarlo o se borra un movimiento; una suma
-- siempre refleja lo que hay.
create or replace function public.proveedores_recalcular_stock()
returns trigger
language plpgsql
as $$
declare
  v_producto uuid := coalesce(new.producto_id, old.producto_id);
begin
  update public.proveedores_productos p
     set stock = coalesce((
           select sum(m.cantidad)
             from public.proveedores_stock_movimientos m
            where m.producto_id = v_producto
         ), 0),
         updated_at = now()
   where p.id = v_producto;
  return null;
end;
$$;

drop trigger if exists trg_proveedores_recalcular_stock on public.proveedores_stock_movimientos;
create trigger trg_proveedores_recalcular_stock
  after insert or update or delete on public.proveedores_stock_movimientos
  for each row execute function public.proveedores_recalcular_stock();

-- No se puede sacar más de lo que hay. Los ajustes sí pueden dejarlo en
-- negativo: sirven precisamente para corregir un conteo equivocado.
create or replace function public.proveedores_validar_salida()
returns trigger
language plpgsql
as $$
declare
  v_disponible numeric;
  v_nombre text;
begin
  if new.tipo <> 'salida' then
    return new;
  end if;

  select p.stock, p.descripcion into v_disponible, v_nombre
    from public.proveedores_productos p
   where p.id = new.producto_id;

  if coalesce(v_disponible, 0) + new.cantidad < -0.0001 then
    raise exception
      'Stock insuficiente de "%": hay % y se intentan sacar %.',
      v_nombre, coalesce(v_disponible, 0), abs(new.cantidad)
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_proveedores_validar_salida on public.proveedores_stock_movimientos;
create trigger trg_proveedores_validar_salida
  before insert on public.proveedores_stock_movimientos
  for each row execute function public.proveedores_validar_salida();

-- ─────────────────────────────────────────────────────────────────────────
-- 4) Precio del producto, derivado de sus compras
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.proveedores_recalcular_precio()
returns trigger
language plpgsql
as $$
declare
  v_producto uuid := coalesce(new.producto_id, old.producto_id);
begin
  update public.proveedores_productos p
     set last_price = sub.ultimo,
         last_purchase_at = sub.fecha,
         avg_price = sub.promedio,
         updated_at = now()
    from (
      select
        (select h.valor_unitario from public.proveedores_productos_precios h
          where h.producto_id = v_producto order by h.fecha desc limit 1) as ultimo,
        (select h.fecha from public.proveedores_productos_precios h
          where h.producto_id = v_producto order by h.fecha desc limit 1) as fecha,
        -- Promedio PONDERADO por cantidad: comprar 300 piezas a $165 pesa
        -- más que comprar 1 a $500.
        (select case when sum(h.cantidad) > 0
                     then round(sum(h.valor_unitario * h.cantidad) / sum(h.cantidad), 4)
                     else avg(h.valor_unitario) end
           from public.proveedores_productos_precios h
          where h.producto_id = v_producto) as promedio
    ) sub
   where p.id = v_producto;
  return null;
end;
$$;

drop trigger if exists trg_proveedores_recalcular_precio on public.proveedores_productos_precios;
create trigger trg_proveedores_recalcular_precio
  after insert or update or delete on public.proveedores_productos_precios
  for each row execute function public.proveedores_recalcular_precio();

-- ─────────────────────────────────────────────────────────────────────────
-- 5) Folio de envío a obra (EN-2026-0001)
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.proveedores_siguiente_folio_envio()
returns text
language plpgsql
as $$
declare
  v_anio text := to_char(current_date, 'YYYY');
  v_num  integer;
begin
  select coalesce(max((regexp_replace(folio, '^EN-\d{4}-', ''))::integer), 0) + 1
    into v_num
    from public.proveedores_envios
   where folio like 'EN-' || v_anio || '-%';

  return 'EN-' || v_anio || '-' || lpad(v_num::text, 4, '0');
end;
$$;

create or replace function public.proveedores_set_folio_envio()
returns trigger
language plpgsql
as $$
begin
  if new.folio is null then
    new.folio := public.proveedores_siguiente_folio_envio();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_proveedores_set_folio_envio on public.proveedores_envios;
create trigger trg_proveedores_set_folio_envio
  before insert on public.proveedores_envios
  for each row execute function public.proveedores_set_folio_envio();

-- ─────────────────────────────────────────────────────────────────────────
-- 6) Enviar un envío: descuenta stock y congela el costo
-- ─────────────────────────────────────────────────────────────────────────
-- En una sola transacción: o se descuenta todo o no se descuenta nada. Si un
-- renglón no tiene stock, el envío completo se rechaza.
create or replace function public.proveedores_confirmar_envio(p_envio_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_envio public.proveedores_envios%rowtype;
  r record;
begin
  select * into v_envio from public.proveedores_envios where id = p_envio_id for update;
  if not found then
    raise exception 'El envío no existe.';
  end if;
  if v_envio.status <> 'borrador' then
    raise exception 'Sólo se puede enviar un envío en borrador (está en "%").', v_envio.status;
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

  update public.proveedores_envios
     set status = 'enviado',
         enviado_at = now(),
         updated_at = now()
   where id = p_envio_id;
end;
$$;

comment on function public.proveedores_confirmar_envio(uuid) is
  'Pasa un envío de borrador a enviado: congela costos y descuenta stock. Todo o nada.';

-- ─────────────────────────────────────────────────────────────────────────
-- 7) Egreso por obra: para qué existe todo esto
-- ─────────────────────────────────────────────────────────────────────────
-- Junta las dos formas en que una obra gasta con proveedores:
--   · material que se le envió (envíos confirmados)
--   · rentas y servicios cargados directo a ella
create or replace view public.proveedores_egresos_por_obra as
  select
    e.obra_id,
    o.name              as obra,
    'material'::text    as concepto_tipo,
    pr.id               as proveedor_id,
    pr.razon_social     as proveedor,
    e.fecha             as fecha,
    e.folio             as referencia,
    p.descripcion       as descripcion,
    i.cantidad          as cantidad,
    i.costo_unitario    as costo_unitario,
    i.importe           as importe
  from public.proveedores_envios_items i
  join public.proveedores_envios e      on e.id = i.envio_id
  join public.proveedores_productos p   on p.id = i.producto_id
  join public.proveedores pr            on pr.id = p.proveedor_id
  join public.obras o                   on o.id = e.obra_id
 where e.status = 'enviado'

union all

  select
    it.obra_id,
    o.name,
    case when it.kind = 'rental' then 'renta' else 'servicio' end,
    pr.id,
    pr.razon_social,
    f.fecha::date,
    coalesce(f.serie, '') || coalesce(f.folio, ''),
    it.descripcion,
    it.cantidad,
    it.valor_unitario,
    it.importe
  from public.proveedores_facturas_items it
  join public.proveedores_facturas f on f.id = it.factura_id
  join public.proveedores pr         on pr.id = f.proveedor_id
  join public.obras o                on o.id = it.obra_id
 where it.kind in ('rental', 'service')
   and it.obra_id is not null
   and f.status = 'procesada';

comment on view public.proveedores_egresos_por_obra is
  'Gasto con proveedores por obra: material enviado + rentas y servicios cargados directo.';

-- La vista debe correr con los permisos de QUIEN consulta, no del dueño.
-- Sin esto se salta el RLS de las tablas de abajo, y el grant automático
-- de Supabase la deja legible hasta para anon (sin iniciar sesión).
alter view public.proveedores_egresos_por_obra set (security_invoker = on);
revoke all  on public.proveedores_egresos_por_obra from anon;
grant select on public.proveedores_egresos_por_obra to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 8) Permisos (RLS)
-- ─────────────────────────────────────────────────────────────────────────
-- Leen todos los autenticados; escriben oficina (admin, user) y almacén.
do $$
declare t text;
begin
  foreach t in array array[
    'proveedores_entidades_propias', 'proveedores', 'proveedores_facturas',
    'proveedores_facturas_items', 'proveedores_productos',
    'proveedores_productos_precios', 'proveedores_envios',
    'proveedores_envios_items', 'proveedores_stock_movimientos',
    'proveedores_rentas'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format($f$
      create policy %I on public.%I for select to authenticated using (true)
    $f$, t || '_select', t);
    execute format($f$
      create policy %I on public.%I for all to authenticated
        using (public.current_app_role() in ('admin','user','almacen'))
        with check (public.current_app_role() in ('admin','user','almacen'))
    $f$, t || '_write', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- Comprobación
-- ─────────────────────────────────────────────────────────────────────────
select c.relname as tabla,
       c.relrowsecurity as rls,
       (select count(*) from pg_policies p
         where p.schemaname='public' and p.tablename=c.relname) as politicas
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname like 'proveedores%' and c.relkind='r'
 order by c.relname;

-- Cómo clasifica los conceptos de tus facturas de ejemplo
select descripcion, clave, unidad,
       public.proveedores_clasificar_concepto(clave, unidad, descripcion) as tipo
  from (values
    ('KEM-TONE DEEP MATE BAJO VOC.-.PANTONE 2995C', '31211502', 'H87'),
    ('CILINDRO/CAMISA 390/395PC',                   '31211900', 'H87'),
    ('COMISION',                                    '81141601', 'E48'),
    ('DYMONIC 100 SALCHICHA (600ML)',               '31201600', 'H87'),
    ('AJUSTE',                                      '01010101', 'E48'),
    ('CANDADO DE HIERRO 50mm GANCHO LARGO',         '01010101', 'H87'),
    ('Renta de PLATAFORMA ARTICULADA Z45/25J',      '72141701', 'E48'),
    ('RENTA DE PLATAFORMA ARTICULADA ZA14J',        '72141700', 'E48')
  ) as t(descripcion, clave, unidad);
