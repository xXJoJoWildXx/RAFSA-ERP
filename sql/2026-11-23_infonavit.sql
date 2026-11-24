-- ============================================================================
--  Campo Infonavit en el expediente salarial
--
--  Sólo captura: el monto se guarda y se versiona igual que el resto de los
--  conceptos del empleado, pero NO entra todavía en ningún cálculo de nómina.
--  Cuando se quiera descontar, el dato ya va a estar y con su historial.
--
--  Se agrega en los dos lados, como aguinaldo_amount y viatics_amount:
--    · employees                → el valor vigente
--    · employee_salary_history  → la foto de cada cambio
--
--  Idempotente.
-- ============================================================================

begin;

alter table public.employees
  add column if not exists infonavit_amount numeric;

alter table public.employee_salary_history
  add column if not exists infonavit_amount numeric;

comment on column public.employees.infonavit_amount is
  'Descuento de Infonavit del trabajador. Sólo captura: no participa en el cálculo de la nómina.';

comment on column public.employee_salary_history.infonavit_amount is
  'Infonavit vigente en ese tramo del historial salarial.';

commit;

-- Comprobación
-- select full_name, real_salary, aguinaldo_amount, infonavit_amount
--   from public.employees where status = 'active' order by full_name limit 10;
