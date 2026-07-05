"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { supabase } from "@/lib/supabaseClient"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Building2, Users, FileText, Activity, TrendingUp, TrendingDown } from "lucide-react"
import { AdminLayout } from "@/components/admin-layout"
import { RoleGuard } from "@/lib/role-guard"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { formatEventType, entityBadgeClass, timeAgo } from "@/lib/activityLog"

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
  const [actividadesLog, setActividadesLog] = useState<any[]>([])

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

      const { data: activities } = await supabase
        .from("activity_log")
        .select("id, event_type, entity_type, entity_label, actor_email, created_at")
        .order("created_at", { ascending: false })
        .limit(8)
      setActividadesLog(activities ?? [])
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
      color: "text-blue-400",
      bgColor: "bg-blue-500/15",
      href: "/admin/projects",
    },
    {
      title: "Empleados activos",
      value: empleadosActivos.toString(),
      change: "+8%",
      trend: "up",
      icon: Users,
      color: "text-green-400",
      bgColor: "bg-green-500/15",
      href: "/admin/employees",
    },
    {
      title: "Documentos pendientes",
      value: "43",
      change: "-5%",
      trend: "down",
      icon: FileText,
      color: "text-orange-400",
      bgColor: "bg-orange-500/15",
    },
    {
      title: "Actividades recientes",
      value: "89",
      change: "+23%",
      trend: "up",
      icon: Activity,
      color: "text-purple-400",
      bgColor: "bg-purple-500/15",
    },
  ]

  return (
    <RoleGuard allowed={["admin" as UserRole]}>
      <AdminLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-100">
              Bienvenido de nuevo, {user?.display_name}
            </h1>
            <p className="text-slate-400 mt-1">Esto es lo que está pasando hoy.</p>
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
                  className={`bg-slate-800 border-slate-700 ${
                    clickable
                      ? "cursor-pointer transition-transform transition-shadow transition duration-200 hover:shadow-lg hover:-translate-y-1 hover:border-slate-600"
                      : ""
                  }`}
                >
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-400">{stat.title}</p>
                        <p className="text-3xl font-bold text-slate-100 mt-2">{stat.value}</p>
                        <div className="flex items-center gap-1 mt-2">
                          <TrendIcon
                            className={`w-4 h-4 ${
                              stat.trend === "up" ? "text-green-400" : "text-red-400"
                            }`}
                          />
                          <span
                            className={`text-sm font-medium ${
                              stat.trend === "up" ? "text-green-400" : "text-red-400"
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
          <Card className="bg-slate-800/60 border-slate-700/60">
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <div>
                <CardTitle className="text-slate-100 text-base font-semibold">Actividades recientes</CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">Últimas acciones registradas en el sistema</p>
              </div>
              <Link href="/admin/activities">
                <Button size="sm" variant="outline"
                  className="text-xs border-slate-600 text-slate-400 hover:text-slate-200 hover:bg-slate-700 bg-transparent cursor-pointer"
                >
                  Ver todas
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="pt-0">
              {actividadesLog.length === 0 ? (
                <div className="py-8 text-center text-slate-600 text-sm">Sin actividad registrada aún</div>
              ) : (
                <div className="space-y-0">
                  {actividadesLog.map((act, idx) => (
                    <div key={act.id}
                      className={`flex items-start gap-3 py-3 ${idx < actividadesLog.length - 1 ? "border-b border-slate-700/50" : ""}`}
                    >
                      {/* Avatar */}
                      <div className="w-8 h-8 rounded-full bg-[#0174bd]/20 border border-[#0174bd]/20 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-[#4da8e8]">
                          {(act.actor_email ?? "S")[0].toUpperCase()}
                        </span>
                      </div>
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <p className="text-sm text-slate-300 leading-snug">
                            <span className="font-semibold text-slate-100">{formatEventType(act.event_type)}</span>
                            {act.entity_label && (
                              <span className="text-slate-400"> — {act.entity_label}</span>
                            )}
                          </p>
                          <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${entityBadgeClass(act.entity_type)}`}>
                            {act.entity_type}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {act.actor_email ?? "Sistema"} · {timeAgo(act.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    </RoleGuard>
  )
}
