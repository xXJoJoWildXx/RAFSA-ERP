-- ============================================================================
--  Corrección: el cierre de asignación usaba la fecha UTC
--
--  current_date en Postgres es la fecha del SERVIDOR, que en Supabase corre
--  en UTC. Una baja capturada por la tarde o la noche en CDMX (UTC-6) caía
--  con la fecha del DÍA SIGUIENTE: una baja de las 21:58 del 24 se guardaba
--  como assigned_to = 2026-11-25.
--
--  Eso rompía el efecto buscado: la aplicación compara contra la fecha local
--  y una fecha futura significa "salida programada, la persona sigue en la
--  obra", así que el trabajador se quedaba dentro en vez de salir.
--
--  Aquí se cambia a la fecha de CDMX y se corrigen los renglones que ya
--  quedaron con fecha adelantada.
--
--  Idempotente.
-- ============================================================================

begin;

-- ── Fecha local de la empresa ─────────────────────────────────────────────
-- CDMX no cambia de horario desde 2022, pero se usa la zona por nombre para
-- que siga siendo correcto si eso cambia.
create or replace function public.hoy_cdmx()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Mexico_City')::date;
$$;

comment on function public.hoy_cdmx() is
  'Fecha de hoy en la zona de la empresa. current_date daría la de UTC, que por la tarde-noche ya es el día siguiente.';

-- ── Trigger, ahora con la fecha local ─────────────────────────────────────
create or replace function public.obra_assignments_cerrar_por_baja()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cerradas integer;
  v_obras    text;
  v_hoy      date := public.hoy_cdmx();
begin
  -- Sólo al pasar de activo a cualquier otro estatus.
  if new.status = 'active' or new.status is not distinct from old.status then
    return null;
  end if;

  with cerradas as (
    update public.obra_assignments a
       set assigned_to = v_hoy
     where a.employee_id = new.id
       and (a.assigned_to is null or a.assigned_to > v_hoy)
    returning a.obra_id
  )
  select count(*), string_agg(distinct o.name, ', ')
    into v_cerradas, v_obras
    from cerradas c
    join public.obras o on o.id = c.obra_id;

  -- Que quede en la bitácora: el usuario dio de baja a una persona y, sin
  -- pedirlo, también salió de una obra. Tiene que poder verlo.
  if coalesce(v_cerradas, 0) > 0 then
    insert into public.activity_log
      (event_type, entity_type, entity_id, entity_label, metadata)
    values (
      'team.member_removed',
      'team',
      new.id,
      new.full_name || ' <- ' || coalesce(v_obras, 'obra'),
      jsonb_build_object(
        'employee_name',         new.full_name,
        'motivo',                'baja_del_empleado',
        'obras',                 v_obras,
        'asignaciones_cerradas', v_cerradas
      )
    );
  end if;

  return null;
end;
$$;

drop trigger if exists trg_obra_assignments_cerrar_por_baja on public.employees;
create trigger trg_obra_assignments_cerrar_por_baja
  after update on public.employees
  for each row execute function public.obra_assignments_cerrar_por_baja();

-- ── Corregir lo que quedó con fecha adelantada ────────────────────────────
-- Asignaciones de gente YA INACTIVA cuya fecha de salida quedó en el futuro:
-- no es una salida programada, es el desfase de UTC. Se traen a hoy para que
-- la persona salga de la obra de inmediato.
update public.obra_assignments a
   set assigned_to = public.hoy_cdmx()
 where (a.assigned_to is null or a.assigned_to > public.hoy_cdmx())
   and exists (
     select 1 from public.employees e
      where e.id = a.employee_id
        and e.status <> 'active'
   );

commit;

-- ── Comprobación ──────────────────────────────────────────────────────────
-- No debe devolver ningún renglón.
-- select e.full_name, e.status, o.name as obra, a.assigned_to, public.hoy_cdmx() as hoy
--   from public.obra_assignments a
--   join public.employees e on e.id = a.employee_id
--   join public.obras o     on o.id = a.obra_id
--  where e.status <> 'active'
--    and (a.assigned_to is null or a.assigned_to > public.hoy_cdmx());
