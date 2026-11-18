-- =====================================================================
-- RAFSA ERP · Horas extra de Administración: sólo admin
--
-- La tabla admin_overtime tenía una sola política FOR ALL con using(true):
-- cualquier usuario autenticado podía leerla y escribirla. Esconder la
-- pestaña en el front habría sido puro maquillaje.
--
-- La conciliación de nómina (app/api/payroll/reconcile) también lee esta
-- tabla, pero corre con service role y se salta el RLS, así que cerrar
-- aquí no la afecta.
-- =====================================================================

begin;

drop policy if exists admin_overtime_authenticated_all on public.admin_overtime;
drop policy if exists admin_overtime_select on public.admin_overtime;
drop policy if exists admin_overtime_insert on public.admin_overtime;
drop policy if exists admin_overtime_update on public.admin_overtime;
drop policy if exists admin_overtime_delete on public.admin_overtime;

create policy admin_overtime_select
  on public.admin_overtime for select to authenticated
  using (public.current_app_role() = 'admin');

create policy admin_overtime_insert
  on public.admin_overtime for insert to authenticated
  with check (public.current_app_role() = 'admin');

create policy admin_overtime_update
  on public.admin_overtime for update to authenticated
  using      (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');

create policy admin_overtime_delete
  on public.admin_overtime for delete to authenticated
  using (public.current_app_role() = 'admin');

commit;

-- =====================================================================
-- Comprobación
-- =====================================================================
select p.polname,
       case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT'
            when 'w' then 'UPDATE' when 'd' then 'DELETE' when '*' then 'ALL' end as cmd,
       coalesce(pg_get_expr(p.polqual, p.polrelid),
                pg_get_expr(p.polwithcheck, p.polrelid)) as condicion
  from pg_policy p join pg_class c on c.oid = p.polrelid
 where c.relname = 'admin_overtime' order by cmd;
