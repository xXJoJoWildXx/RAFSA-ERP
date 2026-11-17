-- =====================================================================
-- RAFSA ERP · Proveedores — Parte 4 (corrección de seguridad)
--
-- Las dos vistas del módulo se crearon sin security_invoker, así que
-- corrían con los permisos de postgres y se saltaban el RLS de las
-- tablas de abajo. Encima, el grant automático de Supabase le daba
-- SELECT a 'anon', con lo que se podían leer sin iniciar sesión.
--
-- Corre esto después de los archivos 01, 02 y 03.
-- =====================================================================

begin;

-- 1. Que la vista se evalúe con los permisos de QUIEN consulta.
--    Así sí se aplican las policies de proveedores_facturas, obras, etc.
alter view public.proveedores_egresos_por_obra set (security_invoker = on);
alter view public.proveedores_facturas_pago_v  set (security_invoker = on);

-- 2. Quitarle a anon lo que Supabase le dio solo.
--    (En las tablas no hace falta: ahí el RLS ya lo detiene.)
revoke all on public.proveedores_egresos_por_obra from anon;
revoke all on public.proveedores_facturas_pago_v  from anon;

-- 3. Dejar explícito quién sí lee.
grant select on public.proveedores_egresos_por_obra to authenticated;
grant select on public.proveedores_facturas_pago_v  to authenticated;

commit;

-- =====================================================================
-- Comprobación — las dos deben salir con invoker = on y anon_lee = false
-- =====================================================================
select c.relname as vista,
       coalesce((select option_value
                   from pg_options_to_table(c.reloptions)
                  where option_name = 'security_invoker'), 'off') as security_invoker,
       has_table_privilege('anon',          c.oid, 'select') as anon_lee,
       has_table_privilege('authenticated', c.oid, 'select') as auth_lee
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'v'
 order by c.relname;
