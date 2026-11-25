-- ============================================================================
--  Fecha de caducidad en documentos del trabajador
--
--  Tres documentos vencen y hay que reponerlos:
--    · DC3                            → 1 año
--    · Reportes médicos               → 3 meses
--    · Constancia de situación fiscal → 1 año
--
--  Esas duraciones son sólo el botón rápido de la interfaz (lib/documentExpiry.ts):
--  aquí se guarda la fecha tal cual la dejó el usuario, que puede escribir
--  cualquier otra. Un documento sin fecha se queda en NULL y no caduca, que es
--  el caso del resto de los documentos del expediente.
--
--  Idempotente.
-- ============================================================================

begin;

-- DC3 y reportes médicos viven en employee_work_documents (folder_type).
alter table public.employee_work_documents
  add column if not exists expires_on date;

-- La constancia de situación fiscal vive en employee_documents (doc_type).
alter table public.employee_documents
  add column if not exists expires_on date;

comment on column public.employee_work_documents.expires_on is
  'Fecha en que vence el documento. NULL = no caduca. La captura el usuario; la interfaz sólo sugiere 1 año para DC3 y 3 meses para reportes médicos.';

comment on column public.employee_documents.expires_on is
  'Fecha en que vence el documento. NULL = no caduca. Hoy sólo se usa en la constancia de situación fiscal, con 1 año de sugerencia.';

-- Para listar lo que está por vencer sin recorrer la tabla entera.
create index if not exists employee_work_documents_expira_idx
  on public.employee_work_documents (expires_on)
  where expires_on is not null;

create index if not exists employee_documents_expira_idx
  on public.employee_documents (expires_on)
  where expires_on is not null;

commit;

-- ── Comprobación ──────────────────────────────────────────────────────────
-- select e.full_name, d.folder_type, d.file_name, d.expires_on
--   from public.employee_work_documents d
--   join public.employees e on e.id = d.employee_id
--  where d.expires_on is not null
--  order by d.expires_on;
