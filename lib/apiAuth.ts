/*
  Autenticación y permisos para las rutas de /api.

  POR QUÉ EXISTE
  Las rutas de API usan la service role key, que se salta TODO el RLS. Eso
  está bien para operaciones que de verdad necesitan privilegios (borrados
  en cascada, lectura de datos bancarios), pero significa que la base ya no
  protege nada: si la ruta no verifica quién llama, cualquiera que alcance
  la URL ejecuta la operación, sin siquiera haber iniciado sesión.

  La sesión viaja en cookies, así que se lee con la llave ANÓNIMA y el
  cliente de @supabase/ssr — igual que en middleware.ts. El rol se consulta
  contra app_users, nunca se toma de lo que mande el cliente.
*/

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import type { AppRole } from "@/lib/permissions"

export type SesionApi = {
  userId: string
  email: string | null
  role: AppRole
}

/** Quién está llamando, o null si no hay sesión válida. */
export async function obtenerSesion(): Promise<SesionApi | null> {
  const almacen = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return almacen.getAll()
        },
        // En una ruta de API no reescribimos cookies: solo leemos la sesión.
        setAll() {},
      },
    },
  )

  // getUser() valida el token contra Supabase. No usar getSession(), que
  // confía en lo que traiga la cookie sin verificarlo.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: perfil } = await supabase
    .from("app_users")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle()

  // Un empleado dado de baja conserva la cookie hasta que expira; aquí se
  // corta igual que en el middleware.
  if (!perfil || perfil.is_active === false) return null

  return {
    userId: user.id,
    email: user.email ?? null,
    role: String(perfil.role).toLowerCase() as AppRole,
  }
}

type Resultado =
  | { sesion: SesionApi; error?: undefined }
  | { sesion?: undefined; error: NextResponse }

/**
 * Exige sesión y uno de los roles indicados.
 *
 *   const auth = await exigirRol(["admin"])
 *   if (auth.error) return auth.error
 *   // a partir de aquí auth.sesion existe
 */
export async function exigirRol(permitidos: AppRole[]): Promise<Resultado> {
  const sesion = await obtenerSesion()

  if (!sesion) {
    return {
      error: NextResponse.json(
        { error: "Necesitas iniciar sesión." },
        { status: 401 },
      ),
    }
  }

  if (!permitidos.includes(sesion.role)) {
    return {
      error: NextResponse.json(
        { error: "No tienes permiso para esta acción." },
        { status: 403 },
      ),
    }
  }

  return { sesion }
}
