-- ═══════════════════════════════════════════════════════════════════════
-- Términos financieros del contrato — columnas en la tabla obras
-- ═══════════════════════════════════════════════════════════════════════
--
-- Estos datos se capturan al extraer con IA el contrato (obra_documents,
-- doc_type = 'contract') y se confirman por un admin antes de guardarse.
--
-- Mapeo hacia el tab "Estado de Cuenta":
--   contract_total_amount  → alimenta la Cotización (obra_billing_items)
--   anticipo_*             → card "Anticipo" (nuevo)
--   garantia_* (ya existen)→ card "Fondo de Garantía"
--   saldo_*                → solo se almacena (sin UI ni cálculos por ahora)
--
-- Los importes se guardan SIN IVA (base del precio alzado), tal como vienen
-- redactados en el contrato ("$X.00 pesos ... más el IVA correspondiente").
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.obras
  -- Monto total del contrato (precio alzado, base sin IVA)
  ADD COLUMN IF NOT EXISTS contract_total_amount numeric(14, 2) NULL,

  -- Anticipo (típicamente 30%)
  ADD COLUMN IF NOT EXISTS anticipo_pct            numeric(5, 2) NULL,
  ADD COLUMN IF NOT EXISTS anticipo_amount         numeric(14, 2) NULL,
  ADD COLUMN IF NOT EXISTS anticipo_status         text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS anticipo_amount_paid    numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS anticipo_invoice_number text NULL,
  ADD COLUMN IF NOT EXISTS anticipo_date           date NULL,

  -- Saldo restante (típicamente 70%) — se almacena, no se usa aún
  ADD COLUMN IF NOT EXISTS saldo_pct    numeric(5, 2) NULL,
  ADD COLUMN IF NOT EXISTS saldo_amount numeric(14, 2) NULL,

  -- Porcentaje del fondo de garantía (complementa garantia_amount / garantia_status)
  ADD COLUMN IF NOT EXISTS garantia_pct numeric(5, 2) NULL;

-- Status flow del anticipo (mismo patrón que garantia_status):
--   none     = no configurado
--   pending  = monto definido, esperando factura
--   invoiced = factura recibida, esperando cobro
--   paid     = cobrado (registrado en obra_state_accounts como 'advance')
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'obras_anticipo_status_check'
  ) THEN
    ALTER TABLE public.obras
      ADD CONSTRAINT obras_anticipo_status_check CHECK (
        anticipo_status = ANY (ARRAY['none'::text, 'pending'::text, 'invoiced'::text, 'paid'::text])
      );
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- Archivos relacionados (se guardan en la tabla attachments, bucket 'obra-facturas'):
--   ref_table = 'obra_anticipo_factura'  → factura del anticipo
--   ref_table = 'obra_anticipo_pago'     → comprobante de pago del anticipo
--   ref_id    = obra.id (en ambos casos)
--
-- El JSON crudo extraído por la IA se conserva en:
--   obra_documents.ai_extracted_json  (del documento doc_type = 'contract')
-- ═══════════════════════════════════════════════════════════════════════
