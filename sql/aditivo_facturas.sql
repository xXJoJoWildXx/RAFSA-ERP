-- ═══════════════════════════════════════════════════════════════════════
-- Facturas de Aditivas
-- ─────────────────────────────────────────────────────────────────────────
-- Las aditivas (obra_billing_items type='aditivo') ahora también pueden tener
-- factura + pagos, reutilizando obra_facturas. Se hace la tabla polimórfica:
-- una factura cuelga de UNA estimación O de UNA aditiva (nunca ambas).
-- ═══════════════════════════════════════════════════════════════════════

-- 1) estimacion_id deja de ser obligatorio (las facturas de aditiva no lo usan)
ALTER TABLE public.obra_facturas
  ALTER COLUMN estimacion_id DROP NOT NULL;

-- 2) Nueva referencia opcional a la aditiva
ALTER TABLE public.obra_facturas
  ADD COLUMN IF NOT EXISTS aditivo_id uuid NULL
    REFERENCES public.obra_billing_items(id);

-- 3) A lo mucho una factura por aditiva
CREATE UNIQUE INDEX IF NOT EXISTS obra_facturas_aditivo_unique
  ON public.obra_facturas (aditivo_id)
  WHERE aditivo_id IS NOT NULL;

-- 4) La factura debe colgar de exactamente una: estimación O aditiva
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'obra_facturas_target_chk'
  ) THEN
    ALTER TABLE public.obra_facturas
      ADD CONSTRAINT obra_facturas_target_chk CHECK (
        (estimacion_id IS NOT NULL AND aditivo_id IS NULL) OR
        (estimacion_id IS NULL AND aditivo_id IS NOT NULL)
      );
  END IF;
END $$;

-- Nota: la restricción UNIQUE existente sobre estimacion_id permite múltiples
-- NULL (Postgres trata los NULL como distintos), así que las facturas de
-- aditiva (estimacion_id NULL) no chocan entre sí.
