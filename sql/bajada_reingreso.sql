-- ═══════════════════════════════════════════════════════════════════════
-- Bajada con viaje redondo (salida + reingreso), cualquier día
-- ─────────────────────────────────────────────────────────────────────────
-- La bajada de un foráneo deja de asumirse como fin de semana (viernes+sábado)
-- y pasa a ser un rango: fecha de salida (next_bajada_date, ya existía) y
-- fecha de reingreso (next_reingreso_date, nueva). Al confirmar la bajada se
-- marca asistencia 'bajada' para todo el rango [salida, reingreso).
-- ═══════════════════════════════════════════════════════════════════════

-- 1) Fecha de reingreso del empleado
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS next_reingreso_date date NULL;

-- 2) Snapshot del reingreso en la notificación (para marcar el rango al confirmar)
ALTER TABLE public.bajada_notifications
  ADD COLUMN IF NOT EXISTS reingreso_date date NULL;

-- Nota: next_bajada_date (salida) ya existe en employees. La columna
-- obra_assignments.next_bajada_date no se usa por la UI (la fuente es employees).
