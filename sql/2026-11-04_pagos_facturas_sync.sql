-- ============================================================================
-- Los pagos y los estados que dependen de ellos, siempre cuadrados
-- ----------------------------------------------------------------------------
-- Problema: obra_facturas.amount_paid / status se escribían a mano al registrar
-- el pago, pero al borrar un movimiento de obra_state_accounts nadie los
-- recalculaba. La factura se quedaba "Pagada" (o con pagos parciales sumados)
-- por pagos que ya no existen.
--
-- Solución: el monto pagado deja de ser un dato que se escribe y pasa a ser un
-- dato que se deriva. Un trigger lo recalcula desde los pagos que REALMENTE
-- existen, en cualquier alta, cambio o baja. Así da igual desde qué pantalla
-- se borre el pago: la factura siempre refleja la suma real.
--
-- Lo mismo aplica al Fondo de garantía, que no cuelga de ninguna factura: su
-- cobro se marca con source='garantia' y, si se borra el último, la garantía
-- regresa a "Facturado" o a "Esperando factura" en vez de quedarse "Cobrada".
--
-- El Anticipo no necesita nada aparte: hoy es una estimación-anticipo con su
-- propia factura, así que ya entra por la regla de las facturas.
-- ============================================================================

-- ── 0) Marca de origen, para los movimientos que no cuelgan de una factura ──
alter table public.obra_state_accounts
  add column if not exists source text;

alter table public.obra_state_accounts
  drop constraint if exists obra_state_accounts_source_check;
alter table public.obra_state_accounts
  add constraint obra_state_accounts_source_check
  check (source is null or source in ('garantia', 'anticipo'));

comment on column public.obra_state_accounts.source is
  'De qué card salió el movimiento cuando no cuelga de una factura (garantia / anticipo). NULL = movimiento normal.';

create index if not exists obra_state_accounts_source_idx
  on public.obra_state_accounts (obra_id, source) where source is not null;

-- Rellenar los cobros de garantía que ya existen: en las obras marcadas como
-- cobradas, el movimiento sin factura cuyo monto coincide con la garantía.
update public.obra_state_accounts sa
   set source = 'garantia'
  from public.obras o
 where sa.obra_id = o.id
   and sa.source is null
   and sa.factura_id is null
   and o.garantia_status = 'paid'
   and (
     -- el cobro de garantía siempre se registra por el monto exacto de la garantía
     (o.garantia_amount is not null and sa.amount = o.garantia_amount)
     -- y por defecto lleva la nota "Cobro fondo de garantía"
     or sa.note ilike '%garant%'
   );

create or replace function public.sync_factura_amount_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ids uuid[];
  fid uuid;
begin
  -- OLD/NEW según la operación: referenciar NEW en un DELETE truena,
  -- así que cada caso se arma por separado.
  if tg_op = 'DELETE' then
    ids := array_remove(array[old.factura_id], null);
  elsif tg_op = 'INSERT' then
    ids := array_remove(array[new.factura_id], null);
  else
    -- un UPDATE pudo haber movido el pago de una factura a otra
    ids := array_remove(array[old.factura_id, new.factura_id], null);
  end if;

  for fid in select distinct u from unnest(ids) as u loop
    update public.obra_facturas f
       set amount_paid = p.pagado,
           status = case
                      when p.pagado <= 0        then 'pending'
                      when p.pagado >= f.amount then 'paid'
                      else                           'partial'
                    end,
           updated_at = now()
      from (
        select coalesce(sum(amount), 0)::numeric as pagado
          from public.obra_state_accounts
         where factura_id = fid
           and concept in ('deposit', 'advance')
      ) p
     where f.id = fid;
  end loop;

  -- ── Fondo de garantía: se borró un cobro ──
  if tg_op = 'DELETE' and old.source = 'garantia' then
    -- Sólo si ya no queda NINGÚN cobro de garantía en la obra
    if not exists (
      select 1
        from public.obra_state_accounts
       where obra_id = old.obra_id
         and source = 'garantia'
    ) then
      update public.obras o
         set garantia_status = case
               when exists (
                 select 1
                   from public.attachments a
                  where a.ref_table = 'obra_garantia_factura'
                    and a.ref_id = o.id
               ) then 'invoiced'  -- la factura sigue subida
               else 'pending'     -- ni factura: vuelve al inicio
             end
       where o.id = old.obra_id
         and o.garantia_status = 'paid'; -- no degradar un estado que no estaba cobrado
    end if;
  end if;

  return null; -- trigger AFTER: el valor de regreso se ignora
end;
$$;

comment on function public.sync_factura_amount_paid() is
  'Recalcula obra_facturas.amount_paid/status desde la suma real de pagos, y revierte obras.garantia_status cuando se borra el último cobro de la garantía.';

drop trigger if exists trg_sync_factura_amount_paid on public.obra_state_accounts;
create trigger trg_sync_factura_amount_paid
  after insert or update or delete on public.obra_state_accounts
  for each row execute function public.sync_factura_amount_paid();

-- ── Corregir lo que ya quedó mal de pagos borrados antes de este trigger ──
update public.obra_facturas f
   set amount_paid = p.pagado,
       status = case
                  when p.pagado <= 0        then 'pending'
                  when p.pagado >= f.amount then 'paid'
                  else                           'partial'
                end,
       updated_at = now()
  from (
    select f2.id,
           coalesce((
             select sum(sa.amount)
               from public.obra_state_accounts sa
              where sa.factura_id = f2.id
                and sa.concept in ('deposit', 'advance')
           ), 0)::numeric as pagado
      from public.obra_facturas f2
  ) p
 where f.id = p.id
   and (f.amount_paid is distinct from p.pagado
        or f.status is distinct from case
                                       when p.pagado <= 0        then 'pending'
                                       when p.pagado >= f.amount then 'paid'
                                       else                           'partial'
                                     end);

-- ── Corregir garantías marcadas como cobradas sin ningún cobro registrado ──
update public.obras o
   set garantia_status = case
         when exists (
           select 1 from public.attachments a
            where a.ref_table = 'obra_garantia_factura' and a.ref_id = o.id
         ) then 'invoiced'
         else 'pending'
       end
 where o.garantia_status = 'paid'
   and not exists (
     select 1 from public.obra_state_accounts sa
      where sa.obra_id = o.id and sa.source = 'garantia'
   );

-- Comprobación: facturas y lo que de verdad se les ha pagado
select f.invoice_number,
       f.amount,
       f.amount_paid,
       f.status,
       (select count(*) from public.obra_state_accounts sa where sa.factura_id = f.id) as pagos
  from public.obra_facturas f
 order by f.created_at desc
 limit 25;
