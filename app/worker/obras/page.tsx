"use client"

import React, { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { supabase } from "@/lib/supabaseClient"
import { WorkerLayout } from "@/components/worker-layout"
import { RoleGuard } from "@/lib/role-guard"
import { Building2, MapPin, Calendar, Search, Filter, ChevronRight } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"

type Obra = {
  id: string
  code: string | null
  name: string
  client_name: string | null
  location_text: string | null
  status: string
  start_date_planned: string | null
  start_date_actual: string | null
  end_date_planned: string | null
}

const STATUS_CONFIG: Record<string, { text: string; color: string; bg: string; border: string; dot: string }> = {
  planned: {
    text: "Planeada",
    color: "text-blue-400",
    bg: "bg-blue-500/15",
    border: "border-blue-500/20",
    dot: "bg-blue-400",
  },
  in_progress: {
    text: "En curso",
    color: "text-emerald-400",
    bg: "bg-emerald-500/15",
    border: "border-emerald-500/20",
    dot: "bg-emerald-400",
  },
  paused: {
    text: "Pausada",
    color: "text-amber-400",
    bg: "bg-amber-500/15",
    border: "border-amber-500/20",
    dot: "bg-amber-400",
  },
  closed: {
    text: "Cerrada",
    color: "text-slate-400",
    bg: "bg-slate-500/15",
    border: "border-slate-500/20",
    dot: "bg-slate-400",
  },
}

type StatusFilter = "all" | "in_progress" | "planned" | "paused" | "closed"

export default function WorkerObrasPage() {
  const { user } = useAuth()
  const [obras, setObras] = useState<Obra[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")

  useEffect(() => {
    async function fetchMyObras() {
      if (!user) return

      const { data: employee } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", user.id)
        .single()

      if (!employee) {
        setLoading(false)
        return
      }

      const { data: assignments } = await supabase
        .from("obra_assignments")
        .select("obra_id")
        .eq("employee_id", employee.id)

      if (!assignments || assignments.length === 0) {
        setLoading(false)
        return
      }

      const obraIds = assignments.map((a: { obra_id: string }) => a.obra_id)

      const { data: obrasData } = await supabase
        .from("obras")
        .select("id, code, name, client_name, location_text, status, start_date_planned, start_date_actual, end_date_planned")
        .in("id", obraIds)
        .order("name")

      setObras(obrasData ?? [])
      setLoading(false)
    }

    fetchMyObras()
  }, [user])

  // Filter obras
  const filtered = obras.filter((o: Obra) => {
    const matchesSearch =
      search === "" ||
      o.name.toLowerCase().includes(search.toLowerCase()) ||
      o.code?.toLowerCase().includes(search.toLowerCase()) ||
      o.location_text?.toLowerCase().includes(search.toLowerCase()) ||
      o.client_name?.toLowerCase().includes(search.toLowerCase())

    const matchesStatus = statusFilter === "all" || o.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const filterButtons: { value: StatusFilter; label: string }[] = [
    { value: "in_progress", label: "En curso" },
    { value: "planned", label: "Planeadas" },
    { value: "paused", label: "Pausadas" },
    { value: "all", label: "Todas" },
  ]

  const formatDate = (d: string | null) => {
    if (!d) return null
    return new Date(d + "T00:00:00").toLocaleDateString("es-MX", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
  }

  return (
    <RoleGuard allowed={["worker"]}>
      <WorkerLayout>
        <div className="space-y-4 max-w-2xl mx-auto">

          {/* ── Header ── */}
          <div>
            <h1 className="text-xl font-bold text-slate-100">Mis Obras</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              {loading ? "Cargando..." : `${obras.length} obra${obras.length !== 1 ? "s" : ""} asignada${obras.length !== 1 ? "s" : ""}`}
            </p>
          </div>

          {/* ── Search ── */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por nombre, código o ubicación..."
              value={search}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              className="w-full h-12 pl-11 pr-4 text-[14px] bg-slate-800/80 border border-slate-700/60 rounded-xl text-slate-200 placeholder:text-slate-600 outline-none focus:border-[#0174bd]/50 focus:ring-0 transition-colors"
            />
          </div>

          {/* ── Status Filter (horizontally scrollable chips) ── */}
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar">
            {filterButtons.map((f) => {
              const active = statusFilter === f.value
              const count = f.value === "all" ? obras.length : obras.filter((o: Obra) => o.status === f.value).length
              return (
                <button
                  key={f.value}
                  onClick={() => setStatusFilter(f.value)}
                  className={cn(
                    "shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-200 border active:scale-95",
                    active
                      ? "bg-[#0174bd]/15 border-[#0174bd]/30 text-[#4da8e8]"
                      : "bg-slate-800/60 border-slate-700/40 text-slate-400 hover:text-slate-300 hover:bg-slate-700/40"
                  )}
                >
                  {f.label}
                  <span className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center",
                    active ? "bg-[#0174bd]/20 text-[#4da8e8]" : "bg-slate-700/60 text-slate-500"
                  )}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* ── Obras List ── */}
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-16">
              <div className="w-8 h-8 border-4 border-[#0174bd] border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-slate-500">Cargando tus obras...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div
              className="rounded-2xl border border-slate-700/60 p-10 text-center"
              style={{ background: "linear-gradient(145deg, #1e293b, #172030)" }}
            >
              <Building2 className="w-12 h-12 text-slate-700 mx-auto" />
              <p className="text-sm font-medium text-slate-400 mt-4">
                {obras.length === 0
                  ? "No tienes obras asignadas"
                  : "No se encontraron obras con esos filtros"
                }
              </p>
              <p className="text-xs text-slate-600 mt-1">
                {obras.length === 0
                  ? "Contacta al administrador para que te asigne obras"
                  : "Intenta con otros términos de búsqueda"
                }
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {filtered.map((obra: Obra) => {
                const status = STATUS_CONFIG[obra.status] ?? STATUS_CONFIG.closed
                const startDate = formatDate(obra.start_date_actual || obra.start_date_planned)

                return (
                  <Link key={obra.id} href={`/worker/obras/${obra.id}`}>
                    <div
                      className="group rounded-2xl border-2 border-slate-700/60 p-4 transition-all duration-200 hover:border-[#0174bd]/30 hover:shadow-lg hover:shadow-black/30 active:scale-[0.98]"
                      style={{
                        background: "linear-gradient(145deg, #1e293b, #172030)",
                        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
                      }}
                    >
                      {/* Top row: name + status */}
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {obra.code && (
                              <span className="text-[10px] font-bold text-slate-500 bg-slate-700/50 px-1.5 py-0.5 rounded">
                                {obra.code}
                              </span>
                            )}
                          </div>
                          <h3 className="font-bold text-slate-100 text-base leading-tight group-hover:text-white">
                            {obra.name}
                          </h3>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className={cn(
                            "flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border",
                            status.bg, status.color, status.border
                          )}>
                            <span className={cn("w-1.5 h-1.5 rounded-full", status.dot)} />
                            {status.text}
                          </span>
                        </div>
                      </div>

                      {/* Details */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3">
                        {obra.location_text && (
                          <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            <MapPin className="w-3.5 h-3.5 text-slate-600" />
                            <span className="truncate max-w-[200px]">{obra.location_text}</span>
                          </div>
                        )}
                        {obra.client_name && (
                          <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            <Building2 className="w-3.5 h-3.5 text-slate-600" />
                            <span className="truncate max-w-[150px]">{obra.client_name}</span>
                          </div>
                        )}
                        {startDate && (
                          <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            <Calendar className="w-3.5 h-3.5 text-slate-600" />
                            <span>{startDate}</span>
                          </div>
                        )}
                      </div>

                      {/* Tap indicator */}
                      <div className="flex items-center justify-end mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[11px] text-[#4da8e8] font-semibold flex items-center gap-1">
                          Ver detalle <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Hide scrollbar for filter chips */}
        <style jsx global>{`
          .no-scrollbar::-webkit-scrollbar { display: none; }
          .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        `}</style>
      </WorkerLayout>
    </RoleGuard>
  )
}
