"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { supabase } from "@/lib/supabaseClient"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Building2, Users, FileText, Activity, TrendingUp, TrendingDown } from "lucide-react"
import { AdminLayout } from "@/components/admin-layout"
import { RoleGuard } from "@/lib/role-guard"

type UserRole = "admin" | "user" | "worker"

interface StatCard {
  title: string
  value: string
  change: string
  trend: "up" | "down"
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  color: string
  bgColor: string
  href?: string
}

export default function AdminDashboard() {
  const { user } = useAuth()
  const router = useRouter()

  const [obrasActivas, setObrasActivas] = useState<number>(0)
  const [empleadosActivos, setEmpleadosActivos] = useState<number>(0)

  useEffect(() => {
    const fetchStats = async () => {
      // Obras activas → excluir status "closed"
      const { data: obras } = await supabase
        .from("obras")
        .select("id")
        .not("status", "eq", "closed")

      // Empleados activos → solo status "active"
      const { data: empleados } = await supabase
        .from("employees")
        .select("id")
        .eq("status", "active")

      setObrasActivas(obras?.length ?? 0)
      setEmpleadosActivos(empleados?.length ?? 0)
    }

    fetchStats()
  }, [])

  const stats: StatCard[] = [
    {
      title: "Obras activas",
      value: obrasActivas.toString(),
      change: "+12%",
      trend: "up",
      icon: Building2,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      href: "/admin/projects",
    },
    {
      title: "Empleados activos",
      value: empleadosActivos.toString(),
      change: "+8%",
      trend: "up",
      icon: Users,
      color: "text-green-600",
      bgColor: "bg-green-50",
      href: "/admin/employees",
    },
    {
      title: "Documentos pendientes",
      value: "43",
      change: "-5%",
      trend: "down",
      icon: FileText,
      color: "text-orange-600",
      bgColor: "bg-orange-50",
    },
    {
      title: "Actividades recientes",
      value: "89",
      change: "+23%",
      trend: "up",
      icon: Activity,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
    },
  ]

  const actividadesRecientes = [
    {
      id: 1,
      user: "Sarah Johnson",
      action: "subió un documento",
      target: "Planes Q4.pdf",
      time: "hace 5 minutos",
    },
    {
      id: 2,
      user: "Mike Chen",
      action: "actualizó el estado de la obra",
      target: "Plaza Centro",
      time: "hace 1 hora",
    },
    {
      id: 3,
      user: "Emily Davis",
      action: "completó una tarea",
      target: "Inspección de seguridad",
      time: "hace 2 horas",
    },
    {
      id: 4,
      user: "James Wilson",
      action: "agregó un comentario",
      target: "Proyecto Puente del Puerto",
      time: "hace 3 horas",
    },
  ]

  return (
    <RoleGuard allowed={["admin" as UserRole]}>
      <AdminLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              Bienvenido de nuevo, {user?.display_name}
            </h1>
            <p className="text-slate-600 mt-1">Esto es lo que está pasando hoy.</p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {stats.map((stat) => {
              const Icon = stat.icon
              const TrendIcon = stat.trend === "up" ? TrendingUp : TrendingDown

              const clickable = Boolean(stat.href)

              return (
                <Card
                  key={stat.title}
                  onClick={() => stat.href && router.push(stat.href)}
                  className={
                    clickable
                      ? "cursor-pointer transition-transform transition-shadow transition duration-200 hover:shadow-lg hover:-translate-y-1 "
                      : ""
                  }
                >
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-600">{stat.title}</p>
                        <p className="text-3xl font-bold text-slate-900 mt-2">{stat.value}</p>
                        <div className="flex items-center gap-1 mt-2">
                          <TrendIcon
                            className={`w-4 h-4 ${
                              stat.trend === "up" ? "text-green-600" : "text-red-600"
                            }`}
                          />
                          <span
                            className={`text-sm font-medium ${
                              stat.trend === "up" ? "text-green-600" : "text-red-600"
                            }`}
                          >
                            {stat.change}
                          </span>
                          <span className="text-sm text-slate-500">vs mes anterior</span>
                        </div>
                      </div>
                      <div className={`${stat.bgColor} ${stat.color} p-3 rounded-lg`}>
                        <Icon className="w-6 h-6" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Actividades recientes */}
          <Card>
            <CardHeader>
              <CardTitle>Actividades recientes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {actividadesRecientes.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-start gap-4 pb-4 border-b last:border-0 last:pb-0"
                  >
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-semibold text-blue-600">
                        {activity.user
                          .split(" ")
                          .map((n) => n[0])
                          .join("")}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-900">
                        <span className="font-semibold">{activity.user}</span>{" "}
                        {activity.action}{" "}
                        <span className="font-semibold">{activity.target}</span>
                      </p>
                      <p className="text-xs text-slate-500 mt-1">{activity.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    </RoleGuard>
  )
}
