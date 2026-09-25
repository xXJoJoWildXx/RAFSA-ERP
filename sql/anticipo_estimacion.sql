-- ═══════════════════════════════════════════════════════════════════════
-- Anticipo como Estimación
-- ─────────────────────────────────────────────────────────────────────────
-- El anticipo deja de ser un card/columnas aparte y pasa a ser la PRIMERA
-- estimación de la obra (marcada con is_anticipo = true). Si el contrato no
-- tiene anticipo, simplemente no se crea esa estimación.
--
-- Ventajas: reutiliza todo el flujo de estimaciones/facturas (subir factura,
-- marcar completado al asignarla, registrar pagos, adjuntar documento).
-- ═══════════════════════════════════════════════════════════════════════

-- 1) Bandera para marcar la estimación-anticipo
ALTER TABLE public.obra_estimaciones
  ADD COLUMN IF NOT EXISTS is_anticipo boolean NOT NULL DEFAULT false;

-- 2) A lo mucho un anticipo por obra
CREATE UNIQUE INDEX IF NOT EXISTS obra_estimaciones_one_anticipo
  ON public.obra_estimaciones (obra_id)
  WHERE is_anticipo;

-- ═══════════════════════════════════════════════════════════════════════
-- 3) Migración de anticipos existentes (card viejo → estimación-anticipo)
--    Toma las obras que ya tenían anticipo configurado en obras.anticipo_*
--    y crea su estimación-anticipo (+ factura si estaba facturado/pagado).
--    Nota: el ARCHIVO de la factura del anticipo viejo (bucket obra-facturas,
--    ruta anticipo/<obraId>-factura.ext) NO se re-vincula aquí porque la ruta
--    de storage difiere; si alguna obra migrada tenía factura subida, vuelve
--    a subirla desde el nuevo card. Los montos/estatus sí quedan correctos.
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  r record;
  est_id uuid;
BEGIN
  FOR r IN
    SELECT o.id AS obra_id,
           o.anticipo_amount,
           o.anticipo_pct,
           o.anticipo_status,
           o.anticipo_amount_paid,
           o.anticipo_invoice_number,
           o.anticipo_date
    FROM public.obras o
    WHERE o.anticipo_status IS NOT NULL
      AND o.anticipo_status <> 'none'
      AND COALESCE(o.anticipo_amount, 0) > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.obra_estimaciones e
        WHERE e.obra_id = o.id AND e.is_anticipo
      )
  LOOP
    INSERT INTO public.obra_estimaciones
      (obra_id, number, description, amount, status, is_anticipo)
    VALUES (
      r.obra_id,
      0,
      'Anticipo' || CASE
        WHEN COALESCE(r.anticipo_pct, 0) > 0
        THEN ' (' || trim(to_char(r.anticipo_pct, 'FM999990.##')) || '%)'
        ELSE '' END,
      r.anticipo_amount,
      CASE WHEN r.anticipo_status IN ('invoiced', 'paid') THEN 'completed' ELSE 'pending' END,
      true
    )
    RETURNING id INTO est_id;

    -- Si el anticipo ya estaba facturado o pagado, crear su factura
    IF r.anticipo_status IN ('invoiced', 'paid') THEN
      INSERT INTO public.obra_facturas
        (obra_id, estimacion_id, invoice_number, amount, date, status, amount_paid)
      VALUES (
        r.obra_id,
        est_id,
        COALESCE(NULLIF(r.anticipo_invoice_number, ''), 'ANTICIPO'),
        r.anticipo_amount,
        COALESCE(r.anticipo_date, CURRENT_DATE),
        CASE
          WHEN r.anticipo_status = 'paid' THEN 'paid'
          WHEN COALESCE(r.anticipo_amount_paid, 0) > 0 THEN 'partial'
          ELSE 'pending'
        END,
        COALESCE(r.anticipo_amount_paid, 0)
      );
    END IF;
  END LOOP;
END $$;

-- Las columnas obras.anticipo_* quedan sin uso (se pueden conservar o limpiar
-- después). garantia_* NO se toca.
