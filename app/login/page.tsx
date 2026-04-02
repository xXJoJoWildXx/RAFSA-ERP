"use client"

import type React from "react"

import Image from "next/image"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Mail, Lock, Eye, EyeOff, ShieldCheck, BriefcaseBusiness } from "lucide-react"
import { supabase } from "@/lib/supabaseClient"

type UserRole = "admin" | "user" | "worker"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    try {
      const { data, error: signError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (signError) {
        setError(signError.message || "Error al iniciar sesión.")
        return
      }

      const authUser = data.user

      if (!authUser) {
        setError("No se pudo obtener el usuario autenticado.")
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from("app_users")
        .select("role")
        .eq("id", authUser.id)
        .single()

      if (profileError || !profile) {
        setError("Tu cuenta no tiene un rol asignado. Contacta al administrador.")
        return
      }

      const role = profile.role as UserRole

      if (role === "admin") {
        router.push("/admin")
      } else if (role === "user") {
        router.push("/employee")
      } else if (role === "worker") {
        router.push("/obras")
      } else {
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
    <div className="relative min-h-screen overflow-hidden bg-[#f4f7fa]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(1,116,189,0.16),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(0,51,83,0.12),transparent_28%)]" />
      <div className="absolute inset-0 bg-gradient-to-br from-white via-[#f4f7fa] to-[#dfe8f1]" />

      <div className="relative z-10 grid min-h-screen grid-cols-1 lg:grid-cols-2">
        <div className="hidden lg:flex relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-[#003353] via-[#375b8c] to-[#0174bd]" />
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.10),transparent_35%,rgba(255,255,255,0.04)_60%,transparent_100%)]" />

          <div className="relative flex h-full w-full flex-col justify-between p-10 xl:p-14 text-white">
            <div className="max-w-md -mt-5">
              <div className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm backdrop-blur-sm">
                Plataforma empresarial RAFSA
              </div>

              <div className="-mt-5">
                <div className="relative h-20 w-72 xl:h-24 xl:w-80">
                  <Image
                    src="/brand/rafsa-logo.png"
                    alt="RAFSA Industrial Coatings"
                    fill
                    priority
                    className="object-contain object-left brightness-0 invert"
                  />
                </div>

                <h1 className=" text-4xl xl:text-5xl font-semibold leading-tight">
                  Gestión interna más clara, moderna y eficiente.
                </h1>

                <p className="mt-5 max-w-xl text-base xl:text-lg text-white/85 leading-relaxed">
                  Accede al ERP corporativo para administrar empleados, obras,
                  documentos y procesos clave de RAFSA desde un solo lugar.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
                <ShieldCheck className="h-5 w-5 text-white" />
                <p className="mt-3 text-sm font-medium">Acceso seguro</p>
                <p className="mt-1 text-xs text-white/75">
                  Inicio de sesión conectado con Supabase Auth y roles internos.
                </p>
              </div>

              <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
                <BriefcaseBusiness className="h-5 w-5 text-white" />
                <p className="mt-3 text-sm font-medium">Operación centralizada</p>
                <p className="mt-1 text-xs text-white/75">
                  Consulta y administra los módulos clave del sistema.
                </p>
              </div>

              <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
                <Mail className="h-5 w-5 text-white" />
                <p className="mt-3 text-sm font-medium">Soporte administrativo</p>
                <p className="mt-1 text-xs text-white/75">
                  Si tienes problemas de acceso, contacta al administrador.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative flex items-center justify-center p-4 sm:p-6 lg:p-10">
          <Card className="w-full max-w-md border-slate-200/80 bg-white/90 shadow-2xl shadow-slate-300/30 backdrop-blur-sm">
            <CardHeader className="space-y-5 text-center">
              <div className="mx-auto flex flex-col items-center">
                <div className="relative h-16 w-44 sm:h-20 sm:w-56">
                  <Image
                    src="/brand/rafsa-logo.png"
                    alt="RAFSA Industrial Coatings"
                    fill
                    priority
                    className="object-contain"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <CardTitle className="text-2xl sm:text-3xl font-semibold text-[#003353]">
                  Bienvenido
                </CardTitle>
                <CardDescription className="text-sm sm:text-base text-slate-600">
                  Inicia sesión para acceder al sistema interno de RAFSA.
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-slate-700">
                    Correo electrónico
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="tu.correo@empresa.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-11 border-slate-200 pl-10 focus-visible:ring-[#0174bd]"
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-slate-700">
                    Contraseña
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Ingresa tu contraseña"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-11 border-slate-200 pl-10 pr-11 focus-visible:ring-[#0174bd]"
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-[#003353]"
                      aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {error ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                ) : null}

                <Button
                  type="submit"
                  disabled={isLoading}
                  className="h-11 w-full bg-[#0174bd] text-white transition hover:bg-[#003353] disabled:opacity-70"
                >
                  {isLoading ? "Ingresando..." : "Iniciar sesión"}
                </Button>

                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-xs text-slate-500">
                  Acceso exclusivo para personal autorizado de RAFSA Industrial Coatings.
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
