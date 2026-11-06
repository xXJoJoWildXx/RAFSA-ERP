-- ============================================================================
-- El rol "user" también lee la bitácora de actividades
-- ----------------------------------------------------------------------------
-- La política vieja ("Solo admins pueden leer") filtraba por role = 'admin',
-- así que al personal de administración la campanita y la pantalla de
-- Actividades le salían vacías, sin ningún error visible.
--
-- Quién lee: admin y user (los dos paneles de oficina).
-- Quién escribe: cualquier sesión autenticada, como ya estaba: las
-- actividades las registra la app desde todos los roles.
-- ============================================================================

-- current_app_role() ya existe si corriste el script del inventario; si no,
-- esto lo crea igual (es idempotente).
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

-- ── Lectura ──
drop policy if exists "Solo admins pueden leer" on public.activity_log;
drop policy if exists activity_log_select on public.activity_log;

create policy activity_log_select
  on public.activity_log
  for select to authenticated
  using (public.current_app_role() in ('admin', 'user'));

-- ── Comprobación ──
select policyname, cmd, qual::text as condicion
  from pg_policies
 where schemaname = 'public'
   and tablename = 'activity_log'
 order by policyname;
