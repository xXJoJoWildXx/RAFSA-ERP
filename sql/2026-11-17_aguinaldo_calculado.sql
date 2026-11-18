-- =====================================================================
-- RAFSA ERP · Aguinaldo calculado automáticamente
--
-- Fórmula pedida:
--     (días trabajados en el año ÷ 365) × 15 × salario diario
--
-- DE DÓNDE SALE CADA PIEZA
--
-- · salario diario = real_salary / 7
--   No es un supuesto: es exactamente como la conciliación semanal
--   descuenta una falta hoy (app/api/payroll/reconcile, realSalary/7).
--   Si algún día cambia ese criterio, hay que cambiarlo en los dos lados.
--
-- · días trabajados en el año = del inicio del periodo de contratación
--   (o del 1 de enero, lo que sea más tarde) hasta el corte, inclusive.
--   Quien entró en marzo cuenta desde marzo; quien ya venía de antes
--   cuenta el año completo.
--
-- · El corte default es el 31 de diciembre: el aguinaldo se paga antes
--   del 20 de diciembre pero cubre el año entero.
--
-- LO QUE NO PUEDE SABER, Y POR ESO AVISA
-- La antigüedad se guarda como un acumulado sin fechas
-- (tenure_accumulated_days) más el periodo abierto. Si alguien salió y
-- volvió a entrar DENTRO del mismo año, no hay registro de las fechas de
-- aquel periodo cerrado, así que sólo se pueden contar los días desde que
-- regresó. Esos casos salen marcados en 'revisar' para capturarlos a mano
-- en lugar de pagarles de menos en silencio.
-- (Hoy no hay ninguno: cero empleados activos con periodos cerrados.)
-- =====================================================================

begin;

-- =====================================================================
-- 1. Calcular — no escribe nada, sirve para previsualizar y auditar
-- =====================================================================

create or replace function public.aguinaldo_calcular(
  p_anio  integer default null,
  p_corte date    default null
)
returns table (
  employee_id          uuid,
  full_name            text,
  payroll_code         text,
  hire_date            date,
  inicio_conteo        date,
  dias_en_el_anio      integer,
  salario_semanal      numeric(14,2),
  salario_diario       numeric(14,2),
  aguinaldo_calculado  numeric(14,2),
  aguinaldo_capturado  numeric(14,2),
  diferencia           numeric(14,2),
  revisar              text
)
language sql
stable
as $$
  with p as (
    select coalesce(p_anio, extract(year from current_date)::int) as anio
  ),
  rango as (
    select anio,
           make_date(anio, 1, 1)                        as inicio_anio,
           coalesce(p_corte, make_date(anio, 12, 31))   as corte
      from p
  ),
  base as (
    select e.id, e.full_name, e.payroll_code, e.hire_date,
           coalesce(e.real_salary, 0)::numeric(14,2)    as salario_semanal,
           coalesce(e.aguinaldo_amount, 0)::numeric(14,2) as capturado,
           e.tenure_started_on,
           coalesce(e.tenure_accumulated_days, 0)       as dias_cerrados,
           -- El periodo abierto manda; si no hay, la fecha de contratación.
           coalesce(e.tenure_started_on, e.hire_date)   as inicio_periodo,
           r.inicio_anio, r.corte
      from public.employees e
     cross join rango r
     where e.status = 'active'
  ),
  calc as (
    select b.*,
           greatest(b.inicio_periodo, b.inicio_anio) as inicio_conteo,
           case
             when b.inicio_periodo is null then null
             -- +1 porque el día de entrada sí se trabaja: entrar el 31 de
             -- diciembre son 1 día, no cero.
             else greatest(0, (b.corte - greatest(b.inicio_periodo, b.inicio_anio)) + 1)
           end as dias
      from base b
  )
  select
    c.id,
    c.full_name,
    c.payroll_code,
    c.hire_date,
    c.inicio_conteo,
    c.dias::integer,
    c.salario_semanal,
    round(c.salario_semanal / 7.0, 2)::numeric(14,2) as salario_diario,
    case
      when c.dias is null or c.salario_semanal = 0 then 0::numeric(14,2)
      else round((c.dias / 365.0) * 15.0 * (c.salario_semanal / 7.0), 2)::numeric(14,2)
    end as aguinaldo_calculado,
    c.capturado,
    case
      when c.dias is null or c.salario_semanal = 0 then (0 - c.capturado)::numeric(14,2)
      else (round((c.dias / 365.0) * 15.0 * (c.salario_semanal / 7.0), 2) - c.capturado)::numeric(14,2)
    end as diferencia,
    case
      when c.inicio_periodo is null
        then 'Sin fecha de contratación: captúrala para poder calcularlo.'
      when c.salario_semanal = 0
        then 'Sin salario registrado.'
      when c.dias_cerrados > 0 and c.tenure_started_on > c.inicio_anio
        then 'Reingresó este año. Sólo se cuentan los días desde que volvió; '
             || 'el periodo anterior no tiene fechas guardadas.'
      when c.inicio_periodo > c.corte
        then 'Su contratación es posterior al corte.'
      else null
    end as revisar
  from calc c
  order by c.full_name;
$$;

comment on function public.aguinaldo_calcular(integer, date) is
  'Aguinaldo proporcional: (días del año / 365) * 15 * (real_salary / 7). No escribe nada.';


-- =====================================================================
-- 2. Aplicar — escribe el resultado en employees.aguinaldo_amount
--    Así la conciliación de aguinaldo y el historial de sueldos siguen
--    funcionando sin cambios: leen de la misma columna de siempre.
-- =====================================================================

create or replace function public.aguinaldo_aplicar(
  p_anio  integer default null,
  p_corte date    default null
)
returns jsonb
language plpgsql
as $$
declare
  v_actualizados integer := 0;
  v_omitidos     integer := 0;
  v_total        numeric(14,2) := 0;
begin
  if public.current_app_role() not in ('admin', 'user') then
    raise exception 'No tienes permiso para aplicar el cálculo de aguinaldo.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Los marcados para revisar NO se tocan: más vale dejarlos en su valor
  -- actual y que alguien los vea, que escribirles un número incompleto.
  with calculado as (
    select * from public.aguinaldo_calcular(p_anio, p_corte)
  ),
  aplicables as (
    select employee_id, aguinaldo_calculado
      from calculado
     where revisar is null
  ),
  upd as (
    update public.employees e
       set aguinaldo_amount = a.aguinaldo_calculado
      from aplicables a
     where e.id = a.employee_id
       and e.aguinaldo_amount is distinct from a.aguinaldo_calculado
    returning e.id, a.aguinaldo_calculado
  )
  select count(*), coalesce(sum(aguinaldo_calculado), 0) into v_actualizados, v_total from upd;

  select count(*) into v_omitidos
    from public.aguinaldo_calcular(p_anio, p_corte) where revisar is not null;

  insert into public.activity_log
    (actor_user_id, actor_email, event_type, entity_type, entity_id, entity_label, metadata)
  values (
    auth.uid(),
    (select u.email from public.app_users u where u.id = auth.uid()),
    'nomina.aguinaldo_calculado', 'payroll', null,
    'Aguinaldo ' || coalesce(p_anio, extract(year from current_date)::int)::text,
    jsonb_build_object(
      'anio',         coalesce(p_anio, extract(year from current_date)::int),
      'corte',        coalesce(p_corte, make_date(coalesce(p_anio, extract(year from current_date)::int), 12, 31)),
      'actualizados', v_actualizados,
      'omitidos',     v_omitidos
    )
  );

  return jsonb_build_object(
    'actualizados', v_actualizados,
    'omitidos',     v_omitidos,
    'suma',         v_total
  );
end;
$$;

comment on function public.aguinaldo_aplicar(integer, date) is
  'Escribe el aguinaldo calculado en employees.aguinaldo_amount. Admin y user. Omite a los marcados para revisar.';

grant execute on function public.aguinaldo_calcular(integer, date) to authenticated;
grant execute on function public.aguinaldo_aplicar(integer, date)  to authenticated;

commit;

-- =====================================================================
-- Comprobación: ver el cálculo sin aplicarlo
-- =====================================================================
-- select full_name, hire_date, dias_en_el_anio, salario_diario,
--        aguinaldo_calculado, aguinaldo_capturado, revisar
--   from public.aguinaldo_calcular()
--  order by revisar nulls last, full_name;
