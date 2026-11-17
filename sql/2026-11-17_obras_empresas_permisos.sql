-- =====================================================================
-- RAFSA ERP · Obras y empresas: quién puede borrarlas
--
-- QUÉ ESTABA PASANDO
-- Las dos tablas estaban abiertas de par en par:
--
--   obras     → una sola política FOR ALL con using(true)
--   empresas  → cuatro políticas, todas con true
--
-- O sea que CUALQUIER usuario autenticado —worker y almacén incluidos—
-- podía insertar, editar y borrar obras y empresas.
--
-- Y borrar una obra no es poca cosa: arrastra en cascada estimaciones,
-- facturas, documentos, nóminas, asistencia, contratos, cotizaciones,
-- estado de cuenta, asignaciones de equipo, reportes y traslados.
--
-- OJO: el borrado real de la app NO pasa por aquí. Va por /api/obras y
-- /api/empresas, que usan service role y se saltan el RLS. Esa puerta se
-- cerró con exigirRol(["admin"]) en lib/apiAuth.ts. Lo de abajo es la
-- segunda barrera, para que nadie borre desde el cliente directamente.
-- =====================================================================

begin;

-- =====================================================================
-- OBRAS
-- =====================================================================

drop policy if exists obras_authenticated_all on public.obras;
drop policy if exists obras_select            on public.obras;
drop policy if exists obras_insert            on public.obras;
drop policy if exists obras_update            on public.obras;
drop policy if exists obras_delete            on public.obras;

-- Leen todos: el trabajador necesita ver su obra.
create policy obras_select
  on public.obras for select to authenticated using (true);

-- Dan de alta y editan oficina: admin y user.
create policy obras_insert
  on public.obras for insert to authenticated
  with check (public.current_app_role() in ('admin','user'));

create policy obras_update
  on public.obras for update to authenticated
  using      (public.current_app_role() in ('admin','user'))
  with check (public.current_app_role() in ('admin','user'));

-- Borrar, sólo admin.
create policy obras_delete
  on public.obras for delete to authenticated
  using (public.current_app_role() = 'admin');


-- =====================================================================
-- EMPRESAS
-- =====================================================================

drop policy if exists "Authenticated users can read empresas"   on public.empresas;
drop policy if exists "Authenticated users can insert empresas" on public.empresas;
drop policy if exists "Authenticated users can update empresas" on public.empresas;
drop policy if exists "Authenticated users can delete empresas" on public.empresas;
drop policy if exists empresas_select on public.empresas;
drop policy if exists empresas_insert on public.empresas;
drop policy if exists empresas_update on public.empresas;
drop policy if exists empresas_delete on public.empresas;

create policy empresas_select
  on public.empresas for select to authenticated using (true);

create policy empresas_insert
  on public.empresas for insert to authenticated
  with check (public.current_app_role() in ('admin','user'));

create policy empresas_update
  on public.empresas for update to authenticated
  using      (public.current_app_role() in ('admin','user'))
  with check (public.current_app_role() in ('admin','user'));

create policy empresas_delete
  on public.empresas for delete to authenticated
  using (public.current_app_role() = 'admin');

commit;

-- =====================================================================
-- Comprobación
-- =====================================================================
select c.relname as tabla, p.polname,
       case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT'
            when 'w' then 'UPDATE' when 'd' then 'DELETE' when '*' then 'ALL' end as cmd,
       coalesce(pg_get_expr(p.polqual, p.polrelid),
                pg_get_expr(p.polwithcheck, p.polrelid)) as condicion
  from pg_policy p join pg_class c on c.oid = p.polrelid
 where c.relname in ('obras','empresas')
 order by c.relname, cmd;
