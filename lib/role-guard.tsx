"use client"

import type React from "react"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"

type Role = "admin" | "user" | "worker"

interface RoleGuardProps {
  allowed: Role[]
  children: React.ReactNode
}

export function RoleGuard({ allowed, children }: RoleGuardProps) {
  const { user, isLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (isLoading) return

    // No logueado
    if (!user) {
      router.replace("/login")
      return
    }

    // Logueado pero rol no permitido
    if (!allowed.includes(user.role)) {
      router.replace("/unauthorized") // página simple de "No tienes permiso"
      return
    }
  }, [user, isLoading, allowed, router])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        Cargando...
      </div>
    )
  }

  // Aquí sabemos que está logueado y que su rol está permitido
  return <>{children}</>
}
