-- ============================================================================
-- Ventana de captura de asistencia (refuerzo en base de datos)
-- ----------------------------------------------------------------------------
-- Las cuentas con rol 'worker' (directores de obra) sólo pueden registrar o
-- corregir asistencia dentro de una ventana móvil que termina hoy:
--
--     jueves 22  -> abierto del miércoles 14 al jueves 22
--     viernes 23 -> abierto del jueves 15 al viernes 23
--
-- Los administradores y los procesos que usan la service_role key no se ven
-- afectados: siguen pudiendo editar cualquier fecha.
--
-- NOTA: el número de días debe coincidir con ATTENDANCE_EDIT_WINDOW_DAYS en
-- app/worker/obras/[id]/page.tsx. Si cambia uno, cambia el otro.
-- ============================================================================

create or replace function public.enforce_attendance_edit_window()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_days constant int := 9;  -- ver nota de arriba
  v_role        text;
  v_today       date;
  v_oldest      date;
  v_date        date;
begin
  -- auth.uid() es NULL cuando la operación viene de la service_role key
  -- (rutas /api y procesos internos): esas pasan sin restricción.
  select role into v_role
    from public.app_users
   where id = auth.uid();

  if v_role is distinct from 'worker' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  -- Fecha local de México: el servidor corre en UTC y después de las 18:00
  -- hora local ya habría avanzado al día siguiente, corriendo la ventana.
  v_today  := (now() at time zone 'America/Mexico_City')::date;
  v_oldest := v_today - (v_window_days - 1);

  if tg_op = 'DELETE' then
    v_date := old.date;
  else
    v_date := new.date;
  end if;

  if v_date < v_oldest or v_date > v_today then
    raise exception
      'La asistencia del % está fuera del periodo de captura (% a %).',
      to_char(v_date,   'DD/MM/YYYY'),
      to_char(v_oldest, 'DD/MM/YYYY'),
      to_char(v_today,  'DD/MM/YYYY')
      using errcode = 'check_violation';
  end if;

  -- En un UPDATE se validan ambas fechas: así no se puede tomar un registro
  -- ya cerrado y arrastrarlo hacia adentro de la ventana.
  if tg_op = 'UPDATE' and (old.date < v_oldest or old.date > v_today) then
    raise exception
      'El registro del % pertenece a un periodo cerrado y ya no puede modificarse.',
      to_char(old.date, 'DD/MM/YYYY')
      using errcode = 'check_violation';
  end if;

  -- En un BEFORE DELETE, NEW es NULL y devolverlo cancelaria el borrado
  -- en silencio: hay que devolver OLD.
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

comment on function public.enforce_attendance_edit_window() is
  'Limita a las cuentas worker la captura de asistencia a una ventana móvil de 9 días que termina hoy (hora de México). Admins y service_role no se ven afectados.';

drop trigger if exists trg_attendance_edit_window on public.obra_attendance;

create trigger trg_attendance_edit_window
before insert or update or delete on public.obra_attendance
for each row
execute function public.enforce_attendance_edit_window();
