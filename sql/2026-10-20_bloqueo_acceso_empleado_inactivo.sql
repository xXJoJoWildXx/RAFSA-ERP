-- ============================================================================
-- Bloqueo de acceso para empleados inactivos
-- ----------------------------------------------------------------------------
-- Regla: si employees.status = 'inactive' y el empleado tiene una cuenta
-- asociada (employees.user_id), esa cuenta queda con app_users.is_active = false
-- y la aplicación le niega el acceso. Al reactivar al empleado, la cuenta se
-- rehabilita automáticamente. No se borra ningún dato ni la cuenta de auth.
-- ============================================================================

-- 1) Función de sincronización ------------------------------------------------
create or replace function public.sync_app_user_active_from_employee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_should_be_active boolean;
begin
  if new.user_id is null then
    return new;
  end if;

  v_should_be_active := (lower(coalesce(new.status, '')) = 'active');

  update public.app_users
     set is_active = v_should_be_active
   where id = new.user_id
     and is_active is distinct from v_should_be_active;

  return new;
end;
$$;

comment on function public.sync_app_user_active_from_employee() is
  'Mantiene app_users.is_active alineado con employees.status para la cuenta vinculada al empleado.';

-- 2) Trigger ------------------------------------------------------------------
drop trigger if exists trg_sync_app_user_active on public.employees;

create trigger trg_sync_app_user_active
after insert or update of status, user_id on public.employees
for each row
execute function public.sync_app_user_active_from_employee();

-- 3) Backfill de los registros existentes ------------------------------------
update public.app_users u
   set is_active = (lower(coalesce(e.status, '')) = 'active')
  from public.employees e
 where e.user_id = u.id
   and u.is_active is distinct from (lower(coalesce(e.status, '')) = 'active');
