-- ============================================================================
-- El anticipo puede llevar varias facturas; las estimaciones, una sola
-- ----------------------------------------------------------------------------
-- obra_facturas tenía UNIQUE (estimacion_id): una factura por estimación.
-- Para una estimación normal esa regla es correcta y conviene conservarla.
-- El anticipo es la excepción: se paga a plazos y lleva 2, 3 o 4 facturas.
--
-- No se puede hacer un índice parcial que mire obra_estimaciones.is_anticipo
-- (está en otra tabla), así que la bandera se copia a la factura con un
-- trigger y el índice único se aplica sólo a las que NO son del anticipo.
-- Se hace con índice parcial y no validando en un trigger para que la
-- garantía sea real y sin ventana de carrera.
-- ============================================================================

-- 1) Bandera en la factura, copiada de su estimación
alter table public.obra_facturas
  add column if not exists is_anticipo boolean not null default false;

comment on column public.obra_facturas.is_anticipo is
  'true si la factura cuelga de la estimación-anticipo. La llena un trigger; permite varias facturas para el mismo anticipo.';

create or replace function public.set_factura_is_anticipo()
returns trigger
language plpgsql
as $$
begin
  new.is_anticipo := coalesce(
    (select e.is_anticipo from public.obra_estimaciones e where e.id = new.estimacion_id),
    false
  );
  return new;
end;
$$;

drop trigger if exists trg_set_factura_is_anticipo on public.obra_facturas;
create trigger trg_set_factura_is_anticipo
  before insert or update of estimacion_id on public.obra_facturas
  for each row execute function public.set_factura_is_anticipo();

-- 2) Rellenar las que ya existen
update public.obra_facturas f
   set is_anticipo = true
  from public.obra_estimaciones e
 where f.estimacion_id = e.id
   and e.is_anticipo is true
   and f.is_anticipo is distinct from true;

-- 3) Cambiar la regla: única por estimación SALVO en el anticipo
alter table public.obra_facturas
  drop constraint if exists obra_facturas_unique_estimacion;

drop index if exists obra_facturas_unique_estimacion_no_anticipo;
create unique index obra_facturas_unique_estimacion_no_anticipo
  on public.obra_facturas (estimacion_id)
  where estimacion_id is not null and is_anticipo = false;

-- ── Comprobación ──
select e.description,
       e.is_anticipo,
       count(f.id) as facturas,
       coalesce(sum(f.amount), 0) as facturado,
       e.amount as monto_estimacion
  from public.obra_estimaciones e
  left join public.obra_facturas f on f.estimacion_id = e.id
 group by e.id, e.description, e.is_anticipo, e.amount
 order by e.is_anticipo desc, e.description
 limit 25;
