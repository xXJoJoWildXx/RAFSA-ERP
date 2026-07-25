"use client"

import React, { useEffect, useState, useCallback, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { supabase } from "@/lib/supabaseClient"
import { WorkerLayout } from "@/components/worker-layout"
import { RoleGuard } from "@/lib/role-guard"
import {
  ArrowLeft,
  Building2,
  MapPin,
  Calendar,
  Users,
  Phone,
  User,
  Loader2,
  AlertTriangle,
  Check,
  X,
  Clock,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  CalendarCheck,
  ArrowRightLeft,
  Send,
  XCircle,
  Clock3,
  CheckCircle2,
  Ban,
  HardHat,
} from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"

/* ─── Types ─── */

type ObraDetail = {
  id: string
  code: string | null
  name: string
  client_name: string | null
  location_text: string | null
  status: string
  start_date_planned: string | null
  start_date_actual: string | null
  end_date_planned: string | null
  end_date_actual: string | null
  notes: string | null
}

type TeamMember = {
  id: string
  full_name: string
  position_title: string | null
  phone: string | null
  role_on_site: string | null
}

type AttendanceStatus = "present" | "absent" | "half_day" | "justified" | "bajada"

type AttendanceRecord = {
  id: string
  employee_id: string
  date: string
  status: AttendanceStatus
  note: string | null
}

type ViewMode = "day" | "week"

type TransferStatus = "pending" | "accepted" | "cancelled" | "rejected"

type Transfer = {
  id: string
  employee_id: string
  from_obra_id: string
  from_director_id: string
  to_director_id: string
  to_obra_id: string | null
  status: TransferStatus
  note: string | null
  role_on_site: string | null
  created_at: string
  updated_at: string
}

type DirectorOption = {
  id: string
  full_name: string
  user_id: string
}

/* ─── Helpers ─── */

const STATUS_CONFIG: Record<string, { text: string; color: string; bg: string; border: string; dot: string }> = {
  planned: { text: "Planeada", color: "text-blue-400", bg: "bg-blue-500/15", border: "border-blue-500/20", dot: "bg-blue-400" },
  in_progress: { text: "En curso", color: "text-emerald-400", bg: "bg-emerald-500/15", border: "border-emerald-500/20", dot: "bg-emerald-400" },
  paused: { text: "Pausada", color: "text-amber-400", bg: "bg-amber-500/15", border: "border-amber-500/20", dot: "bg-amber-400" },
  closed: { text: "Cerrada", color: "text-slate-400", bg: "bg-slate-500/15", border: "border-slate-500/20", dot: "bg-slate-400" },
}

const ATTENDANCE_CONFIG: Record<AttendanceStatus, { label: string; short: string; icon: typeof Check; color: string; bg: string; border: string }> = {
  present: { label: "Asistió", short: "A", icon: Check, color: "text-emerald-400", bg: "bg-emerald-500/20", border: "border-emerald-500/30" },
  absent: { label: "Falta", short: "F", icon: X, color: "text-red-400", bg: "bg-red-500/20", border: "border-red-500/30" },
  half_day: { label: "Medio día", short: "½", icon: Clock, color: "text-amber-400", bg: "bg-amber-500/20", border: "border-amber-500/30" },
  justified: { label: "Justificada", short: "J", icon: CalendarCheck, color: "text-blue-400", bg: "bg-blue-500/20", border: "border-blue-500/30" },
  bajada: { label: "Fecha de bajada", short: "FB", icon: CalendarDays, color: "text-purple-400", bg: "bg-purple-500/20", border: "border-purple-500/30" },
}

const DAYS_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]

function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return date
}

function getWeekDates(monday: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(d.getDate() + i)
    return d.toISOString().split("T")[0]
  })
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00")
  return d.getDate().toString()
}

function formatMonthYear(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00")
  return d.toLocaleDateString("es-MX", { month: "long", year: "numeric" })
}

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0]
}

function formatRoleName(role: string | null): string {
  if (!role) return "Sin puesto"
  return role
    .split("_")
    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

/* ─── Main Component ─── */

export default function WorkerObraDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuth()

  const [obra, setObra] = useState<ObraDetail | null>(null)
  const [team, setTeam] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Attendance state
  const [viewMode, setViewMode] = useState<ViewMode>("day")
  const [currentMonday, setCurrentMonday] = useState<Date>(() => getMonday(new Date()))
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([])
  const [loadingAttendance, setLoadingAttendance] = useState(false)
  const [savingCell, setSavingCell] = useState<string | null>(null) // "employeeId-date"

  // Transfer state
  const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null)
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [transferTarget, setTransferTarget] = useState<TeamMember | null>(null)
  const [directors, setDirectors] = useState<DirectorOption[]>([])
  const [selectedDirector, setSelectedDirector] = useState<string | null>(null)
  const [transferNote, setTransferNote] = useState("")
  const [sendingTransfer, setSendingTransfer] = useState(false)
  const [loadingDirectors, setLoadingDirectors] = useState(false)
  const [cancellingTransfer, setCancellingTransfer] = useState<string | null>(null)
  const [dismissingTransfers, setDismissingTransfers] = useState<Record<string, TransferStatus>>({}) // transferId → final status shown before removal

  const today = toDateStr(new Date())
  const weekDates = useMemo(() => getWeekDates(currentMonday), [currentMonday])
  const isCurrentWeek = weekDates.includes(today)

  /* ─── Fetch obra + team ─── */
  useEffect(() => {
    async function fetchObraDetail() {
      if (!user || !id) return

      const { data: employee } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", user.id)
        .single()

      if (!employee) { setNotFound(true); setLoading(false); return }

      setMyEmployeeId(employee.id)

      const { data: assignment } = await supabase
        .from("obra_assignments")
        .select("id")
        .eq("employee_id", employee.id)
        .eq("obra_id", id)
        .limit(1)
        .single()

      if (!assignment) { setNotFound(true); setLoading(false); return }

      const { data: obraData } = await supabase
        .from("obras")
        .select("id, code, name, client_name, location_text, status, start_date_planned, start_date_actual, end_date_planned, end_date_actual, notes")
        .eq("id", id)
        .single()

      if (!obraData) { setNotFound(true); setLoading(false); return }

      setObra(obraData)

      const { data: assignments } = await supabase
        .from("obra_assignments")
        .select("role_on_site, employee_id")
        .eq("obra_id", id)

      if (assignments && assignments.length > 0) {
        const employeeIds = assignments.map((a: { employee_id: string }) => a.employee_id)
        const { data: employees } = await supabase
          .from("employees")
          .select("id, full_name, position_title, phone")
          .in("id", employeeIds)

        if (employees) {
          const roleMap = new Map(assignments.map((a: { employee_id: string; role_on_site: string | null }) => [a.employee_id, a.role_on_site]))
          const teamList = employees.map((e: { id: string; full_name: string; position_title: string | null; phone: string | null }) => ({
            ...e,
            role_on_site: roleMap.get(e.id) ?? null,
          }))
          // Sort: directors first
          teamList.sort((a: TeamMember, b: TeamMember) => {
            const aDir = a.role_on_site === "director_obra" ? 0 : 1
            const bDir = b.role_on_site === "director_obra" ? 0 : 1
            return aDir - bDir
          })
          setTeam(teamList)
        }
      }

      setLoading(false)
    }

    fetchObraDetail()
  }, [user, id])

  /* ─── Fetch attendance for current week ─── */
  const fetchAttendance = useCallback(async () => {
    if (!id) return
    setLoadingAttendance(true)

    const startDate = weekDates[0]
    const endDate = weekDates[6]

    const { data } = await supabase
      .from("obra_attendance")
      .select("id, employee_id, date, status, note")
      .eq("obra_id", id)
      .gte("date", startDate)
      .lte("date", endDate)

    setAttendance((data as AttendanceRecord[]) ?? [])
    setLoadingAttendance(false)
  }, [id, weekDates])

  useEffect(() => {
    if (!loading && obra) {
      fetchAttendance()
    }
  }, [loading, obra, fetchAttendance])

  /* ─── Toggle attendance ─── */
  const cycleAttendance = async (employeeId: string, date: string) => {
    if (!user || !id) return

    const cellKey = `${employeeId}-${date}`
    setSavingCell(cellKey)

    const existing = attendance.find((a: AttendanceRecord) => a.employee_id === employeeId && a.date === date)

    const statusCycle: AttendanceStatus[] = ["present", "absent", "half_day", "justified"]
    let nextStatus: AttendanceStatus

    if (!existing) {
      nextStatus = "present"
    } else {
      const currentIdx = statusCycle.indexOf(existing.status)
      const nextIdx = (currentIdx + 1) % statusCycle.length
      nextStatus = statusCycle[nextIdx]
    }

    if (!existing) {
      // Insert
      const { data, error } = await supabase
        .from("obra_attendance")
        .insert({
          obra_id: id,
          employee_id: employeeId,
          date,
          status: nextStatus,
          recorded_by: user.id,
        })
        .select("id, employee_id, date, status, note")
        .single()

      if (!error && data) {
        setAttendance((prev: AttendanceRecord[]) => [...prev, data as AttendanceRecord])
      }
    } else {
      // Update
      const { data, error } = await supabase
        .from("obra_attendance")
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .select("id, employee_id, date, status, note")
        .single()

      if (!error && data) {
        setAttendance((prev: AttendanceRecord[]) => prev.map((a: AttendanceRecord) => (a.id === existing.id ? data as AttendanceRecord : a)))
      }
    }

    setSavingCell(null)
  }

  /* ─── Week navigation ─── */
  const goToPrevWeek = () => {
    setCurrentMonday((prev: Date) => {
      const d = new Date(prev)
      d.setDate(d.getDate() - 7)
      return d
    })
  }

  const goToNextWeek = () => {
    const nextMonday = new Date(currentMonday)
    nextMonday.setDate(nextMonday.getDate() + 7)
    // Don't allow navigating to future weeks
    if (nextMonday > getMonday(new Date())) return
    setCurrentMonday(nextMonday)
  }

  const goToCurrentWeek = () => {
    setCurrentMonday(getMonday(new Date()))
  }

  /* ─── Get attendance for a cell ─── */
  const getAttendanceForCell = (employeeId: string, date: string) => {
    return attendance.find((a: AttendanceRecord) => a.employee_id === employeeId && a.date === date)
  }

  /* ─── Transfers: fetch outgoing for this obra ─── */
  const fetchTransfers = useCallback(async () => {
    if (!id || !myEmployeeId) return
    const { data } = await supabase
      .from("worker_transfers")
      .select("*")
      .eq("from_obra_id", id)
      .eq("from_director_id", myEmployeeId)
      .eq("status", "pending")

    setTransfers((data as Transfer[]) ?? [])
  }, [id, myEmployeeId])

  useEffect(() => {
    if (myEmployeeId && obra) fetchTransfers()
  }, [myEmployeeId, obra, fetchTransfers])

  /* ─── Realtime: listen for transfer status changes (sender side) ─── */
  useEffect(() => {
    if (!myEmployeeId || !id) return

    const channel = supabase
      .channel(`transfers-sender-${id}`)
      .on(
        "postgres_changes" as any,
        {
          event: "UPDATE",
          schema: "public",
          table: "worker_transfers",
          filter: `from_director_id=eq.${myEmployeeId}`,
        },
        (payload: { new: Transfer }) => {
          const updated = payload.new
          if (updated.from_obra_id !== id) return

          if (updated.status === "accepted" || updated.status === "rejected") {
            // Show final status with animation, then remove after delay
            setDismissingTransfers((prev: Record<string, TransferStatus>) => ({
              ...prev,
              [updated.id]: updated.status as TransferStatus,
            }))
            // Update the transfer in state to show the new status
            setTransfers((prev: Transfer[]) =>
              prev.map((t: Transfer) => (t.id === updated.id ? { ...t, status: updated.status as TransferStatus } : t))
            )
            // Remove after animation
            setTimeout(() => {
              setTransfers((prev: Transfer[]) => prev.filter((t: Transfer) => t.id !== updated.id))
              setDismissingTransfers((prev: Record<string, TransferStatus>) => {
                const next = { ...prev }
                delete next[updated.id]
                return next
              })
            }, 2500)
          }
        }
      )
      .on(
        "postgres_changes" as any,
        {
          event: "INSERT",
          schema: "public",
          table: "worker_transfers",
          filter: `from_director_id=eq.${myEmployeeId}`,
        },
        (payload: { new: Transfer }) => {
          const newTransfer = payload.new
          if (newTransfer.from_obra_id !== id) return
          // New transfer created (e.g. from another tab) — just add it
          setTransfers((prev: Transfer[]) => {
            if (prev.some((t: Transfer) => t.id === newTransfer.id)) return prev
            return [...prev, newTransfer]
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [myEmployeeId, id])

  /* ─── Transfers: load available directors ─── */
  const loadDirectors = async () => {
    if (!myEmployeeId) return
    setLoadingDirectors(true)

    // Find all employees with role 'worker' in app_users (active directors)
    const { data: workerUsers } = await supabase
      .from("app_users")
      .select("id, role")
      .eq("role", "worker")

    if (!workerUsers || workerUsers.length === 0) {
      setDirectors([])
      setLoadingDirectors(false)
      return
    }

    const workerUserIds = workerUsers.map((u: { id: string }) => u.id)

    // Get employees linked to these active worker users, excluding myself
    const { data: directorEmployees } = await supabase
      .from("employees")
      .select("id, full_name, user_id")
      .in("user_id", workerUserIds)
      .neq("id", myEmployeeId)

    setDirectors((directorEmployees as DirectorOption[]) ?? [])
    setLoadingDirectors(false)
  }

  /* ─── Transfers: open modal ─── */
  const openTransferModal = (member: TeamMember) => {
    setTransferTarget(member)
    setSelectedDirector(null)
    setTransferNote("")
    setShowTransferModal(true)
    loadDirectors()
  }

  /* ─── Transfers: send ─── */
  const sendTransfer = async () => {
    if (!myEmployeeId || !transferTarget || !selectedDirector || !id) return
    setSendingTransfer(true)

    const { error } = await supabase
      .from("worker_transfers")
      .insert({
        employee_id: transferTarget.id,
        from_obra_id: id,
        from_director_id: myEmployeeId,
        to_director_id: selectedDirector,
        status: "pending",
        note: transferNote.trim() || null,
        role_on_site: transferTarget.role_on_site,
      })

    if (!error) {
      await fetchTransfers()
      setShowTransferModal(false)
    }

    setSendingTransfer(false)
  }

  /* ─── Transfers: cancel ─── */
  const cancelTransfer = async (transferId: string) => {
    setCancellingTransfer(transferId)

    const { error } = await supabase
      .from("worker_transfers")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", transferId)

    if (!error) {
      setTransfers((prev: Transfer[]) => prev.filter((t: Transfer) => t.id !== transferId))
    }

    setCancellingTransfer(null)
  }

  /* ─── Transfer helpers ─── */
  const getTransferForMember = (employeeId: string): Transfer | undefined => {
    return transfers.find((t: Transfer) => t.employee_id === employeeId)
  }

  const TRANSFER_STATUS_CONFIG: Record<TransferStatus, { label: string; color: string; bg: string; border: string }> = {
    pending: { label: "Esperando", color: "text-amber-400", bg: "bg-amber-500/15", border: "border-amber-500/20" },
    accepted: { label: "Confirmada", color: "text-emerald-400", bg: "bg-emerald-500/15", border: "border-emerald-500/20" },
    cancelled: { label: "Cancelada", color: "text-slate-400", bg: "bg-slate-500/15", border: "border-slate-500/20" },
    rejected: { label: "Rechazada", color: "text-red-400", bg: "bg-red-500/15", border: "border-red-500/20" },
  }

  /* ─── Render helpers ─── */
  const formatDateLong = (d: string | null) => {
    if (!d) return "—"
    return new Date(d + "T00:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })
  }

  /* ─── Loading state ─── */
  if (loading) {
    return (
      <RoleGuard allowed={["worker"]}>
        <WorkerLayout>
          <div className="flex flex-col items-center gap-3 py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[#0174bd]" />
            <span className="text-sm text-slate-500">Cargando obra...</span>
          </div>
        </WorkerLayout>
      </RoleGuard>
    )
  }

  /* ─── Not found ─── */
  if (notFound || !obra) {
    return (
      <RoleGuard allowed={["worker"]}>
        <WorkerLayout>
          <div className="flex flex-col items-center gap-4 py-20 text-center max-w-sm mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-red-400" />
            </div>
            <h2 className="text-lg font-bold text-slate-200">Obra no encontrada</h2>
            <p className="text-sm text-slate-500">No tienes acceso a esta obra o no existe en el sistema.</p>
            <Link href="/worker/obras" className="mt-2 text-sm font-semibold text-[#4da8e8] hover:text-[#4da8e8]/80 transition-colors">
              ← Volver a mis obras
            </Link>
          </div>
        </WorkerLayout>
      </RoleGuard>
    )
  }

  const status = STATUS_CONFIG[obra.status] ?? STATUS_CONFIG.closed
  const canGoNext = !isCurrentWeek

  /* ─── Attendance summary for week ─── */
  const weekSummary = team.map((member: TeamMember) => {
    const days = weekDates.map((date: string) => getAttendanceForCell(member.id, date))
    const presentCount = days.filter((d: AttendanceRecord | undefined) => d?.status === "present").length
    const absentCount = days.filter((d: AttendanceRecord | undefined) => d?.status === "absent").length
    const halfCount = days.filter((d: AttendanceRecord | undefined) => d?.status === "half_day").length
    return { member, presentCount, absentCount, halfCount }
  })

  return (
    <RoleGuard allowed={["worker"]}>
      <WorkerLayout>
        <div className="space-y-4 max-w-2xl mx-auto">

          {/* ── Back button ── */}
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors active:scale-95 py-1"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver
          </button>

          {/* ── Obra Header (compact) ── */}
          <div
            className="rounded-2xl border border-slate-700/60 p-4"
            style={{
              background: "linear-gradient(135deg, #1e293b 0%, #0f1e2e 50%, #162438 100%)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 20px rgba(0,0,0,0.3)",
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                {obra.code && (
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-700/50 px-1.5 py-0.5 rounded mb-1.5 inline-block">
                    {obra.code}
                  </span>
                )}
                <h1 className="text-lg font-bold text-slate-100 leading-tight">{obra.name}</h1>
                {obra.location_text && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1.5">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    {obra.location_text}
                  </div>
                )}
              </div>
              <span className={cn(
                "shrink-0 flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border",
                status.bg, status.color, status.border
              )}>
                <span className={cn("w-1.5 h-1.5 rounded-full", status.dot)} />
                {status.text}
              </span>
            </div>
          </div>

          {/* ══════════════════════════════════════════
              ATTENDANCE — Primary section
             ══════════════════════════════════════════ */}
          <div
            className="rounded-2xl border border-slate-700/60 overflow-hidden"
            style={{ background: "linear-gradient(145deg, #1e293b, #172030)" }}
          >
            {/* ── Attendance Header ── */}
            <div className="p-4 border-b border-slate-700/40">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold text-slate-200 flex items-center gap-2">
                  <CalendarDays className="w-5 h-5 text-[#4da8e8]" />
                  Asistencia
                </h2>

                {/* View toggle: Día / Semana */}
                <div className="flex rounded-xl overflow-hidden border border-slate-700/60">
                  <button
                    onClick={() => setViewMode("day")}
                    className={cn(
                      "px-3.5 py-2 text-xs font-semibold transition-all",
                      viewMode === "day"
                        ? "bg-[#0174bd]/20 text-[#4da8e8]"
                        : "text-slate-500 hover:text-slate-300"
                    )}
                  >
                    Día
                  </button>
                  <button
                    onClick={() => setViewMode("week")}
                    className={cn(
                      "px-3.5 py-2 text-xs font-semibold transition-all border-l border-slate-700/60",
                      viewMode === "week"
                        ? "bg-[#0174bd]/20 text-[#4da8e8]"
                        : "text-slate-500 hover:text-slate-300"
                    )}
                  >
                    Semana
                  </button>
                </div>
              </div>

              {/* ── Week Navigator ── */}
              <div className="flex items-center justify-between">
                <button
                  onClick={goToPrevWeek}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-700/40 transition-all active:scale-90"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-200">
                    {viewMode === "day"
                      ? new Date(today + "T00:00:00").toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })
                      : `${formatDateShort(weekDates[0])} – ${formatDateShort(weekDates[6])} ${formatMonthYear(weekDates[0])}`
                    }
                  </p>
                  {isCurrentWeek && (
                    <span className="text-[10px] font-semibold text-emerald-400">Semana actual</span>
                  )}
                  {!isCurrentWeek && (
                    <button
                      onClick={goToCurrentWeek}
                      className="text-[10px] font-semibold text-[#4da8e8] hover:text-[#4da8e8]/80 transition-colors"
                    >
                      Ir a semana actual →
                    </button>
                  )}
                </div>

                <button
                  onClick={goToNextWeek}
                  disabled={!canGoNext}
                  className={cn(
                    "p-2 rounded-xl transition-all active:scale-90",
                    canGoNext
                      ? "text-slate-400 hover:text-slate-200 hover:bg-slate-700/40"
                      : "text-slate-700 cursor-not-allowed"
                  )}
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* ── Attendance Legend ── */}
            <div className="px-4 py-2.5 border-b border-slate-700/30 flex items-center gap-3 overflow-x-auto no-scrollbar">
              {(Object.entries(ATTENDANCE_CONFIG) as [AttendanceStatus, typeof ATTENDANCE_CONFIG.present][]).map(([key, cfg]) => (
                <div key={key} className="flex items-center gap-1.5 shrink-0">
                  <span className={cn("w-3 h-3 rounded-sm border", cfg.bg, cfg.border)} />
                  <span className="text-[10px] font-medium text-slate-500">{cfg.label}</span>
                </div>
              ))}
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="w-3 h-3 rounded-sm bg-slate-800 border border-slate-700/50" />
                <span className="text-[10px] font-medium text-slate-500">Sin registro</span>
              </div>
            </div>

            {/* ── Attendance Content ── */}
            {loadingAttendance ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-[#0174bd]" />
              </div>
            ) : team.length === 0 ? (
              <div className="py-10 text-center">
                <Users className="w-8 h-8 text-slate-700 mx-auto" />
                <p className="text-sm text-slate-500 mt-3">No hay trabajadores asignados</p>
              </div>
            ) : viewMode === "day" ? (
              /* ═══ DAY VIEW ═══ */
              <div className="divide-y divide-slate-700/30">
                {team.map((member: TeamMember) => {
                  const record = getAttendanceForCell(member.id, today)
                  const cfg = record ? ATTENDANCE_CONFIG[record.status as AttendanceStatus] : null
                  const isSaving = savingCell === `${member.id}-${today}`

                  return (
                    <div key={member.id} className="flex items-center gap-3 px-4 py-3">
                      {/* Name */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-200 truncate">
                          {member.full_name}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {formatRoleName(member.role_on_site || member.position_title)}
                        </p>
                      </div>

                      {/* Attendance button — large touch target */}
                      {(() => {
                        const isBajada = record?.status === "bajada"
                        return (
                          <button
                            onClick={() => !isBajada && cycleAttendance(member.id, today)}
                            disabled={isSaving || isBajada}
                            className={cn(
                              "shrink-0 w-16 h-12 rounded-xl border-2 flex flex-col items-center justify-center transition-all font-semibold",
                              isSaving && "opacity-50",
                              isBajada ? "cursor-not-allowed" : "active:scale-90",
                              cfg
                                ? `${cfg.bg} ${cfg.border} ${cfg.color}`
                                : "bg-slate-800/60 border-slate-700/50 text-slate-600"
                            )}
                          >
                            {isSaving ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : cfg ? (
                              <>
                                {(() => { const Icon = cfg.icon; return <Icon className="w-5 h-5" /> })()}
                                <span className="text-[9px] mt-0.5">{cfg.short}</span>
                              </>
                            ) : (
                              <span className="text-lg">—</span>
                            )}
                          </button>
                        )
                      })()}
                    </div>
                  )
                })}
              </div>
            ) : (
              /* ═══ WEEK VIEW ═══ */
              <div>
                {/* Day headers */}
                <div className="grid grid-cols-[1fr_repeat(7,40px)] gap-1 px-3 py-2 border-b border-slate-700/30">
                  <div /> {/* name column */}
                  {weekDates.map((date: string, i: number) => {
                    const isToday = date === today
                    return (
                      <div key={date} className="text-center">
                        <p className={cn(
                          "text-[10px] font-semibold",
                          isToday ? "text-[#4da8e8]" : "text-slate-500"
                        )}>
                          {DAYS_SHORT[i]}
                        </p>
                        <p className={cn(
                          "text-[11px] font-bold mt-0.5",
                          isToday
                            ? "text-[#4da8e8] bg-[#0174bd]/20 rounded-full w-6 h-6 flex items-center justify-center mx-auto"
                            : "text-slate-400"
                        )}>
                          {formatDateShort(date)}
                        </p>
                      </div>
                    )
                  })}
                </div>

                {/* Employee rows */}
                <div className="divide-y divide-slate-700/20">
                  {team.map((member: TeamMember) => (
                    <div key={member.id} className="grid grid-cols-[1fr_repeat(7,40px)] gap-1 px-3 py-2 items-center">
                      {/* Name */}
                      <div className="min-w-0 pr-1">
                        <p className="text-[12px] font-semibold text-slate-300 truncate">
                          {member.full_name.split(" ").slice(0, 2).join(" ")}
                        </p>
                      </div>

                      {/* Day cells */}
                      {weekDates.map((date: string) => {
                        const record = getAttendanceForCell(member.id, date)
                        const cfg = record ? ATTENDANCE_CONFIG[record.status as AttendanceStatus] : null
                        const isSaving = savingCell === `${member.id}-${date}`
                        const isFuture = date > today
                        const isBajada = record?.status === "bajada"
                        const isDisabled = isSaving || isFuture || isBajada

                        return (
                          <button
                            key={date}
                            onClick={() => !isDisabled && cycleAttendance(member.id, date)}
                            disabled={isDisabled}
                            className={cn(
                              "w-10 h-10 rounded-lg border flex items-center justify-center transition-all text-sm font-bold",
                              (isFuture || isBajada) && "cursor-not-allowed",
                              isFuture && !isBajada && "opacity-30",
                              !isDisabled && "active:scale-90",
                              isSaving && "opacity-50",
                              cfg
                                ? `${cfg.bg} ${cfg.border} ${cfg.color}`
                                : "bg-slate-800/40 border-slate-700/40 text-slate-700"
                            )}
                          >
                            {isSaving ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : cfg ? (
                              cfg.short
                            ) : (
                              "—"
                            )}
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Week summary ── */}
            {viewMode === "week" && team.length > 0 && (
              <div className="px-4 py-3 border-t border-slate-700/30 bg-slate-800/20">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Resumen de la semana
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <p className="text-lg font-bold text-emerald-400">
                      {weekSummary.reduce((sum: number, s: { presentCount: number }) => sum + s.presentCount, 0)}
                    </p>
                    <p className="text-[10px] text-slate-500">Asistencias</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-red-400">
                      {weekSummary.reduce((sum: number, s: { absentCount: number }) => sum + s.absentCount, 0)}
                    </p>
                    <p className="text-[10px] text-slate-500">Faltas</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-amber-400">
                      {weekSummary.reduce((sum: number, s: { halfCount: number }) => sum + s.halfCount, 0)}
                    </p>
                    <p className="text-[10px] text-slate-500">Medio día</p>
                  </div>
                </div>
              </div>
            )}

            {/* ── Tap instruction ── */}
            <div className="px-4 py-2 border-t border-slate-700/20 bg-slate-800/10">
              <p className="text-[10px] text-slate-600 text-center">
                Toca el recuadro para cambiar: — → Asistió → Falta → Medio día → Justificada
              </p>
            </div>
          </div>

          {/* ── Info sections (collapsible, secondary) ── */}

          {/* ── Team ── */}
          <div
            className="rounded-2xl border border-slate-700/60 p-4"
            style={{ background: "linear-gradient(145deg, #1e293b, #172030)" }}
          >
            <h2 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-500" />
              Equipo ({team.length})
            </h2>

            {team.length === 0 ? (
              <p className="text-sm text-slate-600 text-center py-3">No hay equipo asignado</p>
            ) : (
              <div className="space-y-2">
                {team.map((member: TeamMember) => {
                  const transfer = getTransferForMember(member.id)
                  const isDirector = member.role_on_site === "director_obra"
                  const isDismissing = transfer ? !!dismissingTransfers[transfer.id] : false
                  const dismissStatus = transfer ? dismissingTransfers[transfer.id] : undefined
                  const effectiveStatus: TransferStatus = dismissStatus || (transfer?.status as TransferStatus) || "pending"
                  const tCfg = transfer
                    ? TRANSFER_STATUS_CONFIG[effectiveStatus]
                    : null

                  return (
                    <div
                      key={member.id}
                      className={cn(
                        "rounded-xl bg-slate-800/40 border border-slate-700/30 p-2.5 transition-all duration-500",
                        transfer?.status === "pending" && !isDismissing && "border-amber-500/20 bg-amber-500/5",
                        isDismissing && dismissStatus === "accepted" && "border-emerald-500/30 bg-emerald-500/5",
                        isDismissing && dismissStatus === "rejected" && "border-red-500/30 bg-red-500/5",
                        isDismissing && "opacity-0 scale-95 translate-y-2"
                      )}
                      style={{ transitionDelay: isDismissing ? "1.5s" : "0s" }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative shrink-0">
                          <div className={cn(
                            "w-9 h-9 rounded-full flex items-center justify-center",
                            isDirector
                              ? "bg-amber-500/15 border border-amber-500/25"
                              : "bg-[#0174bd]/15 border border-[#0174bd]/20"
                          )}>
                            <User className={cn("w-4 h-4", isDirector ? "text-amber-400" : "text-[#4da8e8]")} />
                          </div>
                          {isDirector && (
                            <HardHat className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 text-amber-400 animate-pulse drop-shadow-[0_0_4px_rgba(245,158,11,0.5)]" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            "text-[13px] font-semibold truncate",
                            isDirector ? "text-amber-200" : "text-slate-200"
                          )}>{member.full_name}</p>
                          <p className="text-[11px] text-slate-500 truncate">
                            {formatRoleName(member.role_on_site || member.position_title)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {member.phone && (
                            <a
                              href={`tel:${member.phone}`}
                              className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center hover:bg-emerald-500/20 transition-colors active:scale-95"
                            >
                              <Phone className="w-3.5 h-3.5 text-emerald-400" />
                            </a>
                          )}
                          {!isDirector && !transfer && (
                            <button
                              onClick={() => openTransferModal(member)}
                              className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center hover:bg-blue-500/20 transition-colors active:scale-95"
                              title="Transferir"
                            >
                              <ArrowRightLeft className="w-3.5 h-3.5 text-blue-400" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Transfer status badge */}
                      {transfer && tCfg && (
                        <div className={cn(
                          "mt-2 flex items-center justify-between px-2.5 py-1.5 rounded-lg border transition-all duration-300",
                          tCfg.bg, tCfg.border
                        )}>
                          <div className="flex items-center gap-1.5">
                            {effectiveStatus === "pending" && <Clock3 className={cn("w-3 h-3", tCfg.color)} />}
                            {effectiveStatus === "accepted" && <CheckCircle2 className={cn("w-3 h-3", tCfg.color)} />}
                            {effectiveStatus === "rejected" && <Ban className={cn("w-3 h-3", tCfg.color)} />}
                            <span className={cn("text-[11px] font-semibold", tCfg.color)}>
                              {tCfg.label}
                            </span>
                          </div>
                          {transfer.status === "pending" && !isDismissing && (
                            <button
                              onClick={() => cancelTransfer(transfer.id)}
                              disabled={cancellingTransfer === transfer.id}
                              className="flex items-center gap-1 text-[10px] font-semibold text-red-400 hover:text-red-300 transition-colors active:scale-95"
                            >
                              {cancellingTransfer === transfer.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <>
                                  <XCircle className="w-3 h-3" />
                                  Cancelar
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ══ Transfer Modal ══ */}
          {showTransferModal && transferTarget && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
              {/* Backdrop */}
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => !sendingTransfer && setShowTransferModal(false)}
              />

              {/* Modal */}
              <div
                className="relative w-full max-w-md mx-4 mb-0 sm:mb-0 rounded-t-2xl sm:rounded-2xl border border-slate-700/60 overflow-hidden animate-in slide-in-from-bottom-4 duration-200"
                style={{ background: "linear-gradient(145deg, #1e293b, #131d2e)" }}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/40">
                  <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <ArrowRightLeft className="w-4 h-4 text-blue-400" />
                    Transferir trabajador
                  </h3>
                  <button
                    onClick={() => !sendingTransfer && setShowTransferModal(false)}
                    className="w-8 h-8 rounded-lg bg-slate-800/60 flex items-center justify-center hover:bg-slate-700/60 transition-colors"
                  >
                    <X className="w-4 h-4 text-slate-400" />
                  </button>
                </div>

                <div className="px-5 py-4 space-y-4">
                  {/* Worker info */}
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/30">
                    <div className="w-10 h-10 rounded-full bg-[#0174bd]/15 border border-[#0174bd]/20 flex items-center justify-center">
                      <User className="w-5 h-5 text-[#4da8e8]" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-200">{transferTarget.full_name}</p>
                      <p className="text-[11px] text-slate-500">
                        {formatRoleName(transferTarget.role_on_site || transferTarget.position_title)}
                      </p>
                    </div>
                  </div>

                  {/* Select director */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2 block">
                      Enviar a director de obra
                    </label>
                    {loadingDirectors ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
                      </div>
                    ) : directors.length === 0 ? (
                      <p className="text-sm text-slate-500 text-center py-4">No hay otros directores activos</p>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {directors.map((dir: DirectorOption) => (
                          <button
                            key={dir.id}
                            onClick={() => setSelectedDirector(dir.id)}
                            className={cn(
                              "w-full flex items-center gap-3 p-3 rounded-xl border transition-all active:scale-[0.98]",
                              selectedDirector === dir.id
                                ? "bg-[#0174bd]/10 border-[#0174bd]/30"
                                : "bg-slate-800/30 border-slate-700/30 hover:border-slate-600/40"
                            )}
                          >
                            <div className={cn(
                              "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                              selectedDirector === dir.id
                                ? "bg-[#0174bd]/20 border border-[#0174bd]/30"
                                : "bg-slate-700/40 border border-slate-600/30"
                            )}>
                              <User className={cn(
                                "w-3.5 h-3.5",
                                selectedDirector === dir.id ? "text-[#4da8e8]" : "text-slate-500"
                              )} />
                            </div>
                            <span className={cn(
                              "text-[13px] font-medium",
                              selectedDirector === dir.id ? "text-[#4da8e8]" : "text-slate-300"
                            )}>
                              {dir.full_name}
                            </span>
                            {selectedDirector === dir.id && (
                              <Check className="w-4 h-4 text-[#4da8e8] ml-auto" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Note */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2 block">
                      Nota (opcional)
                    </label>
                    <textarea
                      value={transferNote}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTransferNote(e.target.value)}
                      placeholder="Ej: Necesita este albañil para el muro norte..."
                      rows={2}
                      className="w-full px-3 py-2.5 text-[13px] bg-slate-800/60 border border-slate-700/40 rounded-xl text-slate-200 placeholder:text-slate-600 outline-none focus:border-[#0174bd]/40 resize-none"
                    />
                  </div>
                </div>

                {/* Footer */}
                <div className="px-5 py-4 border-t border-slate-700/40 flex gap-3">
                  <button
                    onClick={() => setShowTransferModal(false)}
                    disabled={sendingTransfer}
                    className="flex-1 h-11 rounded-xl border border-slate-700/40 text-sm font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-all active:scale-95"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={sendTransfer}
                    disabled={!selectedDirector || sendingTransfer}
                    className={cn(
                      "flex-1 h-11 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all active:scale-95",
                      selectedDirector
                        ? "bg-[#0174bd] text-white hover:bg-[#0174bd]/80"
                        : "bg-slate-800/40 text-slate-600 cursor-not-allowed"
                    )}
                  >
                    {sendingTransfer ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Enviar
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Dates ── */}
          <div
            className="rounded-2xl border border-slate-700/60 p-4"
            style={{ background: "linear-gradient(145deg, #1e293b, #172030)" }}
          >
            <h2 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-500" />
              Fechas
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide mb-0.5">Inicio planeado</p>
                <p className="text-[13px] text-slate-200 font-medium">{formatDateLong(obra.start_date_planned)}</p>
              </div>
              <div>
                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide mb-0.5">Inicio real</p>
                <p className="text-[13px] text-slate-200 font-medium">{formatDateLong(obra.start_date_actual)}</p>
              </div>
              <div>
                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide mb-0.5">Fin planeado</p>
                <p className="text-[13px] text-slate-200 font-medium">{formatDateLong(obra.end_date_planned)}</p>
              </div>
              <div>
                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide mb-0.5">Fin real</p>
                <p className="text-[13px] text-slate-200 font-medium">{formatDateLong(obra.end_date_actual)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Hide scrollbar utility */}
        <style jsx global>{`
          .no-scrollbar::-webkit-scrollbar { display: none; }
          .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        `}</style>
      </WorkerLayout>
    </RoleGuard>
  )
}
