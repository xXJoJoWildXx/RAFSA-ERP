-- ============================================================================
-- Cierre de mes: el rol "user" sólo borra movimientos registrados este mes
-- ----------------------------------------------------------------------------
-- El criterio es la fecha de REGISTRO (created_at), no la fecha del pago
-- (date). Un pago de septiembre capturado hoy entra en el cierre de este mes;
-- uno capturado en octubre ya no se toca aunque se haya pagado hace poco.
--
-- admin: sin límite. user: sólo el mes corriente.
--
-- OJO con cómo funciona RLS: varias políticas permisivas para el mismo
-- comando se suman con OR. La política vieja era ALL/true, así que dejarla
-- habría anulado cualquier restricción nueva. Por eso se reemplaza por una
-- política por comando.
-- ============================================================================

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(role, ''))
    from public.app_users
   where id = auth.uid()
     and is_active is not false
$$;

grant execute on function public.current_app_role() to authenticated;

alter table public.obra_state_accounts enable row level security;

drop policy if exists obra_state_accounts_authenticated_all on public.obra_state_accounts;
drop policy if exists obra_state_accounts_select on public.obra_state_accounts;
drop policy if exists obra_state_accounts_insert on public.obra_state_accounts;
drop policy if exists obra_state_accounts_update on public.obra_state_accounts;
drop policy if exists obra_state_accounts_delete on public.obra_state_accounts;

create policy obra_state_accounts_select
  on public.obra_state_accounts for select to authenticated
  using (true);

create policy obra_state_accounts_insert
  on public.obra_state_accounts for insert to authenticated
  with check (true);

create policy obra_state_accounts_update
  on public.obra_state_accounts for update to authenticated
  using (true) with check (true);

-- El candado. El mes se evalúa en hora de México, que es la que ve el usuario.
create policy obra_state_accounts_delete
  on public.obra_state_accounts for delete to authenticated
  using (
    public.current_app_role() <> 'user'
    or date_trunc('month', created_at at time zone 'America/Mexico_City')
       = date_trunc('month', now() at time zone 'America/Mexico_City')
  );

-- ── Comprobación ──
select policyname, cmd, qual::text as condicion
  from pg_policies
 where schemaname = 'public' and tablename = 'obra_state_accounts'
 order by cmd, policyname;

-- Cuántos movimientos quedarían cerrados para el rol user
select date_trunc('month', created_at at time zone 'America/Mexico_City')::date as mes_registro,
       count(*) as movimientos,
       case when date_trunc('month', created_at at time zone 'America/Mexico_City')
               = date_trunc('month', now() at time zone 'America/Mexico_City')
            then 'editable' else 'cerrado' end as estado
  from public.obra_state_accounts
 group by 1, 3
 order by 1 desc;
