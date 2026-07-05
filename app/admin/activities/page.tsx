"use client"

import { useState, useEffect, useCallback } from "react"
import { AdminLayout } from "@/components/admin-layout"
import { RoleGuard } from "@/lib/role-guard"
import { supabase } from "@/lib/supabaseClient"
import { formatEventType, entityBadgeClass, timeAgo } from "@/lib/activityLog"
import { Activity, Search, ChevronLeft, ChevronRight } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"

type ActivityRow = {
  id: string
  event_type: string
  entity_type: string
  entity_id: string | null
  entity_label: string | null
  actor_email: string | null
  actor_user_id: string | null
  metadata: Record<string, any> | null
  created_at: string
}

const PAGE_SIZE = 20

export default function ActivitiesPage() {
  const [activities, setActivities] = useState<ActivityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [entityFilter, setEntityFilter] = useState<string>("all")
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)

  const fetchActivities = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from("activity_log")
        .select("id, event_type, entity_type, entity_id, entity_label, actor_email, actor_user_id, metadata, created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

      if (entityFilter !== "all") {
        query = query.eq("entity_type", entityFilter)
      }

      const { data, count, error } = await query

      if (error) {
        console.error("fetchActivities error:", error)
        setActivities([])
        setTotalCount(0)
      } else {
        let rows = (data ?? []) as ActivityRow[]

        if (search.trim()) {
          const q = search.trim().toLowerCase()
          rows = rows.filter(
            (r) =>
              (r.entity_label ?? "").toLowerCase().includes(q) ||
              (r.actor_email ?? "").toLowerCase().includes(q) ||
              formatEventType(r.event_type).toLowerCase().includes(q),
          )
        }

        setActivities(rows)
        setTotalCount(count ?? 0)
      }
    } finally {
      setLoading(false)
    }
  }, [page, entityFilter, search])

  useEffect(() => {
    fetchActivities()
  }, [fetchActivities])

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  function handlePrev() {
    if (page > 0) setPage((p) => p - 1)
  }

  function handleNext() {
    if (page < totalPages - 1) setPage((p) => p + 1)
  }

  function handleEntityFilterChange(val: string) {
    setEntityFilter(val)
    setPage(0)
  }

  function handleSearchChange(val: string) {
    setSearch(val)
    setPage(0)
  }

  const inputCls = "bg-slate-900 border-slate-700 text-slate-200 placeholder:text-slate-500 focus:border-[#0174bd]/60"
  const selectTriggerCls = "bg-slate-900 border-slate-700 text-slate-200"
  const selectContentCls = "bg-slate-800 border-slate-700 text-slate-200"

  return (
    <RoleGuard allowed={["admin"]}>
      <AdminLayout>
        <div className="space-y-6">
          {/* Header */}
          <div
            className="rounded-2xl border border-slate-700/60 p-6"
            style={{
              background: "linear-gradient(135deg, #1e293b 0%, #0f1e2e 50%, #162438 100%)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 20px rgba(0,0,0,0.3)",
            }}
          >
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-[#0174bd]/15">
                <Activity className="w-6 h-6 text-[#4da8e8]" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-100">Actividades del Sistema</h1>
                <p className="text-slate-400 text-sm mt-1">Historial completo de eventos</p>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              <Input
                placeholder="Buscar por descripción o actor..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className={`pl-9 ${inputCls}`}
              />
            </div>
            <Select value={entityFilter} onValueChange={handleEntityFilterChange}>
              <SelectTrigger className={`w-full sm:w-52 ${selectTriggerCls}`}>
                <SelectValue placeholder="Tipo de entidad" />
              </SelectTrigger>
              <SelectContent className={selectContentCls}>
                <SelectItem value="all">Todos los tipos</SelectItem>
                <SelectItem value="employee">Empleados</SelectItem>
                <SelectItem value="obra">Obras</SelectItem>
                <SelectItem value="empresa">Empresas</SelectItem>
                <SelectItem value="team">Equipo</SelectItem>
                <SelectItem value="billing">Facturación</SelectItem>
                <SelectItem value="document">Documentos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="rounded-2xl border border-slate-700/60 overflow-hidden bg-slate-800/60">
            {loading ? (
              <div className="py-16 text-center text-slate-500 text-sm">Cargando actividades...</div>
            ) : activities.length === 0 ? (
              <div className="py-16 text-center">
                <Activity className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">No se encontraron actividades</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/60 bg-slate-900/40">
                      <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide w-52">
                        Evento
                      </th>
                      <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        Descripción
                      </th>
                      <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide w-52 hidden md:table-cell">
                        Actor
                      </th>
                      <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide w-36 hidden sm:table-cell">
                        Fecha
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/40">
                    {activities.map((act) => (
                      <tr key={act.id} className="hover:bg-slate-700/20 transition-colors">
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full ${entityBadgeClass(act.entity_type)}`}
                          >
                            {formatEventType(act.event_type)}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-slate-300 max-w-xs truncate">
                          {act.entity_label ?? (
                            <span className="text-slate-600 italic">Sin descripción</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-slate-400 hidden md:table-cell">
                          {act.actor_email ?? (
                            <span className="text-slate-600 italic">Sistema</span>
                          )}
                        </td>
                        <td className="px-5 py-4 hidden sm:table-cell">
                          <span className="text-[#4da8e8] text-xs font-medium">
                            {timeAgo(act.created_at)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pagination */}
          {!loading && totalCount > PAGE_SIZE && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} de {totalCount} eventos
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrev}
                  disabled={page === 0}
                  className="border-slate-700 text-slate-400 hover:bg-slate-700/60 hover:text-slate-200 disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Anterior
                </Button>
                <span className="text-xs text-slate-500 px-2">
                  {page + 1} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNext}
                  disabled={page >= totalPages - 1}
                  className="border-slate-700 text-slate-400 hover:bg-slate-700/60 hover:text-slate-200 disabled:opacity-40"
                >
                  Siguiente
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </AdminLayout>
    </RoleGuard>
  )
}
