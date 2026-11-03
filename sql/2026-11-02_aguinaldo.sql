-- ============================================================================
-- Aguinaldo por empleado
-- ----------------------------------------------------------------------------
-- Se guarda igual que los demás conceptos salariales: el valor vigente en
-- employees y cada cambio en employee_salary_history.
--
-- No entra en el cálculo de la nómina semanal ni en la conciliación: es un
-- concepto anual aparte.
-- ============================================================================

alter table public.employees
  add column if not exists aguinaldo_amount numeric(14, 2) not null default 0;

comment on column public.employees.aguinaldo_amount is
  'Aguinaldo vigente del empleado, en pesos. Su historial vive en employee_salary_history.';

alter table public.employee_salary_history
  add column if not exists aguinaldo_amount numeric(14, 2) not null default 0;

comment on column public.employee_salary_history.aguinaldo_amount is
  'Aguinaldo que estuvo vigente durante este periodo.';

-- Comprobación
select column_name, data_type, column_default
  from information_schema.columns
 where table_schema = 'public'
   and column_name = 'aguinaldo_amount'
 order by table_name;
