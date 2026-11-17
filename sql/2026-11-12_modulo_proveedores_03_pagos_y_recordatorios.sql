-- =====================================================================
-- RAFSA ERP · Módulo Proveedores — Parte 3
-- Pago de facturas, comprobantes y recordatorios automáticos
--
-- Requiere haber corrido antes:
--   2026-11-11_modulo_proveedores_01_tablas.sql
--   2026-11-11_modulo_proveedores_02_logica.sql
--
-- Qué agrega:
--   1. Fecha de vencimiento + saldo + estado de pago en la factura
--   2. Tabla de pagos aplicados, con comprobante adjunto
--   3. Recálculo automático de lo pagado (derivado, nunca incrementado)
--   4. Recordatorios: 5 días antes, el día que vence, y diario si ya venció
--   5. Job de pg_cron todos los días a las 12:00 PM (hora Ciudad de México)
--   6. Bucket de Storage para XML, PDF y comprobantes
-- =====================================================================

begin;

-- =====================================================================
-- 1. FACTURA: vencimiento, saldo y estado de pago
-- =====================================================================

alter table public.proveedores_facturas
  add column if not exists fecha_vencimiento date,
  add column if not exists monto_pagado      numeric(14,2) not null default 0,
  add column if not exists estado_pago       text          not null default 'pendiente',
  add column if not exists pagada_at         timestamptz;

-- 'vencida' NO se guarda: se deriva de la fecha. Guardarla obligaría a
-- un job que vaya volteando filas y a que el estado dependa de que ese
-- job haya corrido. La vista de abajo la calcula al momento de leer.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'proveedores_facturas_estado_pago_check'
  ) then
    alter table public.proveedores_facturas
      add constraint proveedores_facturas_estado_pago_check
      check (estado_pago in ('pendiente','parcial','pagada'));
  end if;
end $$;

-- Saldo siempre consistente con total y monto_pagado
alter table public.proveedores_facturas
  drop column if exists saldo;

alter table public.proveedores_facturas
  add column saldo numeric(14,2)
  generated always as (round(total - monto_pagado, 2)) stored;

create index if not exists idx_prov_facturas_vencimiento
  on public.proveedores_facturas (fecha_vencimiento)
  where fecha_vencimiento is not null and estado_pago <> 'pagada';

create index if not exists idx_prov_facturas_estado_pago
  on public.proveedores_facturas (estado_pago, fecha_vencimiento);

comment on column public.proveedores_facturas.fecha_vencimiento is
  'Fecha de pago elegida al subir la factura. De aquí salen los recordatorios.';
comment on column public.proveedores_facturas.monto_pagado is
  'Derivado por trigger desde proveedores_facturas_pagos. No escribir a mano.';
comment on column public.proveedores_facturas.saldo is
  'Columna generada: total - monto_pagado.';


-- =====================================================================
-- 2. PAGOS APLICADOS A LA FACTURA
-- =====================================================================

create table if not exists public.proveedores_facturas_pagos (
  id                      uuid primary key default gen_random_uuid(),
  factura_id              uuid not null
                          references public.proveedores_facturas (id) on delete cascade,

  monto                   numeric(14,2) not null check (monto > 0),
  fecha_pago              date not null default current_date,   -- cuándo se pagó de verdad
  metodo_pago             text not null default 'transferencia'
                          check (metodo_pago in ('transferencia','cheque','efectivo','tarjeta','otro')),
  referencia              text,                                  -- folio SPEI, número de cheque
  cuenta_origen           text,                                  -- banco/cuenta de donde salió
  entidad_propia_id       uuid references public.proveedores_entidades_propias (id),

  -- Comprobante de pago
  comprobante_bucket      text,
  comprobante_object_path text,
  comprobante_file_name   text,
  comprobante_subido_at   timestamptz,

  notas                   text,

  created_by              uuid references public.app_users (id),
  created_at              timestamptz not null default now(),    -- fecha de REGISTRO
  updated_at              timestamptz not null default now()
);

create index if not exists idx_prov_fact_pagos_factura
  on public.proveedores_facturas_pagos (factura_id, fecha_pago desc);

create index if not exists idx_prov_fact_pagos_registro
  on public.proveedores_facturas_pagos (created_at desc);

comment on table public.proveedores_facturas_pagos is
  'Pagos aplicados a una factura de proveedor. Una factura puede tener varios.';
comment on column public.proveedores_facturas_pagos.fecha_pago is
  'Cuándo se hizo el pago. Puede ser anterior al día en que se registró.';
comment on column public.proveedores_facturas_pagos.created_at is
  'Cuándo se capturó en el sistema. Es la que manda para el cierre de mes.';


-- ---------------------------------------------------------------------
-- 2.1 No se puede pagar más de lo que dice la factura
-- ---------------------------------------------------------------------
create or replace function public.proveedores_validar_pago()
returns trigger
language plpgsql
as $$
declare
  v_total      numeric(14,2);
  v_folio      text;
  v_pagado     numeric(14,2);
  v_disponible numeric(14,2);
begin
  select f.total,
         coalesce(nullif(trim(concat_ws('-', f.serie, f.folio)), ''), 'sin folio')
    into v_total, v_folio
    from public.proveedores_facturas f
   where f.id = new.factura_id;

  if v_total is null then
    raise exception 'La factura % no existe.', new.factura_id;
  end if;

  select coalesce(sum(p.monto), 0)
    into v_pagado
    from public.proveedores_facturas_pagos p
   where p.factura_id = new.factura_id
     and (tg_op = 'INSERT' or p.id <> new.id);

  v_disponible := round(v_total - v_pagado, 2);

  -- Tolerancia de un peso por redondeos de centavos
  if new.monto > v_disponible + 1.00 then
    raise exception
      'El pago de $% excede el saldo de la factura % (saldo disponible $%).',
      to_char(new.monto, 'FM999,999,999.00'),
      v_folio,
      to_char(greatest(v_disponible, 0), 'FM999,999,999.00');
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_proveedores_validar_pago on public.proveedores_facturas_pagos;
create trigger trg_proveedores_validar_pago
  before insert or update on public.proveedores_facturas_pagos
  for each row execute function public.proveedores_validar_pago();


-- ---------------------------------------------------------------------
-- 2.2 Recalcular lo pagado — derivado, nunca incrementado
-- ---------------------------------------------------------------------
create or replace function public.proveedores_recalcular_pago_factura()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_factura_id uuid;
  v_total      numeric(14,2);
  v_pagado     numeric(14,2);
  v_estado     text;
  v_antes      text;
begin
  v_factura_id := coalesce(new.factura_id, old.factura_id);

  select f.total, f.estado_pago
    into v_total, v_antes
    from public.proveedores_facturas f
   where f.id = v_factura_id;

  if v_total is null then
    return coalesce(new, old);
  end if;

  select coalesce(sum(p.monto), 0)
    into v_pagado
    from public.proveedores_facturas_pagos p
   where p.factura_id = v_factura_id;

  v_estado := case
    when v_pagado >= v_total - 0.01 and v_total > 0 then 'pagada'
    when v_pagado > 0                               then 'parcial'
    else 'pendiente'
  end;

  update public.proveedores_facturas f
     set monto_pagado = round(v_pagado, 2),
         estado_pago  = v_estado,
         pagada_at    = case
                          when v_estado = 'pagada' and f.pagada_at is null then now()
                          when v_estado <> 'pagada'                        then null
                          else f.pagada_at
                        end,
         updated_at   = now()
   where f.id = v_factura_id;

  -- Al quedar saldada se avisa y se dejan de generar recordatorios
  if v_estado = 'pagada' and v_antes is distinct from 'pagada' then
    insert into public.activity_log
      (actor_user_id, actor_email, event_type, entity_type, entity_id, entity_label, metadata)
    select
      new.created_by,
      (select u.email from public.app_users u where u.id = new.created_by),
      'proveedor.factura_pagada',
      'proveedores_factura',
      f.id::text,
      concat_ws(' · ',
        coalesce(nullif(trim(concat_ws('-', f.serie, f.folio)), ''), 'Factura'),
        pr.razon_social),
      jsonb_build_object(
        'proveedor',  pr.razon_social,
        'total',      f.total,
        'pagado',     f.monto_pagado,
        'moneda',     f.moneda
      )
      from public.proveedores_facturas f
      join public.proveedores pr on pr.id = f.proveedor_id
     where f.id = v_factura_id;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_proveedores_recalcular_pago on public.proveedores_facturas_pagos;
create trigger trg_proveedores_recalcular_pago
  after insert or update or delete on public.proveedores_facturas_pagos
  for each row execute function public.proveedores_recalcular_pago_factura();


-- ---------------------------------------------------------------------
-- 2.3 Actividad por cada pago registrado
-- ---------------------------------------------------------------------
create or replace function public.proveedores_log_pago()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label     text;
  v_proveedor text;
  v_saldo     numeric(14,2);
begin
  select concat_ws(' · ',
           coalesce(nullif(trim(concat_ws('-', f.serie, f.folio)), ''), 'Factura'),
           pr.razon_social),
         pr.razon_social,
         f.total
    into v_label, v_proveedor, v_saldo
    from public.proveedores_facturas f
    join public.proveedores pr on pr.id = f.proveedor_id
   where f.id = coalesce(new.factura_id, old.factura_id);

  -- El saldo se calcula aquí y no se lee de la columna: los triggers de una
  -- misma tabla corren en orden alfabético, así que al llegar aquí la columna
  -- todavía puede traer el valor anterior.
  select round(v_saldo - coalesce(sum(p.monto), 0), 2)
    into v_saldo
    from public.proveedores_facturas_pagos p
   where p.factura_id = coalesce(new.factura_id, old.factura_id);

  insert into public.activity_log
    (actor_user_id, actor_email, event_type, entity_type, entity_id, entity_label, metadata)
  values (
    coalesce(new.created_by, old.created_by),
    (select u.email from public.app_users u where u.id = coalesce(new.created_by, old.created_by)),
    case when tg_op = 'DELETE'
         then 'proveedor.pago_eliminado'
         else 'proveedor.pago_registrado' end,
    'proveedores_factura',
    coalesce(new.factura_id, old.factura_id)::text,
    v_label,
    jsonb_build_object(
      'proveedor',   v_proveedor,
      'monto',       coalesce(new.monto, old.monto),
      'metodo',      coalesce(new.metodo_pago, old.metodo_pago),
      'fecha_pago',  coalesce(new.fecha_pago, old.fecha_pago),
      'saldo',       v_saldo
    )
  );

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_proveedores_log_pago on public.proveedores_facturas_pagos;
create trigger trg_proveedores_log_pago
  after insert or delete on public.proveedores_facturas_pagos
  for each row execute function public.proveedores_log_pago();


-- =====================================================================
-- 3. VISTA DE COBRANZA — lo que pinta la pantalla de pagos
-- =====================================================================

create or replace view public.proveedores_facturas_pago_v as
select
  f.id,
  f.proveedor_id,
  pr.razon_social           as proveedor,
  pr.nombre_comercial       as proveedor_corto,
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

  -- Días que faltan (negativo = ya venció)
  case when f.fecha_vencimiento is null then null
       else f.fecha_vencimiento - (timezone('America/Mexico_City', now())::date)
  end as dias_restantes,

  -- Lo que se pinta en el chip de la tabla
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

comment on view public.proveedores_facturas_pago_v is
  'Facturas de proveedor con su saldo y estado de vencimiento calculado al momento.';

-- La vista debe correr con los permisos de QUIEN consulta, no del dueño.
-- Sin esto se salta el RLS de las tablas de abajo, y el grant automático
-- de Supabase la deja legible hasta para anon (sin iniciar sesión).
alter view public.proveedores_facturas_pago_v set (security_invoker = on);
revoke all  on public.proveedores_facturas_pago_v from anon;
grant select on public.proveedores_facturas_pago_v to authenticated;


-- =====================================================================
-- 4. RECORDATORIOS
-- =====================================================================

create table if not exists public.proveedores_recordatorios_pago (
  id              uuid primary key default gen_random_uuid(),
  factura_id      uuid not null
                  references public.proveedores_facturas (id) on delete cascade,
  tipo            text not null
                  check (tipo in ('previo_5','vence_hoy','vencida')),
  fecha           date not null,             -- día local en que se generó
  dias_vencida    integer,                   -- solo para tipo 'vencida'
  saldo           numeric(14,2),
  activity_log_id uuid references public.activity_log (id) on delete set null,
  created_at      timestamptz not null default now()
);

-- Si el job corre dos veces el mismo día, no duplica
create unique index if not exists uq_prov_recordatorio_dia
  on public.proveedores_recordatorios_pago (factura_id, tipo, fecha);

-- El aviso previo y el del día de vencimiento se mandan una sola vez por factura
create unique index if not exists uq_prov_recordatorio_unico
  on public.proveedores_recordatorios_pago (factura_id, tipo)
  where tipo in ('previo_5','vence_hoy');

create index if not exists idx_prov_recordatorio_factura
  on public.proveedores_recordatorios_pago (factura_id, created_at desc);


-- ---------------------------------------------------------------------
-- 4.1 Cada recordatorio escribe su actividad (campanita + panel)
-- ---------------------------------------------------------------------
create or replace function public.proveedores_log_recordatorio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log_id     uuid;
  v_label      text;
  v_proveedor  text;
  v_total      numeric(14,2);
  v_moneda     text;
  v_vence      date;
  v_event      text;
begin
  select concat_ws(' · ',
           coalesce(nullif(trim(concat_ws('-', f.serie, f.folio)), ''), 'Factura'),
           pr.razon_social),
         pr.razon_social, f.total, f.moneda, f.fecha_vencimiento
    into v_label, v_proveedor, v_total, v_moneda, v_vence
    from public.proveedores_facturas f
    join public.proveedores pr on pr.id = f.proveedor_id
   where f.id = new.factura_id;

  v_event := case new.tipo
    when 'previo_5'  then 'proveedor.factura_por_vencer'
    when 'vence_hoy' then 'proveedor.factura_vence_hoy'
    else                  'proveedor.factura_vencida'
  end;

  insert into public.activity_log
    (actor_user_id, actor_email, event_type, entity_type, entity_id, entity_label, metadata)
  values (
    null, null,                      -- generada por el sistema, sin usuario
    v_event,
    'proveedores_factura',
    new.factura_id::text,
    v_label,
    jsonb_build_object(
      'proveedor',         v_proveedor,
      'total',             v_total,
      'saldo',             new.saldo,
      'moneda',            coalesce(v_moneda, 'MXN'),
      'fecha_vencimiento', v_vence,
      'dias_vencida',      new.dias_vencida,
      'automatica',        true
    )
  )
  returning id into v_log_id;

  new.activity_log_id := v_log_id;
  return new;
end;
$$;

drop trigger if exists trg_proveedores_log_recordatorio
  on public.proveedores_recordatorios_pago;
create trigger trg_proveedores_log_recordatorio
  before insert on public.proveedores_recordatorios_pago
  for each row execute function public.proveedores_log_recordatorio();


-- ---------------------------------------------------------------------
-- 4.2 Generador de recordatorios
--     5 días antes · el día que vence · diario mientras siga vencida
-- ---------------------------------------------------------------------
create or replace function public.proveedores_generar_recordatorios_pago(
  p_fecha date default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoy    date := coalesce(p_fecha, timezone('America/Mexico_City', now())::date);
  v_creados integer := 0;
  r        record;
  v_dias   integer;
  v_tipo   text;
begin
  for r in
    select f.id, f.fecha_vencimiento, f.saldo
      from public.proveedores_facturas f
     where f.fecha_vencimiento is not null
       and f.status      <> 'cancelada'
       and f.estado_pago <> 'pagada'
       and f.saldo > 0
  loop
    v_dias := r.fecha_vencimiento - v_hoy;

    -- Aviso previo: en la ventana de 5 días, una sola vez por factura.
    -- La ventana (no "exactamente 5") cubre las facturas que se suben
    -- faltando menos de 5 días: igual reciben su aviso anticipado.
    if v_dias between 1 and 5 then
      v_tipo := 'previo_5';
    elsif v_dias = 0 then
      v_tipo := 'vence_hoy';
    elsif v_dias < 0 then
      v_tipo := 'vencida';
    else
      continue;
    end if;

    begin
      insert into public.proveedores_recordatorios_pago
        (factura_id, tipo, fecha, dias_vencida, saldo)
      values (
        r.id,
        v_tipo,
        v_hoy,
        case when v_tipo = 'vencida' then abs(v_dias) else null end,
        r.saldo
      );
      v_creados := v_creados + 1;
    exception
      when unique_violation then
        null;  -- ya se había mandado
    end;
  end loop;

  return v_creados;
end;
$$;

comment on function public.proveedores_generar_recordatorios_pago(date) is
  'Genera los recordatorios de pago del día. Idempotente: correrla dos veces no duplica.';


-- =====================================================================
-- 5. JOB DIARIO — 12:00 PM hora Ciudad de México
--    México dejó el horario de verano en 2022, así que CST = UTC-6 fijo.
--    12:00 CST = 18:00 UTC.
-- =====================================================================

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'proveedores_recordatorios_pago',
      '0 18 * * *',
      $cron$select public.proveedores_generar_recordatorios_pago();$cron$
    );
  else
    raise notice 'pg_cron no está instalado: el job no se programó.';
  end if;
end $$;


-- =====================================================================
-- 6. RLS
-- =====================================================================

alter table public.proveedores_facturas_pagos        enable row level security;
alter table public.proveedores_recordatorios_pago    enable row level security;

-- Pagos: lee cualquier autenticado, escribe admin y user
drop policy if exists "prov_pagos_select" on public.proveedores_facturas_pagos;
create policy "prov_pagos_select"
  on public.proveedores_facturas_pagos for select
  to authenticated using (true);

drop policy if exists "prov_pagos_insert" on public.proveedores_facturas_pagos;
create policy "prov_pagos_insert"
  on public.proveedores_facturas_pagos for insert
  to authenticated
  with check (public.current_app_role() in ('admin','user'));

drop policy if exists "prov_pagos_update" on public.proveedores_facturas_pagos;
create policy "prov_pagos_update"
  on public.proveedores_facturas_pagos for update
  to authenticated
  using (public.current_app_role() in ('admin','user'))
  with check (public.current_app_role() in ('admin','user'));

-- Borrar un pago: admin sin restricción; user solo dentro del mes en curso,
-- igual que en las facturas de obra (cierre de mes por fecha de REGISTRO).
drop policy if exists "prov_pagos_delete" on public.proveedores_facturas_pagos;
create policy "prov_pagos_delete"
  on public.proveedores_facturas_pagos for delete
  to authenticated
  using (
    public.current_app_role() = 'admin'
    or (
      public.current_app_role() = 'user'
      and date_trunc('month', timezone('America/Mexico_City', created_at))
          = date_trunc('month', timezone('America/Mexico_City', now()))
    )
  );

-- Recordatorios: solo lectura desde la app, los escribe el job
drop policy if exists "prov_recordatorios_select" on public.proveedores_recordatorios_pago;
create policy "prov_recordatorios_select"
  on public.proveedores_recordatorios_pago for select
  to authenticated using (true);



-- =====================================================================
-- 7. STORAGE — XML, PDF de la factura y comprobantes de pago
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('proveedores-docs', 'proveedores-docs', false)
on conflict (id) do nothing;

drop policy if exists "proveedores_docs_select" on storage.objects;
create policy "proveedores_docs_select"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'proveedores-docs');

drop policy if exists "proveedores_docs_insert" on storage.objects;
create policy "proveedores_docs_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'proveedores-docs'
    and public.current_app_role() in ('admin','user','almacen')
  );

drop policy if exists "proveedores_docs_update" on storage.objects;
create policy "proveedores_docs_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'proveedores-docs'
    and public.current_app_role() in ('admin','user')
  );

drop policy if exists "proveedores_docs_delete" on storage.objects;
create policy "proveedores_docs_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'proveedores-docs'
    and public.current_app_role() = 'admin'
  );

commit;

-- =====================================================================
-- Comprobación rápida (opcional, corre esto después)
-- =====================================================================
-- select jobname, schedule, active from cron.job
--  where jobname = 'proveedores_recordatorios_pago';
--
-- -- Simular el día de mañana sin esperar al job:
-- select public.proveedores_generar_recordatorios_pago(current_date + 1);
--
-- select * from public.proveedores_facturas_pago_v order by fecha_vencimiento;
