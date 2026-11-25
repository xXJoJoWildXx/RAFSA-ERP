-- ============================================================================
--  Tiempo real en el módulo de Proveedores
--
--  Varias personas trabajan el módulo a la vez: una registra pagos, otra
--  procesa facturas, otra manda material a obra. Sin tiempo real cada quien
--  ve una foto vieja hasta que recarga, y dos pueden pagar la misma factura.
--
--  Supabase sólo emite cambios de las tablas que estén en la publicación
--  supabase_realtime. Aquí se agregan todas las del módulo.
--
--  Las pantallas que leen VISTAS (proveedores_facturas_pago_v,
--  proveedores_egresos_por_obra) se suscriben a las tablas de abajo: una
--  vista no emite eventos propios.
--
--  Los eventos respetan RLS: cada quien sólo recibe lo que ya podía leer.
--
--  Idempotente.
-- ============================================================================

begin;

do $$
declare
  t text;
  tablas text[] := array[
    'proveedores',
    'proveedores_facturas',
    'proveedores_facturas_items',
    'proveedores_facturas_pagos',
    'proveedores_productos',
    'proveedores_productos_precios',
    'proveedores_stock_movimientos',
    'proveedores_envios',
    'proveedores_envios_items',
    'proveedores_rentas',
    'proveedores_recordatorios_pago',
    'proveedores_entidades_propias'
  ];
begin
  foreach t in array tablas loop
    -- to_regclass evita tronar si alguna tabla todavía no existe en este entorno.
    if to_regclass('public.' || t) is null then
      raise notice 'No existe public.%, se omite', t;
      continue;
    end if;

    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
      raise notice 'Agregada a supabase_realtime: %', t;
    end if;

    -- Sin esto, un DELETE llega sin los datos del renglón borrado. Las
    -- pantallas sólo necesitan enterarse del cambio para volver a consultar,
    -- pero con la identidad completa se puede filtrar por proveedor y evitar
    -- que todos recarguen por un cambio que no les toca.
    execute format('alter table public.%I replica identity full', t);
  end loop;
end $$;

commit;

-- ── Comprobación ──────────────────────────────────────────────────────────
-- Deben aparecer las 12 tablas:
-- select tablename
--   from pg_publication_tables
--  where pubname = 'supabase_realtime'
--    and schemaname = 'public'
--    and tablename like 'proveedores%'
--  order by tablename;
