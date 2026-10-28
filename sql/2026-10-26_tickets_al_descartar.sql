-- ============================================================================
-- Nuevo modelo de tickets de bajada
-- ----------------------------------------------------------------------------
-- Antes: cada bimestre otorgaba 1 ticket y confirmar la bajada lo consumía.
-- Ahora: la bajada recurrente no necesita ni consume ticket. El ticket se gana
-- al DESCARTAR una notificación (el trabajador no tomó ese viaje) y se gasta
-- sólo en una bajada extemporánea ("Utilizar").
-- ============================================================================

-- 1) Nuevo origen de ticket
alter table public.bajada_tickets
  drop constraint if exists bajada_tickets_source_check;

alter table public.bajada_tickets
  add constraint bajada_tickets_source_check
  check (source = any (array['alta'::text, 'cycle'::text, 'dismissed'::text]));

comment on column public.bajada_tickets.source is
  'dismissed = ganado al descartar una bajada. alta/cycle = modelo anterior (automático), ya no se generan.';

-- 2) Limpieza de los tickets repartidos por el modelo anterior.
--    Sólo se borran los que siguen SIN usar: los ya usados son historial.
--    Si prefieres conservarlos, no corras este bloque.
delete from public.bajada_tickets
 where source in ('alta', 'cycle')
   and status = 'available';

-- Comprobación
select source, status, count(*) as filas
  from public.bajada_tickets
 group by source, status
 order by source, status;
