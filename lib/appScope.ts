"use client"

/**
 * Prefijo de ruta del panel en el que se está navegando.
 *
 * /admin y /user renderizan EXACTAMENTE los mismos componentes; lo único que
 * cambia es bajo qué prefijo viven. Para que un enlace interno no mande al
 * personal de administración al panel de admin, los enlaces se arman con
 * `useBasePath()` en vez de escribir "/admin/..." a mano.
 *
 * Ojo: esto es sólo cosmético, decide URLs. Lo que alguien PUEDE hacer se
 * decide por su rol en lib/permissions.ts, nunca por la ruta.
 */

import { usePathname } from "next/navigation"

export type AppScope = "admin" | "user"

export function useAppScope(): AppScope {
  const pathname = usePathname() || ""
  return pathname === "/user" || pathname.startsWith("/user/") ? "user" : "admin"
}

/** "/admin" o "/user", para construir enlaces internos del panel. */
export function useBasePath(): string {
  return useAppScope() === "user" ? "/user" : "/admin"
}
