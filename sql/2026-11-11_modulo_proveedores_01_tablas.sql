-- ============================================================================
-- MÓDULO DE PROVEEDORES, COMPRAS Y ABASTO  ·  1/2: tablas
-- ----------------------------------------------------------------------------
-- Objetivo: al subir una factura (CFDI), armar solo el proveedor, su catálogo
-- de productos/servicios, el precio y el stock; y poder repartir ese stock a
-- las obras para saber el egreso real de cada una.
--
-- Decisiones de diseño y POR QUÉ (leídas de facturas reales):
--
-- 1. El proveedor se identifica por RFC, no por nombre. "Plataformex" factura
--    como MEL140122IW4 y "Saltillo" resultó ser una persona física (Claudia
--    Fabiola Reyes Corpus). El nombre comercial se guarda aparte y es editable.
--
-- 2. El RECEPTOR importa: la factura de Presidium viene a nombre de
--    "Revestimientos Industriales AVR", no de RAF. Como public.empresas son
--    los CLIENTES (Cushman, Jamar...), las razones sociales propias necesitan
--    su propia tabla: proveedores_entidades_propias.
--
-- 3. El código de producto es DEL PROVEEDOR. "K25WJ0172-5G" sólo significa
--    algo en Sherwin. La clave natural es (proveedor_id, codigo), no el código
--    suelto.
--
-- 4. No todo concepto es inventario: hay "COMISION" ($301.73 en Saltillo) y
--    "AJUSTE" ($0.01 en SIC). Y las rentas de plataforma no son stock: son un
--    gasto con periodo que se carga directo a una obra. De ahí el campo kind.
--
-- 5. El stock NO se escribe a mano en ningún lado: se deriva del libro de
--    movimientos (misma lección que los pagos de facturas de obra). Así no
--    puede desalinearse por una pantalla que olvidó actualizarlo.
--
-- Este inventario es INDEPENDIENTE del almacén existente (inventory_products):
-- son dos catálogos y dos stocks distintos, por decisión.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Razones sociales propias (quién recibe la factura)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.proveedores_entidades_propias (
  id            uuid primary key default gen_random_uuid(),
  rfc           text not null unique,
  razon_social  text not null,
  nombre_corto  text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

comment on table public.proveedores_entidades_propias is
  'Razones sociales DEL GRUPO (receptoras de facturas de compra). No confundir con public.empresas, que son los clientes.';

insert into public.proveedores_entidades_propias (rfc, razon_social, nombre_corto)
values
  ('RTR220502PH6', 'RECUBRIMIENTOS TECNICOS RAF S.A. DE C.V.', 'RAF'),
  ('RIA1608011J0', 'REVESTIMIENTOS INDUSTRIALES AVR', 'AVR')
on conflict (rfc) do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Proveedores
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.proveedores (
  id                uuid primary key default gen_random_uuid(),
  rfc               text not null unique,
  razon_social      text not null,
  nombre_comercial  text,
  categoria         text not null default 'materiales'
                    check (categoria in ('materiales','herramienta','refacciones','plataformas','servicios','otro')),
  regimen_fiscal    text,
  contacto_nombre   text,
  contacto_telefono text,
  contacto_email    text,
  condiciones_pago  text,
  dias_credito      integer,
  notas             text,
  is_active         boolean not null default true,
  -- true = se dio de alta solo al procesar una factura y nadie lo ha revisado
  autocreado        boolean not null default false,
  created_by        uuid references public.app_users (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on column public.proveedores.rfc is 'Identidad real del proveedor. El nombre comercial puede no coincidir con la razón social.';
comment on column public.proveedores.autocreado is 'Alta automática por factura, pendiente de revisar (completar contacto, categoría, condiciones).';

create index if not exists suppliers_nombre_idx on public.proveedores (lower(coalesce(nombre_comercial, razon_social)));

-- ─────────────────────────────────────────────────────────────────────────
-- 3) Facturas recibidas
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.proveedores_facturas (
  id                 uuid primary key default gen_random_uuid(),
  proveedor_id        uuid not null references public.proveedores (id) on delete restrict,
  entidad_propia_id  uuid references public.proveedores_entidades_propias (id),

  -- Datos fiscales del CFDI
  uuid_fiscal        text unique,            -- el UUID del timbre: evita cargar dos veces la misma
  serie              text,
  folio              text,
  fecha              timestamptz,
  rfc_emisor         text,
  nombre_emisor      text,
  rfc_receptor       text,
  nombre_receptor    text,
  moneda             text not null default 'MXN',
  tipo_cambio        numeric(12,6) not null default 1,
  tipo_comprobante   text,                   -- I = ingreso
  forma_pago         text,
  metodo_pago        text,                   -- PUE / PPD
  condiciones_pago   text,
  uso_cfdi           text,

  subtotal           numeric(14,2) not null default 0,
  descuento          numeric(14,2) not null default 0,
  iva                numeric(14,2) not null default 0,
  total              numeric(14,2) not null default 0,

  -- Archivos (bucket supplier-invoices)
  xml_object_path    text,
  pdf_object_path    text,
  file_name          text,

  -- Flujo de revisión
  status             text not null default 'por_revisar'
                     check (status in ('por_revisar','procesada','con_errores','cancelada')),
  procesada_at       timestamptz,
  procesada_by       uuid references public.app_users (id),
  notas              text,

  created_by         uuid references public.app_users (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on column public.proveedores_facturas.uuid_fiscal is 'UUID del Timbre Fiscal Digital. Único: impide registrar dos veces la misma factura.';
comment on column public.proveedores_facturas.status is 'por_revisar = cargada y clasificada, esperando confirmación humana. procesada = ya movió stock y costos.';

create index if not exists supplier_invoices_supplier_idx on public.proveedores_facturas (proveedor_id, fecha desc);
create index if not exists supplier_invoices_status_idx on public.proveedores_facturas (status) where status <> 'procesada';

-- ─────────────────────────────────────────────────────────────────────────
-- 4) Catálogo por proveedor (productos y servicios)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.proveedores_productos (
  id                uuid primary key default gen_random_uuid(),
  proveedor_id       uuid not null references public.proveedores (id) on delete cascade,

  codigo            text,                    -- NoIdentificacion del CFDI
  descripcion       text not null,
  kind              text not null default 'product'
                    check (kind in ('product','rental','service')),

  unidad            text,                    -- "PIEZA", "ROLLO", "CAJA"
  clave_unidad      text,                    -- H87, E48, XBX, XRO
  clave_prod_serv   text,                    -- catálogo SAT

  -- Precio: el último visto y el promedio, ambos derivados de las compras
  last_price        numeric(14,4),
  last_purchase_at  timestamptz,
  avg_price         numeric(14,4),

  -- Stock: SÓLO para kind='product'. Lo mantiene un trigger desde el libro
  -- de movimientos; no se escribe a mano.
  stock             numeric(14,3) not null default 0,
  stock_min         numeric(14,3) not null default 0,
  ubicacion         text,

  is_active         boolean not null default true,
  autocreado        boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.proveedores_productos is
  'Catálogo de lo que cada proveedor surte. La clave es (proveedor, código): el mismo artículo físico tiene códigos distintos en proveedores distintos.';
comment on column public.proveedores_productos.stock is
  'Derivado de proveedores_stock_movimientos por trigger. No escribir directo.';

-- Un código no se repite DENTRO de un proveedor. Los conceptos sin código
-- (rentas, servicios) se distinguen por descripción.
create unique index if not exists supplier_products_codigo_uidx
  on public.proveedores_productos (proveedor_id, codigo)
  where codigo is not null;

create unique index if not exists supplier_products_sin_codigo_uidx
  on public.proveedores_productos (proveedor_id, lower(descripcion))
  where codigo is null;

create index if not exists supplier_products_busqueda_idx
  on public.proveedores_productos (proveedor_id, kind, is_active);

-- ─────────────────────────────────────────────────────────────────────────
-- 5) Conceptos de la factura (un renglón por <cfdi:Concepto>)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.proveedores_facturas_items (
  id                  uuid primary key default gen_random_uuid(),
  factura_id          uuid not null references public.proveedores_facturas (id) on delete cascade,
  line_no             integer not null default 1,

  -- Tal como viene en el XML, sin interpretar
  no_identificacion   text,
  descripcion         text not null,
  clave_prod_serv     text,
  clave_unidad        text,
  unidad              text,
  cantidad            numeric(14,4) not null default 0,
  valor_unitario      numeric(14,4) not null default 0,
  importe             numeric(14,2) not null default 0,
  descuento           numeric(14,2) not null default 0,
  iva_importe         numeric(14,2) not null default 0,
  objeto_imp          text,

  -- Interpretación (editable por quien revisa)
  kind                text not null default 'product'
                      check (kind in ('product','rental','service','other')),
  producto_id uuid references public.proveedores_productos (id) on delete set null,

  -- Para rentas y servicios: a qué obra se carga el gasto
  obra_id             uuid references public.obras (id) on delete set null,
  obra_sugerida_id    uuid references public.obras (id) on delete set null,
  obra_texto          text,                  -- lo que decía la descripción

  procesado           boolean not null default false,
  created_at          timestamptz not null default now()
);

comment on column public.proveedores_facturas_items.kind is
  'product = entra a stock · rental = equipo rentado, gasto directo a obra · service = otro servicio · other = comisión, flete, ajuste: ni stock ni obra.';
comment on column public.proveedores_facturas_items.obra_sugerida_id is
  'Obra que el sistema cree que es, leída del texto. La definitiva es obra_id y la confirma una persona.';

create index if not exists supplier_invoice_items_invoice_idx on public.proveedores_facturas_items (factura_id, line_no);
create index if not exists supplier_invoice_items_producto_idx on public.proveedores_facturas_items (producto_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 6) Historial de precios (uno por compra)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.proveedores_productos_precios (
  id                  uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.proveedores_productos (id) on delete cascade,
  factura_id          uuid references public.proveedores_facturas (id) on delete set null,
  factura_item_id     uuid references public.proveedores_facturas_items (id) on delete set null,
  fecha               timestamptz not null default now(),
  valor_unitario      numeric(14,4) not null,
  cantidad            numeric(14,4) not null default 0,
  created_at          timestamptz not null default now()
);

create index if not exists supplier_product_prices_producto_idx
  on public.proveedores_productos_precios (producto_id, fecha desc);

-- ─────────────────────────────────────────────────────────────────────────
-- 7) Envíos a obra (reparto del stock → egreso por obra)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.proveedores_envios (
  id            uuid primary key default gen_random_uuid(),
  folio         text unique,
  obra_id       uuid not null references public.obras (id) on delete restrict,
  fecha         date not null default current_date,
  status        text not null default 'borrador'
                check (status in ('borrador','enviado','cancelado')),
  notas         text,
  enviado_at    timestamptz,
  enviado_by    uuid references public.app_users (id),
  created_by    uuid references public.app_users (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.proveedores_envios is
  'Reparto de material comprado hacia una obra. Es el mecanismo para saber cuánto gastó cada obra: una factura de la semana puede repartirse entre 6 obras.';
comment on column public.proveedores_envios.status is
  'borrador = se está armando, no mueve stock. enviado = descuenta stock y cuenta como egreso de la obra.';

create table if not exists public.proveedores_envios_items (
  id                  uuid primary key default gen_random_uuid(),
  envio_id         uuid not null references public.proveedores_envios (id) on delete cascade,
  producto_id uuid not null references public.proveedores_productos (id) on delete restrict,
  cantidad            numeric(14,3) not null check (cantidad > 0),
  -- Costo congelado al momento del envío: el precio del producto cambia con
  -- cada compra, y el egreso de la obra no debe moverse después.
  costo_unitario      numeric(14,4) not null default 0,
  importe             numeric(14,2) not null default 0,
  notas               text,
  created_at          timestamptz not null default now()
);

comment on column public.proveedores_envios_items.costo_unitario is
  'Se congela al enviar. Si se recalculara con el precio actual, el egreso histórico de la obra cambiaría solo.';

create index if not exists supplier_dispatch_items_dispatch_idx on public.proveedores_envios_items (envio_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 8) Libro de movimientos de stock (fuente de verdad)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.proveedores_stock_movimientos (
  id                  uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.proveedores_productos (id) on delete cascade,
  tipo                text not null check (tipo in ('entrada','salida','ajuste')),
  -- Firmada: entrada positiva, salida negativa, ajuste cualquiera
  cantidad            numeric(14,3) not null,
  motivo              text,

  factura_item_id     uuid references public.proveedores_facturas_items (id) on delete set null,
  envio_item_id    uuid references public.proveedores_envios_items (id) on delete set null,
  obra_id             uuid references public.obras (id) on delete set null,

  created_by          uuid references public.app_users (id),
  created_at          timestamptz not null default now()
);

comment on table public.proveedores_stock_movimientos is
  'Libro de entradas y salidas. proveedores_productos.stock se deriva de aquí; nunca al revés.';
comment on column public.proveedores_stock_movimientos.cantidad is
  'Con signo: entrada > 0, salida < 0. Así el stock es una simple suma.';

create index if not exists supplier_stock_movements_producto_idx
  on public.proveedores_stock_movimientos (producto_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────
-- 9) Rentas de equipo (plataformas y maquinaria)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.proveedores_rentas (
  id                  uuid primary key default gen_random_uuid(),
  proveedor_id         uuid not null references public.proveedores (id) on delete restrict,
  factura_item_id     uuid references public.proveedores_facturas_items (id) on delete set null,
  obra_id             uuid references public.obras (id) on delete set null,

  descripcion         text not null,
  modelo              text,
  num_serie           text,
  num_interno         text,                  -- "RTZ-07", "PLS-34"
  contrato            text,

  periodo_inicio      date,
  periodo_fin         date,
  dias                integer,

  importe             numeric(14,2) not null default 0,
  status              text not null default 'activa'
                      check (status in ('activa','devuelta','vencida','cancelada')),
  notas               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.proveedores_rentas is
  'Equipo rentado: qué plataforma está en qué obra y hasta cuándo. Sale de las facturas de alquiler (clave SAT 7214xxxx), que traen modelo, serie, número interno y periodo.';

create index if not exists supplier_rentals_obra_idx on public.proveedores_rentas (obra_id, status);
create index if not exists supplier_rentals_vigencia_idx on public.proveedores_rentas (periodo_fin) where status = 'activa';
