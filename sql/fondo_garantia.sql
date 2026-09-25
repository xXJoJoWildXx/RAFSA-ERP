-- ═══════════════════════════════════════════════════════════════════════
-- Fondo de Garantía — columnas en la tabla obras
-- ═══════════════════════════════════════════════════════════════════════

-- Status flow: none → pending → invoiced → paid
--   none     = no se ha configurado fondo de garantía
--   pending  = monto definido, esperando factura del cliente
--   invoiced = factura recibida, esperando cobro
--   paid     = cobrado y comprobado, obra oficialmente completada

ALTER TABLE public.obras
  ADD COLUMN garantia_amount numeric(14, 2) NULL,
  ADD COLUMN garantia_status text NOT NULL DEFAULT 'none',
  ADD CONSTRAINT obras_garantia_status_check CHECK (
    garantia_status = ANY (ARRAY['none'::text, 'pending'::text, 'invoiced'::text, 'paid'::text])
  );

-- Los archivos (factura y comprobante de pago) se guardan en la tabla attachments:
--   ref_table = 'obra_garantia_factura'  → factura del fondo de garantía
--   ref_table = 'obra_garantia_pago'     → comprobante de pago del fondo
--   ref_id    = obra.id (en ambos casos)
--
-- Se reutiliza el bucket 'obra-facturas' para almacenar los archivos.
