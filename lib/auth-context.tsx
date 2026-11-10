"use client"

import type React from "react"
import { createContext, useContext, useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabaseClient"

type UserRole = "admin" | "user" | "worker" | "almacen"

interface User {
  id: string
  email: string
  role: UserRole
  display_name: string
  // puedes agregar name/avatar si los sacas de otra tabla
}

interface AuthContextType {
  user: User | null
  isLoading: boolean
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  // El id de la sesión viva, legible desde el callback de onAuthStateChange
  // (que se registra una sola vez y no vería el estado actualizado).
  const userIdRef = useRef<string | null>(null)
  useEffect(() => {
    userIdRef.current = user?.id ?? null
  }, [user])

  /**
   * Carga (o revalida) el usuario y su rol.
   *
   * `silent` existe por un motivo concreto: Supabase emite eventos de sesión
   * cada vez que la pestaña vuelve a estar visible (recupera y refresca el
   * token). Si esa revalidación prendiera `isLoading`, RoleGuard mostraría la
   * pantalla de carga y DESMONTARÍA toda la página — cerrando los popups y
   * tirando lo que el usuario llevaba capturado. En modo silencioso se
   * revalida igual (sigue cerrando la sesión de una cuenta desactivada), pero
   * sin tocar `isLoading`.
   */
  const loadUser = async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true
    if (!silent) setIsLoading(true)
    const done = () => { if (!silent) setIsLoading(false) }

    // 1) obtener usuario de Supabase Auth
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser()

    if (!authUser) {
      setUser(null)
      done()
      return
    }

    // 2) obtener rol desde tu tabla de perfiles/roles
    const { data: profile, error } = await supabase
      .from("app_users") // CAMBIA si tu tabla tiene otro nombre
      .select("role, display_name, is_active")
      .eq("id", authUser.id)
      .single()

    if (error || !profile) {
      // sin rol asignado
      setUser(null)
      done()
      return
    }

    // 3) cuenta desactivada (empleado inactivo) → se cierra la sesión activa.
    // Cubre el caso de un usuario que ya estaba dentro cuando lo dieron de baja.
    if (profile.is_active === false) {
      await supabase.auth.signOut()
      setUser(null)
      done()
      return
    }

    const mappedUser: User = {
      id: authUser.id,
      email: authUser.email ?? "",
      role: profile.role as UserRole,
      display_name: profile.display_name,
    }

    // Sólo publicar un objeto nuevo si de verdad cambió algo: así una
    // revalidación idéntica no cambia el valor del contexto y no dispara
    // re-renders ni efectos en toda la app.
    setUser((prev) =>
      prev &&
      prev.id === mappedUser.id &&
      prev.email === mappedUser.email &&
      prev.role === mappedUser.role &&
      prev.display_name === mappedUser.display_name
        ? prev
        : mappedUser,
    )
    done()
  }

  useEffect(() => {
    // cargar sesión al inicio
    loadUser()

    // Cambios de sesión. OJO con el tipo de evento: varios de estos se emiten
    // solos al volver a la pestaña, y tratarlos como un login nuevo hace que
    // la app se "refresque" y pierda lo que hubiera en pantalla.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        setUser(null)
        setIsLoading(false)
        return
      }

      // Revalidación de una sesión que ya teníamos → silenciosa.
      // Sólo un login de verdad (no había usuario) muestra la carga.
      const esRevalidacion =
        event === "TOKEN_REFRESHED" ||
        event === "USER_UPDATED" ||
        event === "INITIAL_SESSION" ||
        (event === "SIGNED_IN" && !!session?.user && session.user.id === userIdRef.current)

      loadUser({ silent: esRevalidacion })
    })

    return () => {
      subscription.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const logout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    // replace y no push: después de cerrar sesión, el botón "atrás" no debe
    // regresar a una pantalla de la app.
    router.replace("/login")
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return ctx
}
