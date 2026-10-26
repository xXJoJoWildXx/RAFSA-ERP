-- ============================================================================
-- Nuevo rol de trabajador: Supervisor de Seguridad
-- ----------------------------------------------------------------------------
-- El código sigue la convención del catálogo: snake_case, sin acentos.
-- Es repetible: si ya existe, sólo reactiva y corrige el nombre.
-- ============================================================================

insert into public.employee_roles_catalog (code, name, is_active)
values ('supervisor_seguridad', 'Supervisor de Seguridad', true)
on conflict (code) do update
  set name = excluded.name,
      is_active = true;

-- Comprobación
select code, name, is_active
  from public.employee_roles_catalog
 order by name;
