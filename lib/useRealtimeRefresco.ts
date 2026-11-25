"use client"

/**
 * Refresco en tiempo real de una pantalla.
 *
 * Se suscribe a los cambios de unas tablas y vuelve a consultar cuando algo
 * se mueve, sin que el usuario tenga que recargar. Está pensado para pantallas
 * que varias personas usan a la vez, como Proveedores: una registra un pago,
 * otra procesa una factura, y los dos ven el saldo correcto al momento.
 *
 * Tres cosas que resuelve y que un useEffect suelto no:
 *
 *   · AGRUPA. Procesar una factura de 30 renglones dispara decenas de eventos
 *     en milisegundos. Sin agrupar serían decenas de consultas; con la espera
 *     corta de abajo, es una sola.
 *
 *   · NO SE RECONECTA DE MÁS. La función de recarga suele venir de un
 *     useCallback que cambia de identidad seguido. Se guarda en una ref, así
 *     el canal se abre una vez y no en cada render.
 *
 *   · SE CALLA EN SEGUNDO PLANO. Si la pestaña no está visible no consulta;
 *     al volver, recarga una vez con lo que se haya acumulado.
 *
 * La base sólo emite cambios de las tablas incluidas en la publicación
 * supabase_realtime (ver sql/2026-11-24_proveedores_realtime.sql), y los
 * eventos respetan RLS: cada quien recibe sólo lo que ya podía leer.
 */

import { useEffect, useRef } from "react"
import { supabase } from "@/lib/supabaseClient"

/** Margen para juntar una ráfaga de eventos en una sola consulta. */
const ESPERA_MS = 300

export function useRealtimeRefresco(
  /** Nombre del canal. Debe ser único por pantalla e instancia. */
  canal: string,
  /** Tablas a vigilar. Son TABLAS, no vistas: una vista no emite eventos. */
  tablas: readonly string[],
  /** Qué hacer cuando algo cambió. Normalmente la función `cargar`. */
  onCambio: () => void,
  /** En false no se suscribe. Útil mientras no hay id que vigilar. */
  activo: boolean = true,
) {
  const onCambioRef = useRef(onCambio)
  onCambioRef.current = onCambio

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendienteRef = useRef(false)

  // Las tablas suelen venir como literal en cada render: se compara por
  // contenido para no reabrir el canal sin motivo.
  const claveTablas = tablas.join(",")

  useEffect(() => {
    if (!activo || !claveTablas) return

    const lista = claveTablas.split(",").filter(Boolean)

    const disparar = () => {
      if (typeof document !== "undefined" && document.hidden) {
        // En segundo plano no se consulta; queda anotado para el regreso.
        pendienteRef.current = true
        return
      }
      onCambioRef.current()
    }

    const agendar = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(disparar, ESPERA_MS)
    }

    let ch = supabase.channel(canal)
    for (const tabla of lista) {
      ch = ch.on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: tabla },
        agendar,
      )
    }
    ch.subscribe()

    // Al volver a la pestaña se recarga si algo pasó mientras no se veía.
    const alVolver = () => {
      if (!document.hidden && pendienteRef.current) {
        pendienteRef.current = false
        onCambioRef.current()
      }
    }
    document.addEventListener("visibilitychange", alVolver)

    return () => {
      document.removeEventListener("visibilitychange", alVolver)
      if (timerRef.current) clearTimeout(timerRef.current)
      supabase.removeChannel(ch)
    }
  }, [canal, claveTablas, activo])
}

/* ───────────────────────────────────────────
   Grupos de tablas del módulo de Proveedores

   Se declaran aquí, juntos, para que al tocar una pantalla sea evidente de
   qué depende. Las que leen vistas apuntan a las tablas que las alimentan:
     · proveedores_facturas_pago_v   ← facturas + pagos
     · proveedores_egresos_por_obra  ← envíos + renglones de factura
   ─────────────────────────────────────────── */

export const TABLAS_PROVEEDORES = {
  directorio: [
    "proveedores",
    "proveedores_facturas",
    "proveedores_facturas_pagos",
  ],
  facturas: [
    "proveedores_facturas",
    "proveedores_facturas_items",
    "proveedores_facturas_pagos",
  ],
  catalogo: [
    "proveedores_productos",
    "proveedores_productos_precios",
    "proveedores_stock_movimientos",
  ],
  envios: [
    "proveedores_envios",
    "proveedores_envios_items",
    "proveedores_productos",
    "proveedores_stock_movimientos",
  ],
  rentas: ["proveedores_rentas"],
  finanzas: [
    "proveedores_facturas",
    "proveedores_facturas_items",
    "proveedores_facturas_pagos",
    "proveedores_envios",
    "proveedores_envios_items",
  ],
  detalle: [
    "proveedores",
    "proveedores_facturas",
    "proveedores_facturas_pagos",
    "proveedores_productos",
  ],
} as const
