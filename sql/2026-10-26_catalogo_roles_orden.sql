-- ============================================================================
-- El catálogo de roles pasa a ser la única fuente de verdad
-- ----------------------------------------------------------------------------
-- Hasta ahora los roles vivían en tres lugares: esta tabla, la lista de
-- components/projectTeamTab.tsx y el mapa de lib/teamPdf.ts. Ahora el código
-- lee de aquí, así que agregar un rol es únicamente un INSERT.
--
-- Se agrega sort_order para conservar el orden jerárquico que tenía la lista
-- escrita a mano (el director primero, el ayudante al final); sin él, el
-- único orden posible sería el alfabético.
-- ============================================================================

alter table public.employee_roles_catalog
  add column if not exists sort_order integer not null default 100;

comment on column public.employee_roles_catalog.sort_order is
  'Orden de aparición en los selectores. Menor = más arriba. Empates se desempatan por nombre.';

-- Orden que tenían las listas del código
update public.employee_roles_catalog set sort_order = 10 where code = 'director_obra';
update public.employee_roles_catalog set sort_order = 20 where code = 'pintor_muros_tiltup';
update public.employee_roles_catalog set sort_order = 30 where code = 'pintor_estructura';
update public.employee_roles_catalog set sort_order = 40 where code = 'oficial_pastero';
update public.employee_roles_catalog set sort_order = 50 where code = 'pintor_tablaroca';
update public.employee_roles_catalog set sort_order = 60 where code = 'supervisor_seguridad';
update public.employee_roles_catalog set sort_order = 70 where code = 'ayudante_obra';

-- Comprobación
select sort_order, code, name, is_active
  from public.employee_roles_catalog
 order by sort_order, name;
