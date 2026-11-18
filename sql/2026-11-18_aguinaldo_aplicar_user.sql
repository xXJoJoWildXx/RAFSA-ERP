-- =====================================================================
-- RAFSA ERP · Aguinaldo: también lo puede aplicar el rol user
--
-- Corre esto si ya ejecutaste 2026-11-17_aguinaldo_calculado.sql.
-- Lo único que cambia es quién puede ESCRIBIR el cálculo en los
-- expedientes: antes sólo admin, ahora admin y user.
--
-- aguinaldo_calcular() no cambia: siempre fue de lectura para cualquier
-- autenticado.
-- =====================================================================

begin;

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

grant execute on function public.aguinaldo_aplicar(integer, date) to authenticated;

commit;

-- =====================================================================
-- Comprobación: debe decir 'admin', 'user'
-- =====================================================================
select substring(prosrc from 'not in \(([^)]*)\)') as roles_permitidos
  from pg_proc where proname = 'aguinaldo_aplicar';
