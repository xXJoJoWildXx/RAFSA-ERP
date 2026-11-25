-- ============================================================================
--  Vacaciones y prima vacacional en la nómina semanal
--
--  Cuando a un trabajador se le pagan sus vacaciones dentro de la corrida de
--  la semana, el renglón de la nómina lleva más dinero del que explica su
--  sueldo. Sin guardar el desglose, meses después nadie puede decir por qué.
--
--  Se guardan los tres datos que reconstruyen el cálculo:
--    vacaciones_dias     → días del artículo 76 que se pagaron
--    vacaciones_importe  → esos días por el salario diario
--    prima_vacacional    → el 25% del artículo 80 sobre ese importe
--
--  real_total y efectivo ya vienen con el pago incluido: estas columnas son
--  el desglose, no un cargo aparte. La suma de las dos de abajo es lo que se
--  agregó al renglón.
--
--  Idempotente.
-- ============================================================================

begin;

alter table public.payroll_run_lines
  add column if not exists vacaciones_dias    integer,
  add column if not exists vacaciones_importe numeric(14,2),
  add column if not exists prima_vacacional   numeric(14,2);

comment on column public.payroll_run_lines.vacaciones_dias is
  'Días laborables de vacaciones pagados en esta corrida (artículo 76 LFT). NULL = no se pagaron vacaciones.';

comment on column public.payroll_run_lines.vacaciones_importe is
  'Salario de los días de vacaciones. Ya está incluido dentro de real_total y efectivo.';

comment on column public.payroll_run_lines.prima_vacacional is
  'Prima vacacional (25% mínimo, artículo 80 LFT). Ya está incluida dentro de real_total y efectivo.';

-- Para sacar rápido a quién se le pagaron vacaciones en el año.
create index if not exists payroll_run_lines_vacaciones_idx
  on public.payroll_run_lines (employee_id)
  where vacaciones_dias is not null;

-- ── Registro de vacaciones ya pagadas ────────────────────────────────────
-- Un trabajador sólo cobra UNA vez las vacaciones de cada año de servicio.
-- Esta tabla es la que impide pagárselas dos veces, y la que las vuelve a
-- habilitar sola cuando llega su siguiente aniversario con los días nuevos.
--
-- La llave es el ANIVERSARIO, no el número de año: a un recontratado le
-- cambia la fecha de alta, así que su "año 1" nuevo cae en otra fecha y no
-- choca con el año 1 de su etapa anterior.
create table if not exists public.employee_vacaciones_pagadas (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references public.employees (id) on delete cascade,

  -- Aniversario al que corresponde el pago: fecha de alta + años de servicio.
  aniversario    date not null,
  anio_servicio  integer not null,

  dias           integer not null,
  importe        numeric(14,2) not null default 0,
  prima          numeric(14,2) not null default 0,
  total          numeric(14,2) not null default 0,

  -- De qué corrida salió, para poder rastrearlo.
  payroll_run_id uuid references public.payroll_runs (id) on delete set null,
  week_start     date,

  created_by     uuid,
  created_at     timestamptz not null default now(),

  constraint employee_vacaciones_pagadas_dias_validos check (dias > 0)
);

comment on table public.employee_vacaciones_pagadas is
  'Un renglón por cada año de servicio cuyas vacaciones ya se pagaron. Impide el doble pago y habilita de nuevo al llegar el siguiente aniversario.';

comment on column public.employee_vacaciones_pagadas.aniversario is
  'Fecha de alta + años de servicio. Es la llave real: un recontratado tiene aniversarios distintos a los de su etapa anterior.';

-- La garantía de que no se paga dos veces el mismo periodo.
create unique index if not exists employee_vacaciones_pagadas_uidx
  on public.employee_vacaciones_pagadas (employee_id, aniversario);

create index if not exists employee_vacaciones_pagadas_empleado_idx
  on public.employee_vacaciones_pagadas (employee_id, aniversario desc);

alter table public.employee_vacaciones_pagadas enable row level security;

drop policy if exists "auth read employee_vacaciones_pagadas"
  on public.employee_vacaciones_pagadas;
create policy "auth read employee_vacaciones_pagadas"
  on public.employee_vacaciones_pagadas
  for select to authenticated using (true);

commit;

-- ── Comprobación ──────────────────────────────────────────────────────────
-- Vacaciones pagadas por corrida:
-- select r.week_start, l.employee_name_raw, l.vacaciones_dias,
--        l.vacaciones_importe, l.prima_vacacional,
--        l.vacaciones_importe + l.prima_vacacional as total_vacaciones
--   from public.payroll_run_lines l
--   join public.payroll_runs r on r.id = l.run_id
--  where l.vacaciones_dias is not null
--  order by r.week_start desc, l.employee_name_raw;
