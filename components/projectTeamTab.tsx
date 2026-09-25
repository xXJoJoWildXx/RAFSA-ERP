"use client"

import React, { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { DateRange } from "react-day-picker"
import { Plus, Trash2, UserPlus, Crown, FileDown, Loader2, CalendarDays, Check } from "lucide-react"
import { generateTeamPdf, loadPhotoDataUrl, type ObraInfoPDF, type TeamMemberPDF } from "@/lib/teamPdf"
import { logActivity } from "@/lib/activityLog"

type EmployeeRow = {
  id: string
  full_name: string
  position_title: string | null
  status: "active" | "inactive" | string
  roles: string[] // codigos de employee_roles_catalog
}

type AssignmentRow = {
  id: string
  obra_id: string
  employee_id: string
  role_on_site: string | null
  assigned_from: string
  assigned_to: string | null
  created_at: string
  employees:
    | { full_name: string; position_title: string | null; status: string; is_foraneo: boolean; residence_location: string | null; next_bajada_date: string | null; next_reingreso_date: string | null; viatics_amount: number | null }
    | { full_name: string; position_title: string | null; status: string; is_foraneo: boolean; residence_location: string | null; next_bajada_date: string | null; next_reingreso_date: string | null; viatics_amount: number | null }[]
    | null
}

type TeamMember = {
  assignment_id: string
  employee_id: string
  full_name: string
  position_title: string | null
  employee_status: string
  role_on_site: string | null
  assigned_from: string
  assigned_to: string | null
  is_foraneo: boolean
  residence_location: string | null
  next_bajada_date: string | null
  next_reingreso_date: string | null
  viatics_amount: number
  created_at: string
}

type Props = {
  obraId: string
  obraInfo?: ObraInfoPDF
  allowManage?: boolean
  onTeamChange?: () => void
}

/**
 * Convencion:
 * - role_on_site = 'director_obra' => Director de Obra (rol unico activo por obra)
 * - el resto corresponden a los codigos del catalogo employee_roles_catalog
 */
const ROLE_ON_SITE_OPTIONS = [
  { value: "director_obra", label: "Director de Obra" },
  { value: "pintor_muros_tiltup", label: "Pintor de muros tilt-up" },
  { value: "pintor_estructura", label: "Pintor de estructura" },
  { value: "oficial_pastero", label: "Oficial Pastero" },
  { value: "pintor_tablaroca", label: "Pintor de Tablaroca" },
  { value: "ayudante_obra", label: "Ayudante de Obra" },
]

function normalizeRoleLabel(v: string | null) {
  if (!v) return "-"
  const found = ROLE_ON_SITE_OPTIONS.find((x) => x.value === v)
  return found?.label ?? v
}

function todayISO() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** Date → YYYY-MM-DD (local) */
function toDateStr(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function isActiveAssignment(a: TeamMember) {
  if (!a.assigned_to) return true
  return a.assigned_to >= todayISO()
}

/**
 * Verifica si el empleado tiene el rol 'director_obra' en el catalogo
 */
function isEmployeeDirectorObra(e: EmployeeRow | null | undefined) {
  return (e?.roles ?? []).includes("director_obra")
}

// Shared dark-mode class strings
const inputCls = "bg-slate-900 border-slate-700 text-slate-200 focus:border-[#0174bd]/60 placeholder:text-slate-500"
const selectTriggerCls = "bg-slate-900 border-slate-700 text-slate-200"
const selectContentCls = "bg-slate-800 border-slate-700 text-slate-200"
const btnOutlineCls = "border-slate-700 text-slate-400 hover:bg-slate-700/60 hover:text-slate-200"

export function ProjectTeamTab({ obraId, obraInfo, allowManage = true, onTeamChange }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [members, setMembers] = useState<TeamMember[]>([])
  const [generatingPdf, setGeneratingPdf] = useState(false)

  // Confirmed bajada tracking: assignment_id → { bajada, reingreso }
  const [confirmedBajadas, setConfirmedBajadas] = useState<Map<string, { bajada: string; reingreso: string | null }>>(new Map())

  // Borradores del lugar de residencia (edición inline cuando está vacío)
  const [residenceDraft, setResidenceDraft] = useState<Record<string, string>>({})

  // Borradores de viáticos (edición inline)
  const [viaticsDraft, setViaticsDraft] = useState<Record<string, string>>({})
  const [savingViatics, setSavingViatics] = useState<string | null>(null)

  // Popover de calendario de bajada abierto (por employee_id)
  const [bajadaCalOpen, setBajadaCalOpen] = useState<string | null>(null)

  // filtros
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState<"all" | string>("all")

  // modal add
  const [addOpen, setAddOpen] = useState(false)
  const [savingAdd, setSavingAdd] = useState(false)
  const [directorMode, setDirectorMode] = useState(false)

  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [employeesLoading, setEmployeesLoading] = useState(false)

  const [addForm, setAddForm] = useState({
    employee_id: "",
    role_on_site: "ayudante_obra",
  })

  // Segundo slot de Director de Obra
  const [showSecondSlot, setShowSecondSlot] = useState(false)
  const [replacingDirectorAssignmentId, setReplacingDirectorAssignmentId] = useState<string | null>(null)

  // Transferencia de empleado entre obras
  const [transferConfirmOpen, setTransferConfirmOpen] = useState(false)
  const [savingTransfer, setSavingTransfer] = useState(false)
  const [transferInfo, setTransferInfo] = useState<{
    employeeName: string
    fromObraName: string
    assignmentIds: string[]
  } | null>(null)

  async function fetchMembers(silent = false) {
    if (!obraId) return
    if (!silent) {
      setLoading(true)
      setError(null)
    }

    const { data, error } = await supabase
      .from("obra_assignments")
      .select(
        `
        id,
        obra_id,
        employee_id,
        role_on_site,
        assigned_from,
        assigned_to,
        created_at,
        employees(full_name, position_title, status, is_foraneo, residence_location, next_bajada_date, next_reingreso_date, viatics_amount)
      `,
      )
      .eq("obra_id", obraId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("fetchMembers error:", error)
      if (!silent) {
        setMembers([])
        setError("No se pudo cargar el equipo.")
        setLoading(false)
      }
      return
    }

    const rows = (data || []) as AssignmentRow[]
    const ui: TeamMember[] = rows.map((r) => {
      const emp = r.employees
      const e = Array.isArray(emp) ? emp[0] : emp
      return {
        assignment_id: r.id,
        employee_id: r.employee_id,
        full_name: e?.full_name ?? "Empleado",
        position_title: e?.position_title ?? null,
        employee_status: e?.status ?? "active",
        role_on_site: r.role_on_site,
        assigned_from: r.assigned_from,
        assigned_to: r.assigned_to,
        is_foraneo: e?.is_foraneo ?? false,
        residence_location: e?.residence_location ?? null,
        next_bajada_date: e?.next_bajada_date ?? null,
        next_reingreso_date: e?.next_reingreso_date ?? null,
        viatics_amount: Number(e?.viatics_amount ?? 0),
        created_at: r.created_at,
      }
    })

    setMembers(ui)
    if (!silent) setLoading(false)
  }

  async function fetchConfirmedBajadas() {
    if (!obraId) return
    const { data } = await supabase
      .from("bajada_notifications")
      .select("assignment_id, bajada_date, reingreso_date")
      .eq("obra_id", obraId)
      .eq("status", "confirmed")

    const map = new Map<string, { bajada: string; reingreso: string | null }>()
    ;(data || []).forEach((row: { assignment_id: string; bajada_date: string; reingreso_date: string | null }) => {
      map.set(row.assignment_id, { bajada: row.bajada_date, reingreso: row.reingreso_date ?? null })
    })
    setConfirmedBajadas(map)
  }

  /** Bloqueado si tiene una bajada confirmada cuyo reingreso aún no ha pasado */
  function isBajadaLocked(member: TeamMember): boolean {
    const c = confirmedBajadas.get(member.assignment_id)
    if (!c) return false
    // Bloqueado hasta el fin del día de reingreso (si no hay reingreso, hasta el día siguiente a la salida)
    const endStr = c.reingreso ?? c.bajada
    const end = new Date(endStr + "T23:59:59")
    if (!c.reingreso) end.setDate(end.getDate() + 1)
    return new Date() <= end
  }

  async function fetchEmployees() {
    setEmployeesLoading(true)

    const { data, error } = await supabase
      .from("employees")
      .select(`
        id,
        full_name,
        position_title,
        status,
        employee_roles(
          employee_roles_catalog(code)
        )
      `)
      .eq("status", "active")
      .order("full_name", { ascending: true })

    if (error) {
      console.error("fetchEmployees error:", error)
      setEmployees([])
      setEmployeesLoading(false)
      return
    }

    const mapped: EmployeeRow[] = (data || []).map((emp: any) => ({
      id: emp.id,
      full_name: emp.full_name,
      position_title: emp.position_title ?? null,
      status: emp.status,
      roles: (emp.employee_roles || [])
        .map((er: any) => er.employee_roles_catalog?.code)
        .filter(Boolean) as string[],
    }))

    setEmployees(mapped)
    setEmployeesLoading(false)
  }

  async function handleOpenAdd() {
    setError(null)
    setDirectorMode(false)
    setAddForm({ employee_id: "", role_on_site: "ayudante_obra" })
    setAddOpen(true)
    await fetchEmployees()
  }

  async function handleAddMember() {
    if (!obraId) return
    if (!addForm.employee_id) {
      setError("Selecciona un empleado.")
      return
    }

    setSavingAdd(true)
    setError(null)

    const alreadyActive = members.some(
      (m) => m.employee_id === addForm.employee_id && isActiveAssignment(m),
    )
    if (alreadyActive) {
      setError("Este empleado ya esta asignado actualmente a la obra.")
      setSavingAdd(false)
      return
    }

    const selectedEmp = employees.find((e) => e.id === addForm.employee_id) ?? null
    if (addForm.role_on_site === "director_obra" && !isEmployeeDirectorObra(selectedEmp)) {
      setError("Solo puedes asignar como Director de Obra a empleados que tengan ese rol en el catalogo.")
      setSavingAdd(false)
      return
    }

    const activeDirectors = members.filter(
      (m) => m.role_on_site === "director_obra" && isActiveAssignment(m),
    )
    if (
      addForm.role_on_site === "director_obra" &&
      !replacingDirectorAssignmentId &&
      activeDirectors.length >= 2
    ) {
      setError("Ya hay 2 Directores de Obra activos. Quita uno antes de asignar otro.")
      setSavingAdd(false)
      return
    }

    if (addForm.role_on_site !== "director_obra") {
      const { data: otherAssignments } = await supabase
        .from("obra_assignments")
        .select("id, obra_id, obras(name)")
        .eq("employee_id", addForm.employee_id)
        .neq("obra_id", obraId)
        .is("assigned_to", null)

      if (otherAssignments && otherAssignments.length > 0) {
        const first = otherAssignments[0] as any
        const obraName =
          Array.isArray(first.obras)
            ? (first.obras[0]?.name ?? "otra obra")
            : (first.obras?.name ?? "otra obra")
        setTransferInfo({
          employeeName: selectedEmp?.full_name ?? "este empleado",
          fromObraName: obraName,
          assignmentIds: otherAssignments.map((a: any) => a.id),
        })
        setTransferConfirmOpen(true)
        setSavingAdd(false)
        return
      }
    }

    const { data: authData } = await supabase.auth.getUser()
    const created_by = authData?.user?.id ?? null

    try {
      if (addForm.role_on_site === "director_obra" && replacingDirectorAssignmentId) {
        const { error: delErr } = await supabase
          .from("obra_assignments")
          .delete()
          .eq("id", replacingDirectorAssignmentId)
        if (delErr) {
          console.error("delete director error:", delErr)
          setError("No se pudo reemplazar el Director de Obra.")
          setSavingAdd(false)
          return
        }
        setReplacingDirectorAssignmentId(null)
      }

      const payload = {
        obra_id: obraId,
        employee_id: addForm.employee_id,
        role_on_site: addForm.role_on_site || null,
        created_by,
      }

      const { error } = await supabase.from("obra_assignments").insert(payload)
      if (error) {
          console.error("insert error code:", error.code)
          console.error("insert error message:", error.message)
          console.error("insert error details:", error.details)
        setError("No se pudo agregar al miembro.")
        setSavingAdd(false)
        return
      }

      const addedEmp = employees.find((e) => e.id === addForm.employee_id)
      const evType = addForm.role_on_site === "director_obra" ? "team.director_assigned" : "team.member_added"
      logActivity({
        event_type: evType,
        entity_type: "team",
        entity_label: addedEmp?.full_name ?? addForm.employee_id,
        metadata: { obra_id: obraId, role_on_site: addForm.role_on_site },
      })
      setAddOpen(false)
      setSavingAdd(false)
      await fetchMembers()
      onTeamChange?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar la asignacion.")
      setSavingAdd(false)
    }
  }

  async function handleRemoveMember(member: TeamMember) {
    const ok = window.confirm(`Quitar a "${member.full_name}" de esta obra?`)
    if (!ok) return

    const { error } = await supabase.from("obra_assignments").delete().eq("id", member.assignment_id)
    if (error) {
      console.error("delete obra_assignments error:", error)
      setError("No se pudo quitar el miembro.")
      return
    }

    logActivity({
      event_type: "team.member_removed",
      entity_type: "team",
      entity_label: member.full_name,
      metadata: { obra_id: obraId, role_on_site: member.role_on_site },
    })
    await fetchMembers()
    onTeamChange?.()
  }

  async function handleGeneratePDF() {
    if (!obraInfo) return
    setGeneratingPdf(true)
    try {
      // Obtenemos los employee_ids activos
      const activeMembers = members.filter(isActiveAssignment)
      const employeeIds   = [...new Set(activeMembers.map(m => m.employee_id))]

      // Consultamos datos extra de empleados (birth_date, hire_date, photo_url)
      const { data: empData } = await supabase
        .from("employees")
        .select("id, birth_date, hire_date, photo_url")
        .in("id", employeeIds)

      const empMap: Record<string, { birth_date: string | null; hire_date: string | null; photo_url: string | null }> = {}
      ;(empData || []).forEach((e: any) => { empMap[e.id] = e })

      // Cargamos fotos en paralelo (máx 10 a la vez para no saturar)
      const photoCache: Record<string, string | null> = {}
      const withPhoto = employeeIds.filter(id => empMap[id]?.photo_url)
      const BATCH = 8
      for (let i = 0; i < withPhoto.length; i += BATCH) {
        const slice = withPhoto.slice(i, i + BATCH)
        const results = await Promise.all(
          slice.map(id => loadPhotoDataUrl(empMap[id].photo_url!).then(d => ({ id, d })))
        )
        results.forEach(({ id, d }) => { photoCache[id] = d })
      }

      // Obtenemos el usuario generador
      const { data: authData } = await supabase.auth.getUser()
      const generatedBy = authData?.user?.email ?? authData?.user?.id ?? "Sistema"

      // Armamos el array de TeamMemberPDF ordenando directores primero
      const pdfMembers: TeamMemberPDF[] = activeMembers
        .sort((a, b) => {
          const aDir = a.role_on_site === "director_obra" ? 0 : 1
          const bDir = b.role_on_site === "director_obra" ? 0 : 1
          return aDir - bDir
        })
        .map(m => ({
          employee_id:   m.employee_id,
          full_name:     m.full_name,
          position_title: m.position_title,
          role_on_site:  m.role_on_site,
          birth_date:    empMap[m.employee_id]?.birth_date ?? null,
          hire_date:     empMap[m.employee_id]?.hire_date  ?? null,
          photoDataUrl:  photoCache[m.employee_id] ?? null,
        }))

      await generateTeamPdf(obraInfo, pdfMembers, new Date(), generatedBy)
    } catch (err) {
      console.error("generateTeamPdf error:", err)
    } finally {
      setGeneratingPdf(false)
    }
  }

  useEffect(() => {
    fetchMembers()
    fetchConfirmedBajadas()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obraId])

  // Realtime: refresh on bajada_notifications changes AND employee updates (residencia/bajada)
  useEffect(() => {
    if (!obraId) return
    const channel = supabase
      .channel(`bajada-team-${obraId}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "bajada_notifications", filter: `obra_id=eq.${obraId}` },
        () => {
          fetchConfirmedBajadas()
          fetchMembers(true)
        }
      )
      .on(
        "postgres_changes" as any,
        { event: "UPDATE", schema: "public", table: "employees" },
        () => {
          fetchMembers(true)
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obraId])

  const directors = useMemo(() => {
    return members
      .filter((m) => (m.role_on_site || "") === "director_obra" && isActiveAssignment(m))
      .slice(0, 2)
  }, [members])

  useEffect(() => {
    if (directors.length >= 2) setShowSecondSlot(true)
  }, [directors])

  function handleUpdateDirector(m: TeamMember) {
    setReplacingDirectorAssignmentId(m.assignment_id)
    setDirectorMode(true)
    setAddForm({ employee_id: "", role_on_site: "director_obra" })
    setAddOpen(true)
    fetchEmployees()
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return members.filter((m) => {
      const matchSearch =
        !q ||
        m.full_name.toLowerCase().includes(q) ||
        (m.position_title || "").toLowerCase().includes(q)

      const matchRole = roleFilter === "all" || (m.role_on_site || "") === roleFilter
      return matchSearch && matchRole
    })
  }, [members, search, roleFilter])

  const employeesForModal = useMemo(() => {
    if (!addForm.role_on_site) return employees
    return employees.filter((e) => e.roles.includes(addForm.role_on_site))
  }, [employees, addForm.role_on_site])

  async function handleAssignDirectorShortcut() {
    setError(null)
    setDirectorMode(true)
    setAddForm({ employee_id: "", role_on_site: "director_obra" })
    setAddOpen(true)
    await fetchEmployees()
  }

  async function handleConfirmTransfer() {
    if (!transferInfo || !obraId) return
    setSavingTransfer(true)
    setError(null)

    try {
      for (const assignmentId of transferInfo.assignmentIds) {
        const { error: delErr } = await supabase
          .from("obra_assignments")
          .delete()
          .eq("id", assignmentId)
        if (delErr) {
          console.error("delete transfer assignment error:", delErr)
          setError("No se pudo eliminar la asignacion anterior del empleado.")
          setSavingTransfer(false)
          return
        }
      }

      const { data: authData } = await supabase.auth.getUser()
      const created_by = authData?.user?.id ?? null

      const { error: insertErr } = await supabase.from("obra_assignments").insert({
        obra_id: obraId,
        employee_id: addForm.employee_id,
        role_on_site: addForm.role_on_site || null,
        created_by,
      })

      if (insertErr) {
        console.error("insert after transfer error:", insertErr)
        setError("No se pudo agregar al empleado a esta obra.")
        setSavingTransfer(false)
        return
      }

      logActivity({
        event_type: "team.member_added",
        entity_type: "team",
        entity_label: transferInfo.employeeName,
        metadata: { obra_id: obraId, from_obra: transferInfo.fromObraName, role_on_site: addForm.role_on_site, transferred: true },
      })
      setTransferConfirmOpen(false)
      setTransferInfo(null)
      setAddOpen(false)
      setSavingTransfer(false)
      await fetchMembers()
      onTeamChange?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al transferir empleado.")
      setSavingTransfer(false)
    }
  }

  function handleCancelTransfer() {
    setTransferConfirmOpen(false)
    setTransferInfo(null)
    setSavingTransfer(false)
    setAddOpen(true)
  }

  // ── Residencia (Foráneo) toggle — writes to employees table ──
  async function handleToggleForaneo(member: TeamMember) {
    const newVal = !member.is_foraneo
    // Optimistic update
    setMembers((prev: TeamMember[]) =>
      prev.map((m: TeamMember) =>
        m.employee_id === member.employee_id
          ? { ...m, is_foraneo: newVal, ...(newVal ? {} : { next_bajada_date: null, next_reingreso_date: null, residence_location: null }) }
          : m
      )
    )
    const updatePayload: Record<string, unknown> = { is_foraneo: newVal }
    if (!newVal) {
      updatePayload.next_bajada_date = null
      updatePayload.next_reingreso_date = null
      updatePayload.residence_location = null
    }
    const { error: updErr } = await supabase
      .from("employees")
      .update(updatePayload)
      .eq("id", member.employee_id)

    // If switching to local, delete any pending bajada notifications for this employee
    if (!newVal) {
      await supabase
        .from("bajada_notifications")
        .delete()
        .eq("employee_id", member.employee_id)
        .eq("obra_id", obraId)
        .eq("status", "pending")
    }

    if (updErr) {
      console.error("toggle foraneo error:", updErr)
      // Revert
      setMembers((prev: TeamMember[]) =>
        prev.map((m: TeamMember) =>
          m.employee_id === member.employee_id
            ? { ...m, is_foraneo: !newVal, next_bajada_date: member.next_bajada_date, next_reingreso_date: member.next_reingreso_date, residence_location: member.residence_location }
            : m
        )
      )
    }
  }

  // ── Lugar de residencia (editable inline cuando está vacío) ──
  async function handleSetResidence(member: TeamMember) {
    const val = (residenceDraft[member.employee_id] ?? "").trim()
    if (!val) return
    setMembers((prev: TeamMember[]) =>
      prev.map((m: TeamMember) =>
        m.employee_id === member.employee_id ? { ...m, residence_location: val } : m
      )
    )
    const { error } = await supabase
      .from("employees")
      .update({ residence_location: val })
      .eq("id", member.employee_id)
    if (error) {
      console.error("set residence error:", error)
      setMembers((prev: TeamMember[]) =>
        prev.map((m: TeamMember) =>
          m.employee_id === member.employee_id ? { ...m, residence_location: member.residence_location } : m
        )
      )
    }
  }

  // ── Viáticos (edición inline; registra historial vía /api/employee-salary-history) ──
  async function handleSaveViatics(member: TeamMember) {
    const raw = viaticsDraft[member.employee_id]
    if (raw === undefined) return // no se tocó
    const val = parseFloat(String(raw).replace(/[^0-9.]/g, ""))
    if (isNaN(val) || val < 0) {
      // valor inválido → descarta borrador
      setViaticsDraft((d) => { const n = { ...d }; delete n[member.employee_id]; return n })
      return
    }
    if (val === Number(member.viatics_amount ?? 0)) {
      // sin cambios → limpia borrador
      setViaticsDraft((d) => { const n = { ...d }; delete n[member.employee_id]; return n })
      return
    }

    setSavingViatics(member.employee_id)
    try {
      // Valores financieros actuales (no se deben pisar con 0)
      const { data: emp, error: empErr } = await supabase
        .from("employees")
        .select("real_salary, bonus_amount, overtime_hour_cost")
        .eq("id", member.employee_id)
        .single()
      if (empErr || !emp) {
        console.error("fetch employee financials error:", empErr)
        setError("No se pudieron leer los datos financieros del empleado.")
        return
      }

      const { data: authData } = await supabase.auth.getUser()
      const authUserId = authData?.user?.id ?? null

      const res = await fetch("/api/employee-salary-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: member.employee_id,
          real_salary: Number(emp.real_salary ?? 0),
          bonus_amount: Number(emp.bonus_amount ?? 0),
          overtime_hour_cost: Number(emp.overtime_hour_cost ?? 0),
          viatics_amount: val,
          authUserId,
          change_reason: "Editados desde obra",
        }),
      })
      const json = await res.json()
      if (!res.ok || json?.error) {
        console.error("save viatics error:", json)
        setError(json?.error || "No se pudieron guardar los viáticos.")
        return
      }

      // Éxito → actualiza UI y limpia borrador
      setMembers((prev: TeamMember[]) =>
        prev.map((m: TeamMember) =>
          m.employee_id === member.employee_id ? { ...m, viatics_amount: val } : m
        )
      )
      setViaticsDraft((d) => { const n = { ...d }; delete n[member.employee_id]; return n })
      logActivity({
        event_type: "employee.viatics_updated",
        entity_type: "employee",
        entity_id: member.employee_id,
        entity_label: member.full_name,
        metadata: { obra_id: obraId, viatics_amount: val, source: "obra" },
      })
    } finally {
      setSavingViatics(null)
    }
  }

  // ── Fecha de bajada (viaje redondo: salida + reingreso, cualquier día) ──

  /** Borra notificaciones pendientes del empleado en esta obra (fechas cambiaron) */
  async function clearPendingBajadaNotifications(employeeId: string) {
    await supabase
      .from("bajada_notifications")
      .delete()
      .eq("employee_id", employeeId)
      .eq("obra_id", obraId)
      .eq("status", "pending")
  }

  async function saveBajadaRange(member: TeamMember, salida: string | null, reingreso: string | null) {
    // Optimista
    setMembers((prev: TeamMember[]) =>
      prev.map((m: TeamMember) =>
        m.employee_id === member.employee_id
          ? { ...m, next_bajada_date: salida, next_reingreso_date: reingreso }
          : m
      )
    )
    const { error: updErr } = await supabase
      .from("employees")
      .update({ next_bajada_date: salida, next_reingreso_date: reingreso })
      .eq("id", member.employee_id)
    if (updErr) {
      console.error("save bajada range error:", updErr)
      setMembers((prev: TeamMember[]) =>
        prev.map((m: TeamMember) =>
          m.employee_id === member.employee_id
            ? { ...m, next_bajada_date: member.next_bajada_date, next_reingreso_date: member.next_reingreso_date }
            : m
        )
      )
      return
    }
    await clearPendingBajadaNotifications(member.employee_id)
  }

  /** Manejo manual de los 2 clics: 1° = salida, 2° = reingreso (cierra al 2°) */
  async function handleBajadaDayClick(member: TeamMember, day: Date) {
    const clicked = toDateStr(day)
    const hasStart = !!member.next_bajada_date
    const hasEnd = !!member.next_reingreso_date

    if (!hasStart || (hasStart && hasEnd)) {
      // Primer clic (rango nuevo): fija la salida, espera el reingreso
      await saveBajadaRange(member, clicked, null)
      return
    }
    // Segundo clic: completa el rango (ordena por si eligen antes de la salida)
    const start = member.next_bajada_date as string
    const salida = clicked >= start ? start : clicked
    const reingreso = clicked >= start ? clicked : start
    await saveBajadaRange(member, salida, reingreso)
    setBajadaCalOpen(null)
  }

  async function handleBajadaClear(member: TeamMember) {
    await saveBajadaRange(member, null, null)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-100">Equipo de la obra</h2>
          <p className="text-sm text-slate-400">Asignaciones del personal a esta obra.</p>
        </div>

        <div className="flex gap-2">
          {obraInfo && members.filter(isActiveAssignment).length > 0 && (
            <Button
              variant="outline"
              onClick={handleGeneratePDF}
              disabled={generatingPdf || loading}
              className={`${btnOutlineCls} cursor-pointer`}
            >
              {generatingPdf
                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                : <FileDown className="w-4 h-4 mr-2" />}
              {generatingPdf ? "Generando..." : "Generar PDF"}
            </Button>
          )}

          {allowManage && (
            <Button onClick={handleOpenAdd} className="bg-[#0174bd] hover:bg-[#015a94] text-white cursor-pointer">
              <UserPlus className="w-4 h-4 mr-2" />
              Agregar miembro
            </Button>
          )}
        </div>
      </div>

      {/* Cards de Directores de Obra (hasta 2) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
        {[0, ...(showSecondSlot ? [1] : [])].map((slot) => {
          const dir = directors[slot] ?? null
          return (
            <div
              key={slot}
              className="rounded-2xl border border-amber-500/20 overflow-hidden"
              style={{
                background: "linear-gradient(145deg, #1e2a1a 0%, #1a2318 60%, #1e2a1a 100%)",
                boxShadow: "inset 0 1px 0 rgba(255,200,0,0.04)",
              }}
            >
              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="p-2 rounded-md bg-amber-500/10 border border-amber-500/20 shrink-0">
                        <Crown className="w-4 h-4 text-amber-400" />
                      </div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        Director de Obra {showSecondSlot ? `${slot + 1}` : ""}
                      </p>
                      {dir && (
                        <Badge className="bg-amber-500/15 text-amber-300 border border-amber-500/25 text-xs">Activo</Badge>
                      )}
                    </div>

                    <p className="text-xl font-bold text-slate-100 truncate">
                      {dir?.full_name ?? "Sin asignar"}
                    </p>

                    <div className="text-sm text-slate-500">
                      {dir ? (
                        <span className="font-mono text-xs">
                          Desde {dir.assigned_from}
                        </span>
                      ) : (
                        <span className="text-slate-600 text-xs">
                          Ningun director asignado en este slot.
                        </span>
                      )}
                    </div>
                  </div>

                  {allowManage && (
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          dir ? handleUpdateDirector(dir) : handleAssignDirectorShortcut()
                        }
                        className={btnOutlineCls}
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        {dir ? "Actualizar" : "Asignar"}
                      </Button>
                      {dir && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          onClick={() => handleRemoveMember(dir)}
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Quitar
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {/* Boton para agregar segundo slot */}
        {allowManage && !showSecondSlot && directors.length < 2 && (
          <button
            onClick={() => {
              setShowSecondSlot(true)
              handleAssignDirectorShortcut()
            }}
            className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-700 p-5 text-slate-600 hover:border-amber-500/40 hover:text-amber-400 transition-colors min-h-[110px] w-full"
          >
            <div className="p-2 rounded-full border-2 border-current">
              <Plus className="w-4 h-4" />
            </div>
            <span className="text-sm font-medium">Agregar 2 Director de Obra</span>
          </button>
        )}
      </div>

      {/* filtros */}
      <div
        className="rounded-2xl border border-slate-700/60 overflow-hidden"
        style={{
          background: "linear-gradient(145deg, #1e293b 0%, #172030 60%, #1a2535 100%)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        <div className="p-4 flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
            <Input
              placeholder="Buscar por nombre o puesto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`sm:w-64 ${inputCls}`}
            />

            <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as any)}>
              <SelectTrigger className={`w-full sm:w-56 ${selectTriggerCls}`}>
                <SelectValue placeholder="Rol en obra" />
              </SelectTrigger>
              <SelectContent className={selectContentCls}>
                <SelectItem value="all">Todos</SelectItem>
                {ROLE_ON_SITE_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="text-sm text-slate-500">
            Total: <span className="font-semibold text-slate-300">{members.length}</span>
          </div>
        </div>
      </div>

      {/* error */}
      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* tabla */}
      <div
        className="rounded-2xl border border-slate-700/60 overflow-hidden"
        style={{
          background: "linear-gradient(145deg, #1e293b 0%, #172030 60%, #1a2535 100%)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        <div className="p-5 border-b border-slate-700/60">
          <h3 className="text-base font-semibold text-slate-100">Miembros</h3>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="py-10 text-center text-slate-500 text-sm">Cargando equipo...</div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-slate-500 text-sm">
              No hay miembros asignados aun.
              {allowManage && (
                <div className="mt-2">
                  <Button
                    size="sm"
                    onClick={handleOpenAdd}
                    className="bg-[#0174bd] hover:bg-[#0174bd]/90 text-white"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Agregar el primero
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-md border border-slate-700/60 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700/60 hover:bg-slate-800/40">
                    <TableHead className="text-slate-400">Empleado</TableHead>
                    <TableHead className="text-slate-400">Rol en obra</TableHead>
                    <TableHead className="text-slate-400 text-center">Residencia</TableHead>
                    <TableHead className="text-slate-400">Lugar</TableHead>
                    <TableHead className="text-slate-400">Fecha de bajada</TableHead>
                    <TableHead className="text-slate-400">Viáticos</TableHead>
                    <TableHead className="text-slate-400">Asignación</TableHead>
                    <TableHead className="text-right text-slate-400">Acciones</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {filtered.map((m) => (
                    <TableRow key={m.assignment_id} className="border-slate-700/40 hover:bg-slate-800/40">
                      <TableCell>
                        <div className="space-y-0.5">
                          <p className="font-medium text-slate-200">{m.full_name}</p>
                          <p className="text-xs text-slate-600 font-mono">{m.employee_id}</p>
                        </div>
                      </TableCell>

                      <TableCell>
                        <Badge className="bg-slate-700/60 text-slate-300 border border-slate-600">
                          {normalizeRoleLabel(m.role_on_site)}
                        </Badge>
                      </TableCell>

                      {/* Residencia (Foráneo toggle) */}
                      <TableCell className="text-center">
                        {(() => {
                          const locked = isBajadaLocked(m)
                          if (locked) {
                            // Confirmed bajada — green with check, not clickable
                            return (
                              <span
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border bg-emerald-500/15 text-emerald-300 border-emerald-500/25 cursor-default"
                                title="Bajada confirmada — bloqueado hasta que pase el fin de semana"
                              >
                                <Check className="w-3 h-3" />
                                Foraneo
                              </span>
                            )
                          }
                          if (allowManage) {
                            return (
                              <button
                                onClick={() => handleToggleForaneo(m)}
                                className={`
                                  inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold
                                  transition-all duration-200 cursor-pointer border
                                  ${m.is_foraneo
                                    ? "bg-amber-500/15 text-amber-300 border-amber-500/25 hover:bg-amber-500/25"
                                    : "bg-slate-700/40 text-slate-500 border-slate-600/50 hover:bg-slate-700/60 hover:text-slate-400"
                                  }
                                `}
                              >
                                <span className={`w-2 h-2 rounded-full ${m.is_foraneo ? "bg-amber-400" : "bg-slate-600"}`} />
                                {m.is_foraneo ? "Foraneo" : "Local"}
                              </button>
                            )
                          }
                          return (
                            <span className={`text-xs font-medium ${m.is_foraneo ? "text-amber-300" : "text-slate-500"}`}>
                              {m.is_foraneo ? "Foraneo" : "Local"}
                            </span>
                          )
                        })()}
                      </TableCell>

                      {/* Lugar (residence_location) — editable inline cuando está vacío */}
                      <TableCell className="text-sm">
                        {!m.is_foraneo ? (
                          <span className="text-slate-600">—</span>
                        ) : m.residence_location ? (
                          <span className="text-slate-300">{m.residence_location}</span>
                        ) : allowManage ? (
                          <input
                            type="text"
                            value={residenceDraft[m.employee_id] ?? ""}
                            onChange={(e) => setResidenceDraft((d) => ({ ...d, [m.employee_id]: e.target.value }))}
                            onBlur={() => handleSetResidence(m)}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur() } }}
                            placeholder="Agregar lugar…"
                            className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-300 focus:border-[#0174bd]/60 outline-none w-[150px] placeholder:text-slate-600"
                          />
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </TableCell>

                      {/* Fecha de bajada (salida → reingreso, cualquier día) */}
                      <TableCell>
                        {(() => {
                          const locked = isBajadaLocked(m)
                          if (!m.is_foraneo && !locked) {
                            return <span className="text-xs text-slate-600">-</span>
                          }
                          const fmt = (s: string | null) =>
                            s ? new Date(s + "T00:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "short" }) : "—"
                          if (locked) {
                            return (
                              <div className="flex items-center gap-1.5" title="Bloqueado — bajada confirmada">
                                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                <span className="text-xs text-emerald-300 font-medium">
                                  {fmt(m.next_bajada_date)} → {fmt(m.next_reingreso_date)}
                                </span>
                              </div>
                            )
                          }
                          if (allowManage) {
                            const range: DateRange | undefined = m.next_bajada_date
                              ? {
                                  from: new Date(m.next_bajada_date + "T00:00:00"),
                                  to: m.next_reingreso_date ? new Date(m.next_reingreso_date + "T00:00:00") : undefined,
                                }
                              : undefined
                            const label = m.next_bajada_date
                              ? `${fmt(m.next_bajada_date)} → ${m.next_reingreso_date ? fmt(m.next_reingreso_date) : "…"}`
                              : "Definir fechas"
                            return (
                              <Popover
                                open={bajadaCalOpen === m.employee_id}
                                onOpenChange={(o) => setBajadaCalOpen(o ? m.employee_id : null)}
                              >
                                <PopoverTrigger asChild>
                                  <button className="inline-flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-300 hover:border-[#0174bd]/60 cursor-pointer">
                                    <CalendarDays className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                    <span className={m.next_bajada_date ? "" : "text-slate-500"}>{label}</span>
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent align="start" className="w-auto p-0 bg-slate-800 border-slate-700 text-slate-200">
                                  <Calendar
                                    mode="range"
                                    numberOfMonths={1}
                                    defaultMonth={range?.from}
                                    selected={range}
                                    onSelect={() => {}}
                                    onDayClick={(day: Date) => handleBajadaDayClick(m, day)}
                                    className={[
                                      "[&_[data-day]]:text-slate-200",
                                      "[&_[data-day]:hover]:!bg-slate-700 [&_[data-day]:hover]:!text-white",
                                      "[&_[data-selected-single=true]]:!bg-[#0174bd] [&_[data-selected-single=true]]:!text-white",
                                      "[&_[data-range-start=true]]:!bg-[#0174bd] [&_[data-range-start=true]]:!text-white",
                                      "[&_[data-range-end=true]]:!bg-[#0174bd] [&_[data-range-end=true]]:!text-white",
                                      "[&_[data-range-middle=true]]:!bg-[#0174bd]/30 [&_[data-range-middle=true]]:!text-slate-100",
                                    ].join(" ")}
                                    classNames={{
                                      weekday: "text-slate-500 flex-1 font-normal text-[0.8rem] select-none",
                                      caption_label: "text-slate-200 text-sm font-medium select-none",
                                      month_caption: "flex items-center justify-center h-8 w-full px-8 text-slate-200",
                                      button_previous: "size-8 p-0 text-slate-300 hover:bg-slate-700 rounded-md aria-disabled:opacity-40",
                                      button_next: "size-8 p-0 text-slate-300 hover:bg-slate-700 rounded-md aria-disabled:opacity-40",
                                      today:
                                        "rounded-full bg-[#0174bd]/25 ring-2 ring-inset ring-[#0174bd] text-[#4da8e8] font-semibold animate-pulse " +
                                        "data-[selected=true]:animate-none data-[selected=true]:bg-transparent data-[selected=true]:ring-0 data-[selected=true]:text-inherit",
                                      outside: "text-slate-600",
                                      disabled: "text-slate-700 opacity-50",
                                    }}
                                  />
                                  <div className="flex items-center justify-between gap-2 border-t border-slate-700 px-3 py-2">
                                    <span className="text-[11px] text-slate-500">1° clic salida · 2° clic reingreso</span>
                                    <button
                                      onClick={() => handleBajadaClear(m)}
                                      className="text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer"
                                    >
                                      Limpiar
                                    </button>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            )
                          }
                          return (
                            <span className="text-xs text-slate-400 font-mono">
                              {(m.next_bajada_date ?? "-")} → {(m.next_reingreso_date ?? "-")}
                            </span>
                          )
                        })()}
                      </TableCell>

                      {/* Viáticos (editable solo para foráneos; registra historial) */}
                      <TableCell>
                        {!m.is_foraneo ? (
                          <span className="text-slate-600">—</span>
                        ) : allowManage ? (
                          <div className="flex items-center gap-1">
                            <span className="text-slate-500 text-xs">$</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={viaticsDraft[m.employee_id] ?? String(m.viatics_amount ?? 0)}
                              onChange={(e) => setViaticsDraft((d) => ({ ...d, [m.employee_id]: e.target.value }))}
                              onBlur={() => handleSaveViatics(m)}
                              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur() } }}
                              disabled={savingViatics === m.employee_id}
                              className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-300 focus:border-[#0174bd]/60 outline-none w-[100px] disabled:opacity-50"
                            />
                            {savingViatics === m.employee_id && (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500 shrink-0" />
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-300 font-mono">
                            ${Number(m.viatics_amount ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                          </span>
                        )}
                      </TableCell>

                      <TableCell className="text-sm text-slate-400">
                        <span className="font-mono text-xs">
                          {m.assigned_from}
                          {m.assigned_to ? `  ${m.assigned_to}` : ""}
                        </span>
                        {!isActiveAssignment(m) && (
                          <div className="text-xs text-slate-600 mt-1">historico</div>
                        )}
                      </TableCell>

                      <TableCell className="text-right">
                        {allowManage ? (
                          <Button variant="destructive" size="icon" onClick={() => handleRemoveMember(m)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        ) : (
                          <span className="text-xs text-slate-600">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* Modal agregar */}
      <Dialog open={addOpen} onOpenChange={(v) => (savingAdd ? null : setAddOpen(v))}>
        <DialogContent className="max-w-xl bg-slate-800 border-slate-700 text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-slate-100">
              {directorMode ? "Asignar Director de Obra" : "Agregar miembro al equipo"}
            </DialogTitle>
          </DialogHeader>

          <div
            className="space-y-4 mt-2"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !savingAdd && addForm.employee_id && addForm.employee_id !== "__none__")
                handleAddMember()
            }}
          >
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-400">Rol en obra</label>

              {directorMode ? (
                <div className="flex items-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2">
                  <Crown className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-sm font-medium text-amber-300">Director de Obra</span>
                </div>
              ) : (
                <Select
                  value={addForm.role_on_site}
                  onValueChange={(v) => setAddForm((f) => ({ ...f, role_on_site: v, employee_id: "" }))}
                >
                  <SelectTrigger className={selectTriggerCls}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className={selectContentCls}>
                    {ROLE_ON_SITE_OPTIONS.filter((r) => r.value !== "director_obra").map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {directorMode && (
                <p className="text-[11px] text-slate-500">
                  Puedes tener hasta 2 Directores de Obra activos al mismo tiempo.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-400">
                Empleado *
              </label>

              <Select
                value={addForm.employee_id}
                onValueChange={(v) => setAddForm((f) => ({ ...f, employee_id: v }))}
              >
                <SelectTrigger className={selectTriggerCls}>
                  <SelectValue
                    placeholder={
                      employeesLoading
                        ? "Cargando..."
                        : `Selecciona un empleado`
                    }
                  />
                </SelectTrigger>

                <SelectContent className={selectContentCls}>
                  {employeesForModal.length === 0 ? (
                    <SelectItem value="__none__" disabled>
                      {`No hay empleados con el rol "${normalizeRoleLabel(addForm.role_on_site)}" en el catalogo`}
                    </SelectItem>
                  ) : (
                    employeesForModal.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.full_name}
                        {e.position_title ? ` - ${e.position_title}` : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>

              {!directorMode && (
                <p className="text-[11px] text-slate-500">
                  {`Mostrando empleados con rol "${normalizeRoleLabel(addForm.role_on_site)}" en el catalogo.`}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddOpen(false)}
                disabled={savingAdd}
                className={btnOutlineCls}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleAddMember}
                disabled={savingAdd || !addForm.employee_id || addForm.employee_id === "__none__"}
                className="bg-[#0174bd] hover:bg-[#0174bd]/90 text-white"
              >
                {savingAdd ? "Guardando..." : "Agregar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmacion de transferencia */}
      <Dialog open={transferConfirmOpen} onOpenChange={(v) => (savingTransfer ? null : setTransferConfirmOpen(v))}>
        <DialogContent className="max-w-md bg-slate-800 border-slate-700 text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Transferir empleado</DialogTitle>
          </DialogHeader>

          <div
            className="space-y-4 mt-2"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !savingTransfer) handleConfirmTransfer()
            }}
          >
            {transferInfo && (
              <p className="text-sm text-slate-300 leading-relaxed">
                Seguro que quieres agregar a{" "}
                <span className="font-semibold text-slate-100">"{transferInfo.employeeName}"</span>{" "}
                a esta obra? Actualmente se encuentra en el equipo de la obra{" "}
                <span className="font-semibold text-slate-100">"{transferInfo.fromObraName}"</span>.
                Si aceptas, sera transferido a esta obra y eliminado de la otra.
              </p>
            )}

            {error && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancelTransfer}
                disabled={savingTransfer}
                className={btnOutlineCls}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleConfirmTransfer}
                disabled={savingTransfer}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {savingTransfer ? "Transfiriendo..." : "Confirmar transferencia"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
