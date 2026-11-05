-- ============================================================================
-- Antigüedad que se pausa al dar de baja y se reanuda al recontratar
-- ----------------------------------------------------------------------------
-- En construcción es normal que un trabajador salga y vuelva. Antes el
-- "tiempo contratado" se calculaba como (hoy − hire_date), así que a un
-- empleado inactivo le seguía creciendo la antigüedad, y al recontratarlo se
-- le contaba también todo el tiempo que estuvo fuera.
--
-- Ahora la antigüedad se acumula por periodos:
--   tenure_accumulated_days → días ya trabajados en periodos cerrados
--   tenure_started_on       → inicio del periodo abierto (null si está de baja)
-- Antigüedad = acumulado + (hoy − inicio del periodo abierto)
--
-- El cálculo lo mantiene un trigger, no las pantallas: así da igual desde
-- dónde se cambie el estatus.
-- ============================================================================

alter table public.employees
  add column if not exists tenure_accumulated_days integer not null default 0,
  add column if not exists tenure_started_on date;

comment on column public.employees.tenure_accumulated_days is
  'Días de antigüedad ya acumulados en periodos de contratación cerrados.';
comment on column public.employees.tenure_started_on is
  'Inicio del periodo de contratación abierto. NULL = el empleado está de baja y su antigüedad está pausada.';

-- ── Trigger ──
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
      -- Recontratado: arranca un periodo nuevo hoy. Lo acumulado se conserva.
      if new.tenure_started_on is null then
        new.tenure_started_on := current_date;
      end if;
    else
      -- Baja: se cierra el periodo abierto y se guarda lo que alcanzó a sumar.
      -- La baja se toma con la fecha de HOY, que es cuando se marca.
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

  -- Corregir la fecha de contratación de un empleado activo que nunca ha
  -- estado de baja: la antigüedad debe seguir ese cambio (suele ser un typo).
  if new.status = 'active'
     and coalesce(new.tenure_accumulated_days, 0) = 0
     and new.hire_date is distinct from old.hire_date
     and new.hire_date is not null then
    new.tenure_started_on := new.hire_date;
  end if;

  return new;
end;
$$;

comment on function public.sync_employee_tenure() is
  'Pausa la antigüedad al dar de baja a un empleado y la reanuda al reactivarlo.';

drop trigger if exists trg_sync_employee_tenure on public.employees;
create trigger trg_sync_employee_tenure
  before insert or update on public.employees
  for each row execute function public.sync_employee_tenure();

-- ── Rellenar lo que ya existe ──
-- Activos: su periodo abierto arranca en su fecha de contratación.
update public.employees e
   set tenure_started_on = coalesce(e.hire_date, e.created_at::date)
 where e.status = 'active'
   and e.tenure_started_on is null;

-- Inactivos: se les congela lo que llevaban acumulado. No hay registro de la
-- fecha exacta de su baja, así que se toma hasta hoy: es la mejor aproximación
-- disponible y el admin puede ajustar la fecha de contratación si hace falta.
update public.employees e
   set tenure_started_on = null,
       tenure_accumulated_days = greatest(
         0,
         current_date - coalesce(e.hire_date, e.created_at::date)
       )
 where e.status <> 'active'
   and e.tenure_accumulated_days = 0;

-- ── Comprobación ──
select full_name,
       status,
       hire_date,
       tenure_started_on,
       tenure_accumulated_days,
       tenure_accumulated_days
         + coalesce(current_date - tenure_started_on, 0) as dias_antiguedad
  from public.employees
 order by status, full_name
 limit 40;

-- ── Nombres repetidos que YA existen (el bloqueo nuevo sólo aplica a altas) ──
select upper(trim(regexp_replace(full_name, '\s+', ' ', 'g'))) as nombre_normalizado,
       count(*) as veces,
       string_agg(status, ', ') as estatus
  from public.employees
 group by 1
having count(*) > 1
 order by 2 desc;
