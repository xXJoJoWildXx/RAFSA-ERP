"use client"

import type React from "react"
import { createContext, useContext, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabaseClient"

type UserRole = "admin" | "user" | "worker"

interface User {
  id: string
  email: string
  role: UserRole
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

  const loadUser = async () => {
    setIsLoading(true)

    // 1) obtener usuario de Supabase Auth
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser()

    if (!authUser) {
      setUser(null)
      setIsLoading(false)
      return
    }

    // 2) obtener rol desde tu tabla de perfiles/roles
    const { data: profile, error } = await supabase
      .from("app_users") // CAMBIA si tu tabla tiene otro nombre
      .select("role")
      .eq("id", authUser.id)
      .single()

    if (error || !profile) {
      // sin rol asignado
      setUser(null)
      setIsLoading(false)
      return
    }

    const mappedUser: User = {
      id: authUser.id,
      email: authUser.email ?? "",
      role: profile.role as UserRole,
    }

    setUser(mappedUser)
    setIsLoading(false)
  }

  useEffect(() => {
    // cargar sesión al inicio
    loadUser()

    // opcional: escuchar cambios de sesión (login/logout)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, _session) => {
      // cuando cambie la sesión, recargamos el user/role
      loadUser()
    })

    return () => {
      subscription.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const logout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    router.push("/login")
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
