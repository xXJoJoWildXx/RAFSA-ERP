"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AlertTriangle, Bell, CheckCircle2, Clock, X } from "lucide-react"
import { activityTone, formatEventType, type ActivityTone } from "@/lib/activityLog"

export type ActivityToastItem = {
  id: string
  event_type: string
  entity_label?: string | null
  actor_email?: string | null
}

/** Lo que pidió Jorge: 4 segundos en pantalla. */
export const TOAST_DURACION_MS = 4000
/** Más de tres apiladas tapan la pantalla; las de atrás se van descartando. */
export const TOAST_MAX_VISIBLES = 3

const TONOS: Record<ActivityTone, { barra: string; chip: string; icono: string }> = {
  info:    { barra: "#0174bd", chip: "bg-[#0174bd]/15", icono: "text-[#4da8e8]" },
  success: { barra: "#10b981", chip: "bg-emerald-500/15", icono: "text-emerald-400" },
  warning: { barra: "#f59e0b", chip: "bg-amber-500/15",   icono: "text-amber-400"   },
  danger:  { barra: "#ef4444", chip: "bg-red-500/15",     icono: "text-red-400"     },
}

function iconoDe(event_type: string, tono: ActivityTone) {
  if (event_type === "proveedor.factura_por_vencer" || event_type === "proveedor.factura_vence_hoy") return Clock
  if (tono === "success") return CheckCircle2
  if (tono === "danger" || tono === "warning") return AlertTriangle
  return Bell
}

/* ───────────────────────────────────────────
   Una tarjeta
   ─────────────────────────────────────────── */
function Toast({
  item,
  onDismiss,
}: {
  item: ActivityToastItem
  onDismiss: (id: string) => void
}) {
  const [saliendo, setSaliendo] = useState(false)
  const restanteRef = useRef(TOAST_DURACION_MS)
  const inicioRef = useRef<number>(Date.now())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const tono = activityTone(item.event_type)
  const estilo = TONOS[tono]
  const Icono = iconoDe(item.event_type, tono)

  const cerrar = useCallback(() => {
    setSaliendo(true)
    // Esperamos la animación de salida antes de quitarla del arreglo
    setTimeout(() => onDismiss(item.id), 200)
  }, [item.id, onDismiss])

  const arrancar = useCallback(() => {
    inicioRef.current = Date.now()
    timerRef.current = setTimeout(cerrar, restanteRef.current)
  }, [cerrar])

  const pausar = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    restanteRef.current = Math.max(0, restanteRef.current - (Date.now() - inicioRef.current))
  }, [])

  useEffect(() => {
    arrancar()
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [arrancar])

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={pausar}
      onMouseLeave={arrancar}
      className={[
        "pointer-events-auto relative overflow-hidden rounded-2xl",
        "bg-slate-800 border border-slate-700 shadow-2xl",
        saliendo ? "toast-sale" : "toast-entra",
      ].join(" ")}
    >
      {/* Filo de color según el tono */}
      <span
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ backgroundColor: estilo.barra }}
      />

      <div className="flex items-start gap-2.5 p-3 pl-4">
        <div className={`w-7 h-7 rounded-lg ${estilo.chip} flex items-center justify-center shrink-0 mt-0.5`}>
          <Icono className={`w-3.5 h-3.5 ${estilo.icono}`} />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-200 leading-snug">
            {formatEventType(item.event_type)}
          </p>
          {item.entity_label && (
            <p className="text-xs text-slate-400 truncate mt-0.5">{item.entity_label}</p>
          )}
          <p className="text-[10px] text-slate-500 truncate mt-1">
            {item.actor_email ?? "Sistema"}
          </p>
        </div>

        <button
          onClick={cerrar}
          aria-label="Descartar notificación"
          className="shrink-0 rounded-lg p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-700/60 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Barra que se vacía: deja ver cuánto le queda */}
      <span
        className="toast-barra absolute bottom-0 left-0 h-[2px] opacity-60"
        style={{ backgroundColor: estilo.barra }}
      />
    </div>
  )
}

/* ───────────────────────────────────────────
   La pila
   ─────────────────────────────────────────── */
export function ActivityToasts({
  items,
  onDismiss,
}: {
  items: ActivityToastItem[]
  onDismiss: (id: string) => void
}) {
  if (items.length === 0) return null

  return (
    <>
      <style>{`
        @keyframes toastEntra {
          from { opacity: 0; transform: translateX(16px) scale(0.98); }
          to   { opacity: 1; transform: translateX(0)    scale(1);    }
        }
        @keyframes toastSale {
          from { opacity: 1; transform: translateX(0)    scale(1);    }
          to   { opacity: 0; transform: translateX(16px) scale(0.98); }
        }
        @keyframes toastBarra {
          from { width: 100%; }
          to   { width: 0%;   }
        }
        .toast-entra { animation: toastEntra 200ms ease-out both; }
        .toast-sale  { animation: toastSale  200ms ease-in  both; }
        .toast-barra { animation: toastBarra ${TOAST_DURACION_MS}ms linear both; }
        /* Al pausar con el mouse se detiene también la barra */
        [role="status"]:hover .toast-barra { animation-play-state: paused; }

        @media (prefers-reduced-motion: reduce) {
          .toast-entra, .toast-sale, .toast-barra { animation: none; }
          .toast-barra { width: 0; }
        }
      `}</style>

      <div
        className="fixed top-[4.5rem] right-4 z-[60] flex flex-col gap-2 pointer-events-none
                   w-[min(22rem,calc(100vw-2rem))]"
      >
        {items.map((it) => (
          <Toast key={it.id} item={it} onDismiss={onDismiss} />
        ))}
      </div>
    </>
  )
}
