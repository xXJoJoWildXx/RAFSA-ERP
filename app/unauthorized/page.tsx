"use client"

/**
 * Pantalla de acceso denegado.
 *
 * Aquí se cae cuando alguien entra por URL a una sección que su rol no tiene
 * (lo manda RoleGuard). Antes se quedaba ahí para siempre: la sesión seguía
 * viva y la única salida era escribir otra URL a mano.
 *
 * Ahora se le avisa, se cierra la sesión y se le manda al login. El mensaje
 * se alcanza a leer —de ahí la espera— y el contador evita que parezca que
 * la pantalla se cerró sola por un error.
 */

import { useEffect, useRef, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { ShieldAlert } from "lucide-react"

const SEGUNDOS = 2

export default function UnauthorizedPage() {
  const { logout } = useAuth()
  const [restante, setRestante] = useState(SEGUNDOS)
  // Sin esto, un re-render podría disparar dos cierres de sesión
  const yaSalio = useRef(false)

  useEffect(() => {
    const cerrar = () => {
      if (yaSalio.current) return
      yaSalio.current = true
      void logout()
    }

    const tic = setInterval(() => setRestante((s) => Math.max(0, s - 1)), 1000)
    const salida = setTimeout(cerrar, SEGUNDOS * 1000)

    return () => {
      clearInterval(tic)
      clearTimeout(salida)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f172a] px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-700/60 bg-slate-800 px-8 py-7 text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-xl bg-red-500/15 border border-red-500/20 flex items-center justify-center">
          <ShieldAlert className="w-6 h-6 text-red-400" />
        </div>

        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold text-slate-100">Acceso no autorizado</h1>
          <p className="text-sm text-slate-400">
            No tienes permisos para ver esta sección de la aplicación.
          </p>
        </div>

        <div className="pt-1 space-y-3">
          <p className="text-xs text-slate-500">
            Por seguridad se cerrará tu sesión
            {restante > 0 ? ` en ${restante} ${restante === 1 ? "segundo" : "segundos"}…` : "…"}
          </p>

          {/* Barra que se vacía: deja claro que la espera es intencional */}
          <div className="h-1 rounded-full bg-slate-700/60 overflow-hidden">
            <div
              className="h-full bg-[#0174bd] rounded-full"
              style={{
                width: "100%",
                animation: `vaciar ${SEGUNDOS}s linear forwards`,
              }}
            />
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes vaciar {
          from { width: 100%; }
          to   { width: 0%; }
        }
      `}</style>
    </div>
  )
}
