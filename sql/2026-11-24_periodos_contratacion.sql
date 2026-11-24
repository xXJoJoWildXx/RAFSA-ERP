-- ============================================================================
--  Periodos de contratación (recontrataciones)
--
--  Ya teníamos la antigüedad pausable (2026-11-05_antiguedad_pausable.sql):
--  al dar de baja a un trabajador se cierra su periodo y los días se suman a
--  employees.tenure_accumulated_days. Eso da el TOTAL, pero pierde el detalle:
--  no sabemos en qué rangos estuvo contratado.
--
--  Esta migración guarda ese detalle en employee_employment_periods, para
--  poder mostrar en el perfil "Rangos de contratación" con los dos o más
--  tramos en los que la persona trabajó en la empresa.
--
--  Reglas:
--    · La baja NO se captura: se cierra el periodo con la fecha del día en
--      que se marcó inactivo (igual que ya hacía el trigger de antigüedad).
--    · La recontratación SÍ se captura: el usuario escribe la fecha nueva,
--      que se guarda en hire_date (la que ve el directorio) y abre el periodo.
--
--  La tabla se mantiene sola a partir de employees.tenure_started_on, que es
--  el campo que ya controla el trigger de antigüedad. No hay que escribirle
--  desde el cliente.
--
--  Idempotente.
-- ============================================================================

begin;

-- ── 1. Tabla ──────────────────────────────────────────────────────────────
create table if not exists public.employee_employment_periods (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees (id) on delete cascade,
  started_on   date not null,
  ended_on     date,                      -- NULL = periodo abierto (sigue contratado)
  reconstruido boolean not null default false,
  created_at   timestamptz not null default now(),
  constraint employee_employment_periods_rango_valido
    check (ended_on is null or ended_on >= started_on)
);

comment on table public.employee_employment_periods is
  'Un renglón por cada tramo en que el empleado estuvo contratado. Lo mantiene el trigger trg_sync_employment_periods; no se escribe desde el cliente.';
comment on column public.employee_employment_periods.ended_on is
  'NULL = periodo abierto. Se llena con la fecha en que se marcó inactivo al empleado.';
comment on column public.employee_employment_periods.reconstruido is
  'true = el tramo se dedujo de la antigüedad acumulada al migrar, no se registró en vivo. Sus fechas son aproximadas.';

-- Un empleado no puede tener dos periodos abiertos a la vez.
create unique index if not exists employee_employment_periods_abierto_uidx
  on public.employee_employment_periods (employee_id)
  where ended_on is null;

create index if not exists employee_employment_periods_empleado_idx
  on public.employee_employment_periods (employee_id, started_on);

-- ── 2. RLS ────────────────────────────────────────────────────────────────
-- Sólo lectura desde el cliente: la escritura la hace el trigger, que corre
-- como security definer y no pasa por estas políticas.
alter table public.employee_employment_periods enable row level security;

drop policy if exists "auth read employee_employment_periods"
  on public.employee_employment_periods;
create policy "auth read employee_employment_periods"
  on public.employee_employment_periods
  for select to authenticated using (true);

-- ── 3. Trigger ────────────────────────────────────────────────────────────
-- Corre DESPUÉS de trg_sync_employee_tenure, así que ya ve el valor final de
-- tenure_started_on: no nulo mientras el periodo está abierto, nulo en la baja.
create or replace function public.sync_employment_periods()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_abierto_id         uuid;
  v_abierto_started_on date;
begin
  if tg_op = 'INSERT' then
    if new.tenure_started_on is not null then
      insert into public.employee_employment_periods (employee_id, started_on)
      values (new.id, new.tenure_started_on)
      on conflict (employee_id) where ended_on is null do nothing;
    end if;
    return null;
  end if;

  -- El periodo abierto sólo cambia cuando cambia tenure_started_on.
  if new.tenure_started_on is not distinct from old.tenure_started_on then
    return null;
  end if;

  select id, started_on into v_abierto_id, v_abierto_started_on
    from public.employee_employment_periods
   where employee_id = new.id and ended_on is null
   limit 1;

  if new.tenure_started_on is null then
    -- Baja: se cierra hoy. El greatest() cubre el caso de alguien dado de
    -- alta y de baja con fechas capturadas al revés.
    if v_abierto_id is not null then
      update public.employee_employment_periods
         set ended_on = greatest(current_date, v_abierto_started_on)
       where id = v_abierto_id;
    end if;

  elsif v_abierto_id is null then
    -- Recontratación: arranca un tramo nuevo en la fecha que capturó el usuario.
    insert into public.employee_employment_periods (employee_id, started_on)
    values (new.id, new.tenure_started_on);

  else
    -- Corrección de la fecha de ingreso de alguien que sigue contratado.
    update public.employee_employment_periods
       set started_on = new.tenure_started_on
     where id = v_abierto_id;
  end if;

  return null;
end;
$$;

comment on function public.sync_employment_periods() is
  'Abre y cierra los renglones de employee_employment_periods siguiendo a employees.tenure_started_on.';

drop trigger if exists trg_sync_employment_periods on public.employees;
create trigger trg_sync_employment_periods
  after insert or update on public.employees
  for each row execute function public.sync_employment_periods();

-- ── 3b. Ajuste al trigger de antigüedad ───────────────────────────────────
-- La versión de 2026-11-05 sólo seguía una corrección de hire_date cuando el
-- empleado no tenía antigüedad acumulada. Con los periodos eso deja de servir:
-- si a un recontratado se le corrige la fecha desde "Editar perfil", el
-- directorio cambiaba pero su rango abierto se quedaba con la fecha vieja.
-- Ahora la corrección mueve el periodo abierto en los dos casos. Lo ya
-- acumulado no se toca: son tramos cerrados y no dependen de hire_date.
create or replace function public.sync_employee_tenure()
returns trigger
language plpgsql
as $$
declare
  inicio date;
  fin date;
begin
  -- Alta
  if tg_op = 'INSERT' then
    if new.status = 'active' then
      new.tenure_started_on := coalesce(new.tenure_started_on, new.hire_date, current_date);
    else
      new.tenure_started_on := null;
    end if;
    return new;
  end if;

  -- Cambio de estatus
  if new.status is distinct from old.status then
    if new.status = 'active' then
      -- Recontratado: arranca un periodo nuevo. Si el cliente mandó la fecha
      -- de recontratación se respeta; si no, es hoy. Lo acumulado se conserva.
      if new.tenure_started_on is null then
        new.tenure_started_on := current_date;
      end if;
    else
      -- Baja: se cierra el periodo abierto con la fecha de HOY, que es cuando
      -- se marca. La fecha de salida no se captura a mano.
      inicio := old.tenure_started_on;
      fin := current_date;
      if inicio is not null and fin > inicio then
        new.tenure_accumulated_days :=
          coalesce(old.tenure_accumulated_days, 0) + (fin - inicio);
      end if;
      new.tenure_started_on := null;
    end if;
    return new;
  end if;

  -- Corrección de la fecha de ingreso de alguien que sigue contratado: el
  -- periodo abierto la sigue, para que el directorio y los rangos coincidan.
  if new.status = 'active'
     and new.hire_date is distinct from old.hire_date
     and new.hire_date is not null then
    new.tenure_started_on := new.hire_date;
  end if;

  return new;
end;
$$;

comment on function public.sync_employee_tenure() is
  'Pausa la antigüedad al dar de baja a un empleado y la reanuda al reactivarlo. La corrección de hire_date mueve el periodo abierto.';

-- ── 4. Relleno de lo que ya existe ────────────────────────────────────────
-- 4a. Tramo abierto de todos los que están contratados hoy.
insert into public.employee_employment_periods (employee_id, started_on)
select e.id, e.tenure_started_on
  from public.employees e
 where e.tenure_started_on is not null
   and not exists (
     select 1 from public.employee_employment_periods p
      where p.employee_id = e.id and p.ended_on is null
   );

-- 4b. Tramo previo de quien ya traía antigüedad acumulada antes de esta
--     migración. No quedó registro de sus fechas exactas, así que se deduce:
--     arranca en su hire_date original y dura los días acumulados, sin
--     encimarse con el tramo abierto. Queda marcado como reconstruido.
insert into public.employee_employment_periods
       (employee_id, started_on, ended_on, reconstruido)
select e.id,
       e.hire_date,
       least(
         e.hire_date + coalesce(e.tenure_accumulated_days, 0),
         coalesce(e.tenure_started_on - 1, current_date)
       ),
       true
  from public.employees e
 where coalesce(e.tenure_accumulated_days, 0) > 0
   and e.hire_date is not null
   and e.hire_date <= coalesce(e.tenure_started_on - 1, current_date)
   and not exists (
     select 1 from public.employee_employment_periods p
      where p.employee_id = e.id and p.ended_on is not null
   );

-- ── 5. Actividad: el alta de producto decía "Documento subido" ────────────
-- El evento se registraba con un tipo prestado. Se corrige el histórico para
-- que la bitácora vieja lea igual que la nueva.
update public.activity_log
   set event_type = case
         when coalesce(metadata ->> 'action', '') = 'updated'
           then 'inventory.product_updated'
         else 'inventory.product_created'
       end
 where event_type = 'document.uploaded'
   and entity_type = 'inventory.product';

commit;

-- ── Comprobación ──────────────────────────────────────────────────────────
-- Empleados recontratados y sus tramos:
-- select e.full_name,
--        p.started_on, p.ended_on, p.reconstruido
--   from public.employees e
--   join public.employee_employment_periods p on p.employee_id = e.id
--  where (select count(*) from public.employee_employment_periods x
--          where x.employee_id = e.id) > 1
--  order by e.full_name, p.started_on;
