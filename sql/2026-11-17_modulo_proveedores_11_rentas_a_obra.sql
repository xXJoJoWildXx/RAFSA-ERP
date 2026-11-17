-- =====================================================================
-- RAFSA ERP · Proveedores — Parte 11
-- Las rentas se asignan a obra como artículos, no al revisar la factura
--
-- Corre después del 10.
--
-- EL CAMBIO
-- Hasta ahora la obra de una renta se capturaba en el renglón de la
-- factura, al revisarla. Eso obligaba a saber a qué obra iba la máquina
-- en el momento de dar de alta la factura, que casi nunca es cuando se
-- decide. Ahora la renta se asigna después, desde su propia tarjeta, con
-- el rango de fechas que la máquina estará en esa obra.
--
-- Son dos fechas distintas y conviene no confundirlas:
--   · periodo_inicio / periodo_fin → lo que FACTURÓ el proveedor
--   · en_obra_desde / en_obra_hasta → cuándo está la máquina EN LA OBRA
--
-- Al pasar en_obra_hasta, un job diario la marca como devuelta.
-- =====================================================================

begin;

-- =====================================================================
-- 1. Columnas de la asignación
-- =====================================================================

alter table public.proveedores_rentas
  add column if not exists en_obra_desde     date,
  add column if not exists en_obra_hasta     date,
  add column if not exists obra_notas        text,
  add column if not exists obra_asignada_at  timestamptz,
  add column if not exists obra_asignada_by  uuid references public.app_users (id);

comment on column public.proveedores_rentas.en_obra_desde is
  'Cuándo llega la máquina a la obra. Distinto del periodo que facturó el proveedor.';
comment on column public.proveedores_rentas.en_obra_hasta is
  'Cuándo se va de la obra. Al pasar esta fecha el job la marca como devuelta.';

create index if not exists idx_prov_rentas_en_obra
  on public.proveedores_rentas (en_obra_hasta)
  where en_obra_hasta is not null and status in ('activa', 'vencida');


-- =====================================================================
-- 2. Asignar una renta a una obra
-- =====================================================================

create or replace function public.proveedores_asignar_renta_obra(
  p_renta_id uuid,
  p_obra_id  uuid,
  p_desde    date,
  p_hasta    date,
  p_notas    text default null
)
returns jsonb
language plpgsql
as $$
declare
  r       record;
  v_obra  text;
  v_hoy   date := timezone('America/Mexico_City', now())::date;
  v_estado text;
begin
  select * into r from public.proveedores_rentas where id = p_renta_id;
  if not found then
    raise exception 'La renta no existe.';
  end if;
  if r.status = 'cancelada' then
    raise exception 'Esta renta está cancelada.';
  end if;

  select o.name into v_obra from public.obras o where o.id = p_obra_id;
  if v_obra is null then
    raise exception 'La obra no existe.';
  end if;

  if p_desde is null or p_hasta is null then
    raise exception 'Indica desde y hasta cuándo estará la máquina en la obra.';
  end if;
  if p_hasta < p_desde then
    raise exception 'La fecha de salida no puede ser anterior a la de llegada.';
  end if;

  -- Si el rango ya pasó, la máquina no está en esa obra: nace devuelta.
  -- Y reasignar una devuelta la revive, que es lo que pasa cuando una
  -- plataforma se mueve de una obra a otra.
  v_estado := case when p_hasta < v_hoy then 'devuelta' else 'activa' end;

  update public.proveedores_rentas
     set obra_id          = p_obra_id,
         en_obra_desde    = p_desde,
         en_obra_hasta    = p_hasta,
         obra_notas       = nullif(btrim(coalesce(p_notas, '')), ''),
         obra_asignada_at = now(),
         obra_asignada_by = auth.uid(),
         status           = v_estado,
         updated_at       = now()
   where id = p_renta_id;

  insert into public.activity_log
    (actor_user_id, actor_email, event_type, entity_type, entity_id, entity_label, metadata)
  values (
    auth.uid(),
    (select u.email from public.app_users u where u.id = auth.uid()),
    'proveedor.renta_asignada', 'proveedores_renta', p_renta_id::text,
    coalesce(r.num_interno, r.modelo, r.descripcion) || ' · ' || v_obra,
    jsonb_build_object(
      'obra', v_obra, 'desde', p_desde, 'hasta', p_hasta,
      'dias', (p_hasta - p_desde) + 1, 'importe', r.importe
    )
  );

  return jsonb_build_object(
    'renta_id', p_renta_id, 'obra', v_obra,
    'dias', (p_hasta - p_desde) + 1, 'status', v_estado
  );
end;
$$;

comment on function public.proveedores_asignar_renta_obra(uuid, uuid, date, date, text) is
  'Asigna una máquina rentada a una obra por un rango de fechas.';


-- =====================================================================
-- 3. Cierre automático al pasar la fecha
-- =====================================================================

create or replace function public.proveedores_cerrar_rentas_vencidas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoy     date := timezone('America/Mexico_City', now())::date;
  v_cerradas integer := 0;
  r         record;
begin
  for r in
    select re.id, re.num_interno, re.modelo, re.descripcion, re.importe,
           re.en_obra_hasta, o.name as obra
      from public.proveedores_rentas re
      left join public.obras o on o.id = re.obra_id
     where re.status in ('activa', 'vencida')
       and re.en_obra_hasta is not null
       and re.en_obra_hasta < v_hoy
  loop
    update public.proveedores_rentas
       set status = 'devuelta', updated_at = now()
     where id = r.id;

    insert into public.activity_log
      (actor_user_id, actor_email, event_type, entity_type, entity_id, entity_label, metadata)
    values (
      null, null,                     -- la genera el job, no una persona
      'proveedor.renta_devuelta', 'proveedores_renta', r.id::text,
      coalesce(r.num_interno, r.modelo, r.descripcion) || ' · ' || coalesce(r.obra, 'sin obra'),
      jsonb_build_object('obra', r.obra, 'hasta', r.en_obra_hasta,
                         'importe', r.importe, 'automatica', true)
    );

    v_cerradas := v_cerradas + 1;
  end loop;

  return v_cerradas;
end;
$$;

comment on function public.proveedores_cerrar_rentas_vencidas() is
  'Marca como devueltas las rentas cuyo periodo en obra ya terminó. Idempotente.';

-- Mismo horario que los recordatorios: 12:00 PM de Ciudad de México.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'proveedores_cerrar_rentas',
      '0 18 * * *',
      $cron$select public.proveedores_cerrar_rentas_vencidas();$cron$
    );
  else
    raise notice 'pg_cron no está instalado: el cierre automático no se programó.';
  end if;
end $$;


-- =====================================================================
-- 4. La vista de egresos: la renta ahora sabe su obra por sí misma
-- =====================================================================

-- Se recrea en vez de reemplazarse: create or replace no puede cambiar
-- el tipo de una columna, y la rama de rentas trae otra escala.
-- Los tipos van explícitos para que no se muevan solos si una rama cambia.
drop view if exists public.proveedores_egresos_por_obra;

create view public.proveedores_egresos_por_obra as
  -- Material enviado a obra
  select
    e.obra_id,
    o.name              as obra,
    'material'::text    as concepto_tipo,
    pr.id               as proveedor_id,
    pr.razon_social     as proveedor,
    e.fecha             as fecha,
    e.folio             as referencia,
    p.descripcion       as descripcion,
    i.cantidad::numeric(14,3)       as cantidad,
    i.costo_unitario::numeric(14,4) as costo_unitario,
    i.importe::numeric(14,2)        as importe
  from public.proveedores_envios_items i
  join public.proveedores_envios e      on e.id = i.envio_id
  join public.proveedores_productos p   on p.id = i.producto_id
  join public.proveedores pr            on pr.id = p.proveedor_id
  join public.obras o                   on o.id = e.obra_id
 where e.status = 'enviado'

union all

  -- Rentas asignadas a obra. La obra sale de la renta, no del renglón
  -- de la factura: una máquina se asigna después de facturarse, y puede
  -- cambiar de obra sin que la factura cambie.
  select
    re.obra_id,
    o.name,
    'renta'::text,
    pr.id,
    pr.razon_social,
    coalesce(re.en_obra_desde, re.periodo_inicio, f.fecha::date),
    coalesce(nullif(trim(concat_ws('-', f.serie, f.folio)), ''), re.contrato),
    re.descripcion,
    1::numeric(14,3),
    re.importe::numeric(14,4),
    re.importe::numeric(14,2)
  from public.proveedores_rentas re
  join public.proveedores pr on pr.id = re.proveedor_id
  join public.obras o        on o.id = re.obra_id
  left join public.proveedores_facturas_items it on it.id = re.factura_item_id
  left join public.proveedores_facturas f        on f.id = it.factura_id
 where re.obra_id is not null
   and re.status <> 'cancelada'

union all

  -- Servicios: ésos sí se siguen cargando desde el renglón de la factura
  select
    it.obra_id,
    o.name,
    'servicio'::text,
    pr.id,
    pr.razon_social,
    f.fecha::date,
    coalesce(f.serie, '') || coalesce(f.folio, ''),
    it.descripcion,
    it.cantidad::numeric(14,3),
    it.valor_unitario::numeric(14,4),
    it.importe::numeric(14,2)
  from public.proveedores_facturas_items it
  join public.proveedores_facturas f on f.id = it.factura_id
  join public.proveedores pr         on pr.id = f.proveedor_id
  join public.obras o                on o.id = it.obra_id
 where it.kind = 'service'
   and it.obra_id is not null
   and f.status = 'procesada';

comment on view public.proveedores_egresos_por_obra is
  'Gasto con proveedores por obra: material enviado, rentas asignadas y servicios.';

-- create or replace view no conserva las opciones de seguridad.
alter view public.proveedores_egresos_por_obra set (security_invoker = on);
revoke all  on public.proveedores_egresos_por_obra from anon;
grant select on public.proveedores_egresos_por_obra to authenticated;

grant execute on function public.proveedores_asignar_renta_obra(uuid, uuid, date, date, text) to authenticated;
grant execute on function public.proveedores_cerrar_rentas_vencidas() to authenticated;

commit;

-- =====================================================================
-- Comprobación
-- =====================================================================
-- select jobname, schedule from cron.job where jobname like 'proveedores%';
-- select public.proveedores_cerrar_rentas_vencidas();
