-- ============================================================================
--  Dar de baja a un trabajador lo quita de su obra
--
--  Hasta ahora, marcar inactivo a alguien no tocaba sus asignaciones: seguía
--  apareciendo en el equipo de la obra y lo seguía recogiendo el sync de
--  nómina semanal, que lista a los asignados con assigned_to is null.
--
--  La asignación se CIERRA (assigned_to = hoy), no se borra:
--    · Deja constancia de hasta cuándo estuvo en esa obra, que en obra
--      importa (quién estaba en sitio y cuándo).
--    · assigned_to no nulo es el mecanismo que ya usa la app para "fuera de
--      la obra": el sync de nómina lo excluye desde ese momento.
--    · Si la baja fue un error, el dato sigue ahí.
--
--  Reactivar a alguien NO lo devuelve a ninguna obra: se asigna a mano, que
--  es lo correcto porque al volver puede ir a otra.
--
--  Idempotente.
-- ============================================================================

begin;

create or replace function public.obra_assignments_cerrar_por_baja()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cerradas integer;
  v_obras    text;
begin
  -- Sólo al pasar de activo a cualquier otro estatus.
  if new.status = 'active' or new.status is not distinct from old.status then
    return null;
  end if;

  with cerradas as (
    update public.obra_assignments a
       set assigned_to = current_date
     where a.employee_id = new.id
       and (a.assigned_to is null or a.assigned_to > current_date)
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

comment on function public.obra_assignments_cerrar_por_baja() is
  'Cierra las asignaciones de obra abiertas cuando un empleado deja de estar activo.';

drop trigger if exists trg_obra_assignments_cerrar_por_baja on public.employees;
create trigger trg_obra_assignments_cerrar_por_baja
  after update on public.employees
  for each row execute function public.obra_assignments_cerrar_por_baja();

-- ── Limpieza de lo que ya quedó colgado ───────────────────────────────────
-- Gente ya inactiva que sigue asignada a una obra. Se cierra con la fecha de
-- hoy porque no hay registro de cuándo se les dio de baja.
update public.obra_assignments a
   set assigned_to = current_date
 where (a.assigned_to is null or a.assigned_to > current_date)
   and exists (
     select 1 from public.employees e
      where e.id = a.employee_id
        and e.status <> 'active'
   );

commit;

-- ── Comprobación ──────────────────────────────────────────────────────────
-- No debe devolver ningún renglón: nadie inactivo con asignación abierta.
-- select e.full_name, e.status, o.name as obra, a.assigned_from, a.assigned_to
--   from public.obra_assignments a
--   join public.employees e on e.id = a.employee_id
--   join public.obras o     on o.id = a.obra_id
--  where e.status <> 'active'
--    and (a.assigned_to is null or a.assigned_to > current_date);
