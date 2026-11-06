-- ============================================================================
-- El rol "user" también puede eliminar documentos de obra
-- ----------------------------------------------------------------------------
-- Complementa a 2026-11-06_user_documentos_obra.sql, que abrió subir, ver y
-- actualizar. Aquí se abre el borrado.
--
-- Se cambian las DOS capas, porque borrar un documento toca ambas:
--   public.obra_documents  → el registro
--   storage.objects        → el archivo en el bucket obra-docs
--
-- Ojo con el alcance: NO se usa can_access_obra() aquí a propósito. Esa
-- función también da acceso al trabajador asignado a la obra, y un director
-- de obra no debe poder borrar el contrato. El borrado queda en oficina:
-- admin y administración.
--
-- Las políticas se renombran: seguir llamándolas "_delete_admin" cuando ya
-- no son sólo de admin es una trampa para el que las lea después.
-- ============================================================================

-- ── 1) El registro ──
drop policy if exists obra_documents_delete_admin on public.obra_documents;
drop policy if exists obra_documents_delete_oficina on public.obra_documents;

create policy obra_documents_delete_oficina
  on public.obra_documents
  for delete to authenticated
  using (
    exists (
      select 1 from public.app_users au
       where au.id = auth.uid()
         and lower(au.role) in ('admin', 'user')
         and au.is_active is not false
    )
  );

-- ── 2) El archivo ──
drop policy if exists obra_docs_delete_admin on storage.objects;
drop policy if exists obra_docs_delete_oficina on storage.objects;

create policy obra_docs_delete_oficina
  on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'obra-docs'
    and exists (
      select 1 from public.app_users au
       where au.id = auth.uid()
         and lower(au.role) in ('admin', 'user')
         and au.is_active is not false
    )
  );

-- ── Comprobación ──
select schemaname, tablename, policyname, cmd
  from pg_policies
 where (schemaname = 'public' and tablename = 'obra_documents')
    or (schemaname = 'storage' and tablename = 'objects' and policyname like 'obra_docs%')
 order by schemaname, tablename, cmd, policyname;
