-- ============================================================================
--  Bajadas de foráneos: ninguna notificación vive sin resolverse
--
--  Tres cosas, en este orden:
--
--  1. CAUSA DEL DUPLICADO. La obra genera las notificaciones con un
--     "consulta si existe y si no, inserta". Entre la consulta y el insert no
--     hay nada que lo proteja, y la pantalla dispara esa función en paralelo
--     (al abrir la obra y otra vez por la suscripción realtime). Dos corridas
--     simultáneas leen "no existe" y ambas insertan. Se ve en los datos:
--     NICOLAS ORTIZ VENTURA tiene dos notificaciones de la misma asignación y
--     la misma fecha, creadas con 0.7 MILISEGUNDOS de diferencia. Se arregla
--     con un índice único: la condición de carrera no se puede ganar desde el
--     cliente, sólo la base puede arbitrarla.
--
--  2. NOTIFICACIONES HERMANAS. Un trabajador asignado a dos obras a la vez
--     recibe una notificación por cada asignación (ABRAHAM PEREZ VIDAL, en
--     NAVE 3 y NAVE 4). Al confirmar una, la otra se quedaba pendiente para
--     siempre: es el MISMO viaje. Ahora resolver una resuelve a sus hermanas.
--     Esto además evita que el descarte automático de abajo regale un ticket
--     por un viaje que sí se tomó.
--
--  3. DESCARTE AUTOMÁTICO. Ninguna fecha de bajada debe seguir sin resolverse
--     más de 5 días después de su fecha de regreso. Pasado ese plazo se
--     descarta sola y se otorga el ticket, que es exactamente lo que significa
--     un viaje no tomado.
--
--  Correr completo. Es idempotente.
-- ============================================================================

begin;

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Duplicados: limpiar los existentes y cerrar la puerta
-- ──────────────────────────────────────────────────────────────────────────

-- Se queda la más antigua de cada (asignación, fecha); las copias se borran.
-- Sólo se tocan las que nadie resolvió: una confirmada o descartada ya dejó
-- huella en asistencia o en tickets y no se toca.
with ordenadas as (
  select id,
         row_number() over (
           partition by assignment_id, bajada_date
           order by created_at, id
         ) as rn
  from public.bajada_notifications
  where status = 'pending'
)
delete from public.bajada_notifications n
using ordenadas o
where n.id = o.id
  and o.rn > 1
  -- nunca borrar la única que quede de un grupo ya resuelto
  and exists (
    select 1 from public.bajada_notifications x
    where x.assignment_id = n.assignment_id
      and x.bajada_date = n.bajada_date
      and x.id <> n.id
  );

create unique index if not exists bajada_notifications_asig_fecha_uidx
  on public.bajada_notifications (assignment_id, bajada_date);

comment on index public.bajada_notifications_asig_fecha_uidx is
  'Una notificación por asignación y fecha de bajada. El cliente consulta antes de insertar, pero dos corridas simultáneas leen lo mismo: el árbitro tiene que ser la base.';

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Hermanas: resolver una resuelve el viaje completo
-- ──────────────────────────────────────────────────────────────────────────

create or replace function public.bajada_propagar_resolucion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sólo al pasar de pendiente a resuelta, y sin recursión: la actualización
  -- de las hermanas vuelve a disparar este trigger y ahí ya no hay nada que
  -- propagar.
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  if old.status <> 'pending' or new.status = 'pending' then
    return new;
  end if;

  update public.bajada_notifications
     set status      = new.status,
         resolved_at = coalesce(new.resolved_at, now()),
         resolved_by = new.resolved_by
   where employee_id = new.employee_id
     and bajada_date = new.bajada_date
     and id <> new.id
     and status = 'pending';

  return new;
end;
$$;

drop trigger if exists trg_bajada_propagar_resolucion on public.bajada_notifications;
create trigger trg_bajada_propagar_resolucion
  after update of status on public.bajada_notifications
  for each row
  execute function public.bajada_propagar_resolucion();

-- Arrastre histórico: pendientes cuyo viaje ya se resolvió en otra obra.
-- Se copia el estado de la hermana; si fue confirmada NO se otorga ticket,
-- que es justo el error que habría cometido el descarte automático.
update public.bajada_notifications n
   set status      = h.status,
       resolved_at = coalesce(h.resolved_at, now()),
       resolved_by = h.resolved_by
  from public.bajada_notifications h
 where n.status = 'pending'
   and h.employee_id = n.employee_id
   and h.bajada_date = n.bajada_date
   and h.id <> n.id
   and h.status <> 'pending';

-- ──────────────────────────────────────────────────────────────────────────
-- 3. Descarte automático pasados 5 días del regreso
-- ──────────────────────────────────────────────────────────────────────────

create or replace function public.bajada_descartar_vencidas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer := 0;
  r record;
begin
  for r in
    select n.id, n.employee_id, n.bajada_date, n.reingreso_date,
           e.full_name, o.name as obra_nombre
      from public.bajada_notifications n
      join public.employees e on e.id = n.employee_id
      left join public.obras o on o.id = n.obra_id
     where n.status = 'pending'
       -- "más de 5 días después del regreso". Sin fecha de regreso se mide
       -- desde la de bajada, que es lo único que se sabe del viaje.
       and coalesce(n.reingreso_date, n.bajada_date) < current_date - 5
     order by n.bajada_date, e.full_name
  loop
    update public.bajada_notifications
       set status = 'dismissed',
           resolved_at = now(),
           resolved_by = null
     where id = r.id
       and status = 'pending';

    -- El trigger de arriba pudo haberla resuelto ya en la misma corrida.
    if not found then
      continue;
    end if;

    -- Descartar un viaje lo convierte en ticket: el trabajador no lo tomó,
    -- pero no lo pierde. El índice único (employee_id, cycle_start) impide
    -- otorgar dos por el mismo viaje.
    insert into public.bajada_tickets (employee_id, source, cycle_start, status, note)
    values (
      r.employee_id, 'dismissed', r.bajada_date, 'available',
      'Descartada automáticamente: pasaron más de 5 días de la fecha de regreso sin resolverse'
    )
    on conflict (employee_id, cycle_start) where cycle_start is not null do nothing;

    insert into public.activity_log (event_type, entity_type, entity_id, entity_label, actor_email, metadata)
    values (
      'bajada.auto_descartada',
      'bajada',
      r.id::text,
      r.full_name || ' — bajada ' || to_char(r.bajada_date, 'DD/MM/YYYY')
        || coalesce(' · ' || r.obra_nombre, ''),
      'Sistema',
      jsonb_build_object(
        'employee_id', r.employee_id,
        'bajada_date', r.bajada_date,
        'reingreso_date', r.reingreso_date,
        'dias_sin_resolver', current_date - coalesce(r.reingreso_date, r.bajada_date),
        'ticket_otorgado', true
      )
    );

    v_total := v_total + 1;
  end loop;

  return v_total;
end;
$$;

comment on function public.bajada_descartar_vencidas() is
  'Descarta las notificaciones de bajada que llevan más de 5 días sin resolverse después de la fecha de regreso y otorga el ticket correspondiente. Corre a diario por cron.';

-- ──────────────────────────────────────────────────────────────────────────
-- 4. Cron diario — 9:00 AM hora de CDMX (15:00 UTC, sin horario de verano)
-- ──────────────────────────────────────────────────────────────────────────

do $$
begin
  perform cron.unschedule('bajada_descartar_vencidas');
exception when others then
  null; -- no existía
end;
$$;

select cron.schedule(
  'bajada_descartar_vencidas',
  '0 15 * * *',
  $cron$select public.bajada_descartar_vencidas();$cron$
);

commit;

-- ============================================================================
--  Comprobación. La primera corrida limpia el rezago acumulado.
-- ============================================================================
-- select public.bajada_descartar_vencidas() as descartadas;
--
-- select status, count(*) from public.bajada_notifications group by 1;
--
-- select e.full_name, t.cycle_start, t.source, t.status
--   from public.bajada_tickets t join public.employees e on e.id = t.employee_id
--  order by t.earned_at desc limit 20;
