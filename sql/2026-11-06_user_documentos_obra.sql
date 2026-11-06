-- ============================================================================
-- El rol "user" también gestiona los documentos de las obras
-- ----------------------------------------------------------------------------
-- Síntoma: al personal de administración no lo dejaba subir contratos ni
-- cotizaciones en el tab de Documentos de la obra.
--
-- Causa: can_access_obra() sólo reconocía a 'admin' o a un trabajador
-- ASIGNADO a esa obra. El rol 'user' no es ninguno de los dos, así que la
-- política lo rechazaba tanto en la tabla como en el bucket.
--
-- Esta única función controla 5 políticas, así que el arreglo es uno solo:
--   public.obra_documents  → insert / select / update
--   storage.objects        → obra_docs_upload / obra_docs_read
--
-- NO se tocan los borrados: obra_documents_delete_admin y obra_docs_delete_admin
-- no usan esta función y siguen siendo exclusivos de admin.
-- ============================================================================

create or replace function public.can_access_obra(p_obra_id uuid, p_uid uuid)
returns boolean
language sql
stable
as $$
  select
    -- Oficina: admin y administración ven y capturan en todas las obras
    exists (
      select 1
      from public.app_users au
      where au.id = p_uid
        and lower(au.role) in ('admin', 'user')
        and au.is_active is not false
    )
    OR
    -- Obra: el trabajador asignado, sólo en la suya
    exists (
      select 1
      from public.employees e
      join public.obra_assignments oa
        on oa.employee_id = e.id
      where e.user_id = p_uid
        and oa.obra_id = p_obra_id
    );
$$;

-- ── Comprobación ──
-- Debe salir 't' para cualquier obra con el id de una cuenta 'user'.
select au.display_name,
       au.role,
       public.can_access_obra((select id from public.obras limit 1), au.id) as accede
  from public.app_users au
 where au.is_active is not false
 order by au.role, au.display_name;
