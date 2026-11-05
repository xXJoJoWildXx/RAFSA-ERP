-- ============================================================================
-- Rol "Administración": personal de oficina exento de asistencia
-- ----------------------------------------------------------------------------
-- A esta gente no se le toma asistencia: cobra su sueldo real completo cada
-- semana. Aparece en la dispersión como todos, con la misma resta
-- (real − fiscal = efectivo), pero sin cálculo de faltas.
--
-- La regla NO se amarra al código 'administracion': vive en una bandera del
-- catálogo, para que mañana otro puesto pueda exentarse con un UPDATE.
-- ============================================================================

-- 1) La bandera en el catálogo de roles
alter table public.employee_roles_catalog
  add column if not exists attendance_exempt boolean not null default false;

comment on column public.employee_roles_catalog.attendance_exempt is
  'true = a este rol no se le toma asistencia: cobra sueldo completo y no es asignable a obras.';

-- 2) El rol nuevo (repetible, sin depender de una restricción única en code)
update public.employee_roles_catalog
   set name = 'Administración',
       sort_order = 80,
       attendance_exempt = true,
       is_active = true
 where code = 'administracion';

insert into public.employee_roles_catalog (code, name, sort_order, attendance_exempt)
select 'administracion', 'Administración', 80, true
 where not exists (
   select 1 from public.employee_roles_catalog where code = 'administracion'
 );

-- 3) Horas extra de quienes no pasan por asistencia
--    Sin obra_attendance no hay de dónde leer las horas, así que se capturan
--    por semana en su propia tabla.
create table if not exists public.admin_overtime (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  week_start  date not null,
  hours       numeric(6, 2) not null default 0 check (hours >= 0),
  note        text,
  recorded_by uuid references public.app_users (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists admin_overtime_emp_week_uidx
  on public.admin_overtime (employee_id, week_start);

comment on table public.admin_overtime is
  'Horas extra semanales del personal exento de asistencia (rol con attendance_exempt).';

alter table public.admin_overtime enable row level security;

drop policy if exists admin_overtime_authenticated_all on public.admin_overtime;
create policy admin_overtime_authenticated_all
  on public.admin_overtime for all to authenticated
  using (true) with check (true);

-- Comprobación
select code, name, sort_order, attendance_exempt
  from public.employee_roles_catalog
 order by sort_order, name;
