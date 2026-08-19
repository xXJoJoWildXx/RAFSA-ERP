-- ═══════════════════════════════════════════════════════════════════════
-- Estimaciones y Facturas para obras
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Tabla de Estimaciones
-- Representa bloques de trabajo de la obra. Su completitud define el avance de trabajo.
create table public.obra_estimaciones (
  id uuid not null default gen_random_uuid(),
  obra_id uuid not null,
  number int not null,                          -- número secuencial (1, 2, 3…)
  description text not null,                    -- descripción del bloque de trabajo
  amount numeric(14, 2) not null default 0,     -- monto de esta estimación
  date_start date null,                         -- fecha de inicio estimada
  date_end date null,                           -- fecha de fin estimada
  status text not null default 'pending',       -- pending | completed
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint obra_estimaciones_pkey primary key (id),
  constraint obra_estimaciones_obra_id_fkey foreign key (obra_id) references obras(id) on delete cascade,
  constraint obra_estimaciones_created_by_fkey foreign key (created_by) references auth.users(id),
  constraint obra_estimaciones_unique_number unique (obra_id, number),
  constraint obra_estimaciones_status_check check (
    status = any (array['pending'::text, 'completed'::text])
  )
) tablespace pg_default;

create index idx_obra_estimaciones_obra on public.obra_estimaciones using btree (obra_id) tablespace pg_default;

-- 2. Tabla de Facturas
-- Cada factura pertenece a exactamente una estimación (1:1).
-- Subir factura = completar la estimación.
create table public.obra_facturas (
  id uuid not null default gen_random_uuid(),
  obra_id uuid not null,
  estimacion_id uuid not null,                  -- relación 1:1 con estimación
  invoice_number text not null,                 -- número de factura (CFDI)
  amount numeric(14, 2) not null default 0,     -- monto facturado
  date date not null default current_date,      -- fecha de emisión
  status text not null default 'pending',       -- pending | paid | partial
  amount_paid numeric(14, 2) not null default 0,-- acumulado pagado contra esta factura
  note text null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint obra_facturas_pkey primary key (id),
  constraint obra_facturas_obra_id_fkey foreign key (obra_id) references obras(id) on delete cascade,
  constraint obra_facturas_estimacion_id_fkey foreign key (estimacion_id) references obra_estimaciones(id) on delete cascade,
  constraint obra_facturas_created_by_fkey foreign key (created_by) references auth.users(id),
  constraint obra_facturas_unique_estimacion unique (estimacion_id), -- 1 factura por estimación
  constraint obra_facturas_status_check check (
    status = any (array['pending'::text, 'paid'::text, 'partial'::text])
  )
) tablespace pg_default;

create index idx_obra_facturas_obra on public.obra_facturas using btree (obra_id) tablespace pg_default;
create index idx_obra_facturas_estimacion on public.obra_facturas using btree (estimacion_id) tablespace pg_default;

-- 3. Agregar referencia opcional de factura en pagos (obra_state_accounts)
alter table public.obra_state_accounts
  add column factura_id uuid null,
  add constraint obra_state_accounts_factura_id_fkey
    foreign key (factura_id) references obra_facturas(id) on delete set null;

-- 4. RLS policies (mismas que las demás tablas de obra)
-- Estimaciones
alter table public.obra_estimaciones enable row level security;

create policy "Authenticated users can read obra_estimaciones"
  on public.obra_estimaciones for select to authenticated using (true);
create policy "Authenticated users can insert obra_estimaciones"
  on public.obra_estimaciones for insert to authenticated with check (true);
create policy "Authenticated users can update obra_estimaciones"
  on public.obra_estimaciones for update to authenticated using (true);
create policy "Authenticated users can delete obra_estimaciones"
  on public.obra_estimaciones for delete to authenticated using (true);

-- Facturas
alter table public.obra_facturas enable row level security;

create policy "Authenticated users can read obra_facturas"
  on public.obra_facturas for select to authenticated using (true);
create policy "Authenticated users can insert obra_facturas"
  on public.obra_facturas for insert to authenticated with check (true);
create policy "Authenticated users can update obra_facturas"
  on public.obra_facturas for update to authenticated using (true);
create policy "Authenticated users can delete obra_facturas"
  on public.obra_facturas for delete to authenticated using (true);

-- 5. Habilitar Realtime (opcional, si quieres live updates)
-- alter publication supabase_realtime add table obra_estimaciones;
-- alter publication supabase_realtime add table obra_facturas;

-- 6. Storage bucket para archivos de facturas (PDF/XML del CFDI)
-- Ejecutar en SQL si no existe:
-- insert into storage.buckets (id, name, public) values ('obra-facturas', 'obra-facturas', false);
