"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import { supabase } from "@/lib/supabaseClient"
import { useAuth } from "@/lib/auth-context"
import {
  ActivityToasts,
  TOAST_MAX_VISIBLES,
  type ActivityToastItem,
} from "@/components/activityToasts"

/*
  Por qué este provider vive en el layout raíz y no dentro de AdminLayout:

  Cada pantalla renderiza su propio <AdminLayout>, así que al navegar entre
  pantallas React desmonta uno y monta otro. Cualquier estado que viva ahí
  se pierde en la navegación — que es exactamente lo que hacía que el toast
  de "Empleado eliminado" se borrara al regresar al directorio.

  Aquí arriba el provider sobrevive a las navegaciones, y de paso la
  suscripción a activity_log se abre una sola vez por sesión en lugar de
  volver a abrirse en cada clic del menú.
*/

type ActivityStream = {
  /** Cambia con cada actividad nueva. La campanita lo observa para refrescarse. */
  lastEventAt: number
}

const ActivityStreamContext = createContext<ActivityStream>({ lastEventAt: 0 })

export function useActivityStream() {
  return useContext(ActivityStreamContext)
}

export function ActivityToastProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [toasts, setToasts] = useState<ActivityToastItem[]>([])
  const [lastEventAt, setLastEventAt] = useState(0)

  const descartar = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // Dependemos de user?.id y no del objeto: la revalidación de sesión
  // devuelve un objeto nuevo y volveríamos a suscribirnos de más.
  const userId = user?.id

  useEffect(() => {
    if (!userId) {
      setToasts([])
      return
    }

    const channel = supabase
      .channel("activity_log_stream")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_log" },
        (payload) => {
          setLastEventAt(Date.now())

          const fila = payload.new as Record<string, any> | null
          if (!fila?.id || !fila?.event_type) return

          setToasts((prev) => {
            if (prev.some((t) => t.id === fila.id)) return prev
            const nuevo: ActivityToastItem = {
              id: fila.id,
              event_type: fila.event_type,
              entity_label: fila.entity_label ?? null,
              actor_email: fila.actor_email ?? null,
            }
            return [nuevo, ...prev].slice(0, TOAST_MAX_VISIBLES)
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])

  const value = useMemo(() => ({ lastEventAt }), [lastEventAt])

  return (
    <ActivityStreamContext.Provider value={value}>
      {children}
      <ActivityToasts items={toasts} onDismiss={descartar} />
    </ActivityStreamContext.Provider>
  )
}
