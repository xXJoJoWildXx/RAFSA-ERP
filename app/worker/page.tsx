"use client"

import React, { useEffect, useState, useCallback } from "react"
import { useAuth } from "@/lib/auth-context"
import { supabase } from "@/lib/supabaseClient"
import { WorkerLayout } from "@/components/worker-layout"
import { RoleGuard } from "@/lib/role-guard"
import {
  Building2,
  ClipboardList,
  HardHat,
  Sun,
  Cloud,
  CloudRain,
  ArrowRightLeft,
  User,
  Check,
  X,
  Loader2,
  MapPin,
  ChevronDown,
} from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"

type ObraResumen = {
  id: string
  name: string
  status: string
  location_text: string | null
}

type IncomingTransfer = {
  id: string
  employee_id: string
  from_obra_id: string
  from_director_id: string
  to_director_id: string
  status: string
  note: string | null
  role_on_site: string | null
  created_at: string
  // joined data
  employee_name: string
  employee_position: string | null
  from_obra_name: string
  from_director_name: string
}

type MyObra = {
  id: string
  name: string
}

type Transfer = {
  id: string
  employee_id: string
  from_obra_id: string
  from_director_id: string
  to_director_id: string
  to_obra_id: string | null
  status: string
  note: string | null
  role_on_site: string | null
  created_at: string
  updated_at: string
}

function formatRoleName(role: string | null): string {
  if (!role) return "Sin puesto"
  return role
    .split("_")
    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

export default function WorkerDashboard() {
  const { user } = useAuth()
  const [obras, setObras] = useState<ObraResumen[]>([])
  const [loading, setLoading] = useState(true)
  const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null)

  // Transfer state
  const [incomingTransfers, setIncomingTransfers] = useState<IncomingTransfer[]>([])
  const [loadingTransfers, setLoadingTransfers] = useState(false)
  const [myObras, setMyObras] = useState<MyObra[]>([])
  const [acceptingId, setAcceptingId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [selectedObraForTransfer, setSelectedObraForTransfer] = useState<Record<string, string>>({})
  const [expandedTransfer, setExpandedTransfer] = useState<string | null>(null)
  const [dismissingTransfers, setDismissingTransfers] = useState<Record<string, string>>({}) // id → final status
  const [newTransferIds, setNewTransferIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function fetchMyObras() {
      if (!user) return

      // 1. Find the employee linked to this user
      const { data: employee } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", user.id)
        .single()

      if (!employee) {
        setLoading(false)
        return
      }

      setMyEmployeeId(employee.id)

      // 2. Get obra assignments for this employee
      const { data: assignments } = await supabase
        .from("obra_assignments")
        .select("obra_id")
        .eq("employee_id", employee.id)

      if (!assignments || assignments.length === 0) {
        setLoading(false)
        return
      }

      const obraIds = assignments.map((a: { obra_id: string }) => a.obra_id)

      // 3. Get obra details
      const { data: obrasData } = await supabase
        .from("obras")
        .select("id, name, status, location_text")
        .in("id", obraIds)
        .not("status", "eq", "closed")
        .order("name")

      setObras(obrasData ?? [])
      // Also store simplified list for transfer acceptance
      setMyObras((obrasData ?? []).map((o: ObraResumen) => ({ id: o.id, name: o.name })))
      setLoading(false)
    }

    fetchMyObras()
  }, [user])

  /* ─── Fetch incoming transfers ─── */
  const fetchIncomingTransfers = useCallback(async () => {
    if (!myEmployeeId) return
    setLoadingTransfers(true)

    // Get pending transfers directed to me
    const { data: transfers } = await supabase
      .from("worker_transfers")
      .select("*")
      .eq("to_director_id", myEmployeeId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })

    if (!transfers || transfers.length === 0) {
      setIncomingTransfers([])
      setLoadingTransfers(false)
      return
    }

    // Gather employee, obra, and director info
    const employeeIds = transfers.map((t: { employee_id: string }) => t.employee_id)
    const obraIds = transfers.map((t: { from_obra_id: string }) => t.from_obra_id)
    const directorIds = transfers.map((t: { from_director_id: string }) => t.from_director_id)

    const [employeesRes, obrasRes, directorsRes] = await Promise.all([
      supabase.from("employees").select("id, full_name, position_title").in("id", employeeIds),
      supabase.from("obras").select("id, name").in("id", obraIds),
      supabase.from("employees").select("id, full_name").in("id", directorIds),
    ])

    type EmpInfo = { id: string; full_name: string; position_title: string | null }
    type ObraInfo = { id: string; name: string }
    type DirInfo = { id: string; full_name: string }

    const empMap = new Map<string, EmpInfo>((employeesRes.data ?? []).map((e: EmpInfo) => [e.id, e]))
    const obraMap = new Map<string, ObraInfo>((obrasRes.data ?? []).map((o: ObraInfo) => [o.id, o]))
    const dirMap = new Map<string, DirInfo>((directorsRes.data ?? []).map((d: DirInfo) => [d.id, d]))

    const enriched: IncomingTransfer[] = transfers.map((t: Transfer) => {
      const emp = empMap.get(t.employee_id)
      const obra = obraMap.get(t.from_obra_id)
      const dir = dirMap.get(t.from_director_id)
      return {
        ...t,
        employee_name: emp?.full_name ?? "Desconocido",
        employee_position: emp?.position_title ?? null,
        from_obra_name: obra?.name ?? "Obra desconocida",
        from_director_name: dir?.full_name ?? "Director desconocido",
      }
    })

    setIncomingTransfers(enriched)
    setLoadingTransfers(false)
  }, [myEmployeeId])

  useEffect(() => {
    if (myEmployeeId) fetchIncomingTransfers()
  }, [myEmployeeId, fetchIncomingTransfers])

  /* ─── Realtime: listen for transfer changes (receiver side) ─── */
  useEffect(() => {
    if (!myEmployeeId) return

    const channel = supabase
      .channel(`transfers-receiver-${myEmployeeId}`)
      .on(
        "postgres_changes" as any,
        {
          event: "INSERT",
          schema: "public",
          table: "worker_transfers",
          filter: `to_director_id=eq.${myEmployeeId}`,
        },
        () => {
          // New transfer arrived — refetch to get enriched data
          fetchIncomingTransfers()
        }
      )
      .on(
        "postgres_changes" as any,
        {
          event: "UPDATE",
          schema: "public",
          table: "worker_transfers",
          filter: `to_director_id=eq.${myEmployeeId}`,
        },
        (payload: { new: Transfer }) => {
          const updated = payload.new
          if (updated.status === "cancelled") {
            // Sender cancelled — show "Cancelada" briefly, then remove
            setDismissingTransfers((prev: Record<string, string>) => ({
              ...prev,
              [updated.id]: "cancelled",
            }))
            setTimeout(() => {
              setIncomingTransfers((prev: IncomingTransfer[]) =>
                prev.filter((t: IncomingTransfer) => t.id !== updated.id)
              )
              setDismissingTransfers((prev: Record<string, string>) => {
                const next = { ...prev }
                delete next[updated.id]
                return next
              })
            }, 2500)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [myEmployeeId, fetchIncomingTransfers])

  /* ─── Accept transfer ─── */
  const acceptTransfer = async (transferId: string) => {
    const targetObraId = selectedObraForTransfer[transferId]
    if (!targetObraId) return

    setAcceptingId(transferId)
    const transfer = incomingTransfers.find((t: IncomingTransfer) => t.id === transferId)
    if (!transfer) { setAcceptingId(null); return }

    // 1. Create new obra_assignment in destination obra (preserve role_on_site)
    const { error: assignError } = await supabase
      .from("obra_assignments")
      .insert({
        obra_id: targetObraId,
        employee_id: transfer.employee_id,
        role_on_site: transfer.role_on_site,
      })

    if (assignError) { setAcceptingId(null); return }

    // 2. Remove old obra_assignment from origin obra
    await supabase
      .from("obra_assignments")
      .delete()
      .eq("obra_id", transfer.from_obra_id)
      .eq("employee_id", transfer.employee_id)

    // 3. Update transfer status
    await supabase
      .from("worker_transfers")
      .update({ status: "accepted", to_obra_id: targetObraId, updated_at: new Date().toISOString() })
      .eq("id", transferId)

    // 4. Refresh
    setIncomingTransfers((prev: IncomingTransfer[]) => prev.filter((t: IncomingTransfer) => t.id !== transferId))
    setAcceptingId(null)
  }

  /* ─── Reject transfer ─── */
  const rejectTransfer = async (transferId: string) => {
    setRejectingId(transferId)

    await supabase
      .from("worker_transfers")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .eq("id", transferId)

    setIncomingTransfers((prev: IncomingTransfer[]) => prev.filter((t: IncomingTransfer) => t.id !== transferId))
    setRejectingId(null)
  }

  const greeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return "Buenos días"
    if (hour < 18) return "Buenas tardes"
    return "Buenas noches"
  }

  const weatherIcon = () => {
    const hour = new Date().getHours()
    if (hour >= 6 && hour < 12) return <Sun className="w-5 h-5 text-amber-400" />
    if (hour >= 12 && hour < 18) return <Cloud className="w-5 h-5 text-slate-400" />
    return <CloudRain className="w-5 h-5 text-blue-400" />
  }

  const statusLabel = (status: string) => {
    const map: Record<string, { text: string; cls: string }> = {
      planned: { text: "Planeada", cls: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
      in_progress: { text: "En curso", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
      paused: { text: "Pausada", cls: "bg-amber-500/15 text-amber-400 border-amber-500/20" },
      closed: { text: "Cerrada", cls: "bg-slate-500/15 text-slate-400 border-slate-500/20" },
    }
    return map[status] ?? { text: status, cls: "bg-slate-500/15 text-slate-400 border-slate-500/20" }
  }

  const firstName = user?.display_name?.split(" ")[0] || "Director"

  const obrasActivas = obras.filter((o: ObraResumen) => o.status === "in_progress").length
  const obrasPausadas = obras.filter((o: ObraResumen) => o.status === "paused").length

  return (
    <RoleGuard allowed={["worker"]}>
      <WorkerLayout>
        <div className="space-y-5 max-w-2xl mx-auto">

          {/* ── Greeting ── */}
          <div
            className="rounded-2xl border border-slate-700/60 p-5"
            style={{
              background: "linear-gradient(135deg, #1e293b 0%, #0f1e2e 50%, #162438 100%)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 20px rgba(0,0,0,0.3)",
            }}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  {weatherIcon()}
                  <span className="text-xs text-slate-500 font-medium">
                    {new Date().toLocaleDateString("es-MX", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })}
                  </span>
                </div>
                <h1 className="text-2xl font-bold text-slate-100 mt-2">
                  {greeting()}, {firstName}
                </h1>
                <p className="text-slate-400 text-sm mt-1">
                  Aquí tienes un resumen de tus obras
                </p>
              </div>
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{
                  background: "linear-gradient(135deg, rgba(245,158,11,0.15), rgba(245,158,11,0.05))",
                  border: "1px solid rgba(245,158,11,0.2)",
                }}
              >
                <HardHat className="w-6 h-6 text-amber-500" />
              </div>
            </div>
          </div>

          {/* ── Quick Stats ── */}
          <div className="grid grid-cols-2 gap-3">
            <div
              className="rounded-2xl border border-slate-700/60 p-4"
              style={{ background: "linear-gradient(145deg, #1e293b, #172030)" }}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-100">{obrasActivas}</p>
                  <p className="text-xs text-slate-500 font-medium">En curso</p>
                </div>
              </div>
            </div>

            <div
              className="rounded-2xl border border-slate-700/60 p-4"
              style={{ background: "linear-gradient(145deg, #1e293b, #172030)" }}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
                  <ClipboardList className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-100">{obras.length}</p>
                  <p className="text-xs text-slate-500 font-medium">Total asignadas</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Incoming Transfers ── */}
          {incomingTransfers.length > 0 && (
            <div
              className="rounded-2xl border-2 border-amber-500/30 p-4"
              style={{
                background: "linear-gradient(135deg, #1e293b 0%, #1a1f2e 50%, #1e2636 100%)",
                boxShadow: "0 0 20px rgba(245,158,11,0.08)",
              }}
            >
              <h2 className="text-sm font-bold text-amber-400 mb-3 flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4" />
                Transferencias pendientes ({incomingTransfers.length})
              </h2>

              <div className="space-y-3">
                {incomingTransfers.map((transfer: IncomingTransfer) => {
                  const isExpanded = expandedTransfer === transfer.id
                  const selectedObra = selectedObraForTransfer[transfer.id]
                  const isDismissing = !!dismissingTransfers[transfer.id]
                  const dismissStatus = dismissingTransfers[transfer.id]

                  return (
                    <div
                      key={transfer.id}
                      className={cn(
                        "rounded-xl bg-slate-800/50 border overflow-hidden transition-all duration-500",
                        isDismissing && dismissStatus === "cancelled"
                          ? "border-red-500/30 bg-red-500/5"
                          : "border-slate-700/40",
                        isDismissing && "opacity-0 scale-95 translate-y-2"
                      )}
                      style={{ transitionDelay: isDismissing ? "1.5s" : "0s" }}
                    >
                      {/* Transfer info */}
                      <div className="p-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-amber-500/15 border border-amber-500/20 flex items-center justify-center shrink-0">
                            <User className="w-5 h-5 text-amber-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold text-slate-200 truncate">{transfer.employee_name}</p>
                            <p className="text-[11px] text-slate-500 truncate">
                              {formatRoleName(transfer.role_on_site || transfer.employee_position)} · de {transfer.from_obra_name}
                            </p>
                            <p className="text-[10px] text-slate-600 mt-0.5">
                              Enviado por {transfer.from_director_name}
                            </p>
                          </div>
                        </div>

                        {transfer.note && (
                          <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-slate-700/20 border border-slate-700/20">
                            <p className="text-[11px] text-slate-400 italic">&quot;{transfer.note}&quot;</p>
                          </div>
                        )}

                        {/* Obra selector */}
                        <div className="mt-3">
                          <button
                            onClick={() => setExpandedTransfer(isExpanded ? null : transfer.id)}
                            className={cn(
                              "w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-[12px] font-medium transition-all",
                              selectedObra
                                ? "bg-[#0174bd]/10 border-[#0174bd]/30 text-[#4da8e8]"
                                : "bg-slate-800/40 border-slate-700/30 text-slate-400"
                            )}
                          >
                            <span>
                              {selectedObra
                                ? myObras.find((o: MyObra) => o.id === selectedObra)?.name ?? "Obra"
                                : "Seleccionar obra destino..."}
                            </span>
                            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", isExpanded && "rotate-180")} />
                          </button>

                          {isExpanded && (
                            <div className="mt-1.5 space-y-1">
                              {myObras.map((obra: MyObra) => (
                                <button
                                  key={obra.id}
                                  onClick={() => {
                                    setSelectedObraForTransfer((prev: Record<string, string>) => ({ ...prev, [transfer.id]: obra.id }))
                                    setExpandedTransfer(null)
                                  }}
                                  className={cn(
                                    "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium transition-all active:scale-[0.98]",
                                    selectedObra === obra.id
                                      ? "bg-[#0174bd]/15 text-[#4da8e8]"
                                      : "bg-slate-800/30 text-slate-300 hover:bg-slate-700/30"
                                  )}
                                >
                                  <Building2 className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                                  <span className="truncate">{obra.name}</span>
                                  {selectedObra === obra.id && <Check className="w-3.5 h-3.5 ml-auto text-[#4da8e8]" />}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Dismissing banner */}
                      {isDismissing && (
                        <div className="px-3 pb-3">
                          <div className="flex items-center justify-center gap-2 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
                            <X className="w-3.5 h-3.5 text-red-400" />
                            <span className="text-[12px] font-semibold text-red-400">
                              Cancelada por el director
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      {!isDismissing && <div className="flex border-t border-slate-700/30">
                        <button
                          onClick={() => rejectTransfer(transfer.id)}
                          disabled={rejectingId === transfer.id}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[12px] font-semibold text-red-400 hover:bg-red-500/10 transition-colors active:scale-95 border-r border-slate-700/30"
                        >
                          {rejectingId === transfer.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <>
                              <X className="w-3.5 h-3.5" />
                              Rechazar
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => acceptTransfer(transfer.id)}
                          disabled={!selectedObra || acceptingId === transfer.id}
                          className={cn(
                            "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[12px] font-semibold transition-colors active:scale-95",
                            selectedObra
                              ? "text-emerald-400 hover:bg-emerald-500/10"
                              : "text-slate-600 cursor-not-allowed"
                          )}
                        >
                          {acceptingId === transfer.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              Aceptar
                            </>
                          )}
                        </button>
                      </div>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── My Obras (quick access) ── */}
          <div>
            <div className="flex items-center justify-between mb-3 px-1">
              <h2 className="text-base font-semibold text-slate-200">Mis Obras</h2>
              <Link
                href="/worker/obras"
                className="text-xs font-semibold text-[#4da8e8] hover:text-[#4da8e8]/80 transition-colors"
              >
                Ver todas →
              </Link>
            </div>

            {loading ? (
              <div className="flex flex-col items-center gap-3 py-12">
                <div className="w-8 h-8 border-4 border-[#0174bd] border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-slate-500">Cargando tus obras...</span>
              </div>
            ) : obras.length === 0 ? (
              <div
                className="rounded-2xl border border-slate-700/60 p-8 text-center"
                style={{ background: "linear-gradient(145deg, #1e293b, #172030)" }}
              >
                <Building2 className="w-10 h-10 text-slate-700 mx-auto" />
                <p className="text-sm font-medium text-slate-400 mt-3">
                  No tienes obras asignadas
                </p>
                <p className="text-xs text-slate-600 mt-1">
                  Contacta al administrador para que te asigne una obra
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {obras.slice(0, 4).map((obra: ObraResumen) => {
                  const status = statusLabel(obra.status)
                  return (
                    <Link key={obra.id} href={`/worker/obras/${obra.id}`}>
                      <div
                        className="group rounded-2xl border border-slate-700/60 p-4 transition-all duration-200 hover:border-[#0174bd]/40 hover:shadow-lg hover:shadow-black/30 active:scale-[0.98]"
                        style={{ background: "linear-gradient(145deg, #1e293b, #172030)" }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-slate-100 text-[15px] group-hover:text-white truncate">
                              {obra.name}
                            </h3>
                            {obra.location_text && (
                              <p className="text-xs text-slate-500 mt-1 truncate">
                                📍 {obra.location_text}
                              </p>
                            )}
                          </div>

                          <span className={`shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-full border ${status.cls}`}>
                            {status.text}
                          </span>
                        </div>
                      </div>
                    </Link>
                  )
                })}

                {obras.length > 4 && (
                  <Link href="/worker/obras">
                    <div className="text-center py-3 text-sm text-[#4da8e8] font-semibold hover:text-[#4da8e8]/80 transition-colors">
                      Ver las {obras.length} obras →
                    </div>
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      </WorkerLayout>
    </RoleGuard>
  )
}
