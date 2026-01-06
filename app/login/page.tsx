"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Building2, Mail, Lock } from "lucide-react"
import { supabase } from "@/lib/supabaseClient"

type UserRole = "admin" | "user" | "worker"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    try {
      // 1) Login contra Supabase Auth
      const { data, error: signError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signError) {
        setError(signError.message || "Error al iniciar sesión")
        return
      }

      const authUser = data.user
      if (!authUser) {
        setError("No se pudo obtener el usuario autenticado")
        return
      }

      // 2) Leer el rol desde tu tabla interna (app_users)
      const { data: profile, error: profileError } = await supabase
        .from("app_users") // cambia si tu tabla tiene otro nombre
        .select("role")
        .eq("id", authUser.id)
        .single()

      if (profileError || !profile) {
        setError("Tu cuenta no tiene un rol asignado. Contacta al administrador.")
        return
      }

      const role = profile.role as UserRole

      // 3) Redirigir según el rol
      if (role === "admin") {
        router.push("/admin")
      } else if (role === "user") {
        router.push("/employee")
      } else if (role === "worker") {
        router.push("/obras")
      } else {
        // fallback por si acaso
        router.push("/dashboard")
      }
    } catch (err) {
      console.error(err)
      setError("Error al conectar con el servidor. Intenta de nuevo.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-slate-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <CardTitle className="text-2xl">RAFSA</CardTitle>
            <CardDescription className="text-base mt-2">
              Sign in to access your dashboard
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="your.email@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="password"
                  type="password"
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Signing in..." : "Sign in"}
            </Button>

            <div className="text-xs text-center text-slate-500 space-y-1">
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
