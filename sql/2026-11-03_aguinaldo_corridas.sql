-- ============================================================================
-- Corridas de aguinaldo
-- ----------------------------------------------------------------------------
-- El módulo de Nómina ahora procesa dos documentos distintos: la nómina
-- semanal (contra asistencia) y el aguinaldo (contra employees.aguinaldo_amount).
-- Ambos se guardan en payroll_runs; esta columna los distingue.
--
-- En una corrida de aguinaldo, week_start/week_end guardan el periodo que
-- declara el documento de la contadora y no se usan para calcular nada.
-- ============================================================================

alter table public.payroll_runs
  add column if not exists kind text not null default 'nomina';

alter table public.payroll_runs
  drop constraint if exists payroll_runs_kind_check;

alter table public.payroll_runs
  add constraint payroll_runs_kind_check
  check (kind = any (array['nomina'::text, 'aguinaldo'::text]));

comment on column public.payroll_runs.kind is
  'nomina = conciliación semanal contra asistencia. aguinaldo = conciliación contra el aguinaldo capturado del empleado.';

-- Comprobación
select kind, count(*) as corridas
  from public.payroll_runs
 group by kind;
