"use client"

import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, RefreshCw, Trash2, UserPlus, Crown } from "lucide-react"

type EmployeeRow = {
  id: string
  full_name: string
  position_title: string | null
  status: "active" | "inactive" | string
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
    | { full_name: string; position_title: string | null; status: string }
    | { full_name: string; position_title: string | null; status: string }[]
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
  created_at: string
}

type Props = {
  obraId: string
  allowManage?: boolean
}

/**
 * Convención:
 * - role_on_site = 'manager' => Jefe de Obra (Manager)
 * - el resto son libres (ej. 'engineer', 'worker', etc.)
 */
const ROLE_ON_SITE_OPTIONS = [
  { value: "manager", label: "Manager (Jefe de Obra)" },
  { value: "site_supervisor", label: "Site Supervisor" },
  { value: "engineer", label: "Engineer" },
  { value: "safety", label: "Safety" },
  { value: "quality", label: "Quality" },
  { value: "worker", label: "Worker" },
]

function normalizeRoleLabel(v: string | null) {
  if (!v) return "-"
  const found = ROLE_ON_SITE_OPTIONS.find((x) => x.value === v)
  return found?.label ?? v
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function isActiveAssignment(a: TeamMember) {
  if (!a.assigned_to) return true
  return a.assigned_to >= todayISO()
}

/**
 * “Employee es manager” lo inferimos por position_title
 * (no existe un campo role en employees según tu schema)
 */
function isEmployeeManager(e: EmployeeRow | null | undefined) {
  const t = (e?.position_title || "").trim().toLowerCase()
  if (!t) return false
  // tolerante: "manager", "project manager", "site manager", etc.
  return t.includes("manager")
}

export function ProjectTeamTab({ obraId, allowManage = true }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [members, setMembers] = useState<TeamMember[]>([])

  // filtros
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState<"all" | string>("all")

  // modal add
  const [addOpen, setAddOpen] = useState(false)
  const [savingAdd, setSavingAdd] = useState(false)

  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [employeesLoading, setEmployeesLoading] = useState(false)

  const [addForm, setAddForm] = useState({
    employee_id: "",
    role_on_site: "worker",
  })

  async function fetchMembers() {
    if (!obraId) return
    setLoading(true)
    setError(null)

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
        employees(full_name, position_title, status)
      `,
      )
      .eq("obra_id", obraId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("fetchMembers error:", error)
      setMembers([])
      setError("No se pudo cargar el equipo.")
      setLoading(false)
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
        created_at: r.created_at,
      }
    })

    setMembers(ui)
    setLoading(false)
  }

  async function fetchEmployees() {
    setEmployeesLoading(true)

    // solo activos por default (como estabas manejando)
    const { data, error } = await supabase
      .from("employees")
      .select("id, full_name, position_title, status")
      .eq("status", "active")
      .order("full_name", { ascending: true })

    if (error) {
      console.error("fetchEmployees error:", error)
      setEmployees([])
      setEmployeesLoading(false)
      return
    }

    setEmployees((data || []) as EmployeeRow[])
    setEmployeesLoading(false)
  }

  async function handleOpenAdd() {
    setError(null)
    setAddForm({ employee_id: "", role_on_site: "worker" })
    setAddOpen(true)
    await fetchEmployees()
  }

  /**
   * Cierra cualquier MANAGER activo previo para la misma obra (evita 2 managers activos).
   * - “activo” aquí = assigned_to IS NULL OR assigned_to >= hoy
   * - Setea assigned_to = hoy
   */
  async function closeActiveManagerAssignments() {
    const today = todayISO()

    const { error } = await supabase
      .from("obra_assignments")
      .update({ assigned_to: today })
      .eq("obra_id", obraId)
      .eq("role_on_site", "manager")
      .or(`assigned_to.is.null,assigned_to.gte.${today}`)

    if (error) {
      console.error("closeActiveManagerAssignments error:", error)
      throw new Error("No se pudo cerrar el manager anterior.")
    }
  }

  async function handleAddMember() {
    if (!obraId) return
    if (!addForm.employee_id) {
      setError("Selecciona un empleado.")
      return
    }

    setSavingAdd(true)
    setError(null)

    // Evitar duplicado activo para el mismo empleado
    const alreadyActive = members.some(
      (m) => m.employee_id === addForm.employee_id && isActiveAssignment(m),
    )
    if (alreadyActive) {
      setError("Este empleado ya está asignado actualmente a la obra.")
      setSavingAdd(false)
      return
    }

    // Validación extra: si vas a asignar MANAGER, el empleado debe ser manager (por position_title)
    const selectedEmp = employees.find((e) => e.id === addForm.employee_id) ?? null
    if (addForm.role_on_site === "manager" && !isEmployeeManager(selectedEmp)) {
      setError('Solo puedes asignar como "manager" a empleados cuyo puesto (position_title) sea manager.')
      setSavingAdd(false)
      return
    }

    // created_by (opcional)
    const { data: authData } = await supabase.auth.getUser()
    const created_by = authData?.user?.id ?? null

    try {
      // 🔒 Evitar 2 managers activos
      if (addForm.role_on_site === "manager") {
        await closeActiveManagerAssignments()
      }

      const payload = {
        obra_id: obraId,
        employee_id: addForm.employee_id,
        role_on_site: addForm.role_on_site || null,
        // assigned_from default CURRENT_DATE en DB
        created_by,
      }

      const { error } = await supabase.from("obra_assignments").insert(payload)
      if (error) {
        console.error("insert obra_assignments error:", error)
        setError("No se pudo agregar al miembro.")
        setSavingAdd(false)
        return
      }

      setAddOpen(false)
      setSavingAdd(false)
      await fetchMembers()
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar la asignación.")
      setSavingAdd(false)
    }
  }

  async function handleRemoveMember(member: TeamMember) {
    const ok = window.confirm(`¿Quitar a "${member.full_name}" de esta obra?`)
    if (!ok) return

    const { error } = await supabase.from("obra_assignments").delete().eq("id", member.assignment_id)
    if (error) {
      console.error("delete obra_assignments error:", error)
      setError("No se pudo quitar el miembro.")
      return
    }

    await fetchMembers()
  }

  useEffect(() => {
    fetchMembers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obraId])

  const manager = useMemo(() => {
    const managers = members.filter((m) => (m.role_on_site || "").toLowerCase() === "manager")
    if (managers.length === 0) return null
    const active = managers.find((m) => isActiveAssignment(m))
    return active ?? managers[0]
  }, [members])

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

  // 👇 Lista de empleados que se muestran en el modal
  // Si estás asignando MANAGER, solo muestra los employees cuyo position_title “parezca manager”
  const employeesForModal = useMemo(() => {
    if (addForm.role_on_site !== "manager") return employees
    return employees.filter((e) => isEmployeeManager(e))
  }, [employees, addForm.role_on_site])

  async function handleAssignManagerShortcut() {
    // abre modal ya en modo manager
    setAddForm({ employee_id: "", role_on_site: "manager" })
    setError(null)
    setAddOpen(true)
    await fetchEmployees()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Equipo de la obra</h2>
          <p className="text-sm text-slate-600">Asignaciones del personal a esta obra.</p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchMembers} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refrescar
          </Button>

          {allowManage && (
            <Button onClick={handleOpenAdd}>
              <UserPlus className="w-4 h-4 mr-2" />
              Agregar miembro
            </Button>
          )}
        </div>
      </div>

      {/* ⭐ Card Manager */}
      <Card className="border-slate-200">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-md bg-amber-50 border border-amber-100">
                  <Crown className="w-5 h-5 text-amber-600" />
                </div>
                <p className="text-sm font-semibold text-slate-900">Jefe de Obra (manager)</p>
                <Badge className="bg-amber-100 text-amber-800">Manager</Badge>
              </div>

              <p className="text-2xl font-bold text-slate-900">{manager?.full_name ?? "Sin asignar"}</p>

              <div className="text-sm text-slate-600">
                {manager ? (
                  <>
                    <span className="font-medium">{manager.position_title ?? "—"}</span>
                    <span className="text-slate-400 mx-2">•</span>
                    <span className="font-mono text-xs">
                      desde {manager.assigned_from}
                      {manager.assigned_to ? ` hasta ${manager.assigned_to}` : ""}
                    </span>
                  </>
                ) : (
                  <span>
                    Asigna un empleado con rol <span className="font-mono">manager</span> para mostrarlo aquí.
                  </span>
                )}
              </div>
            </div>

            {allowManage && (
              <Button variant="outline" onClick={handleAssignManagerShortcut}>
                <Plus className="w-4 h-4 mr-2" />
                Asignar manager
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* filtros */}
      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
            <Input
              placeholder="Buscar por nombre o puesto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="sm:w-64"
            />

            <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as any)}>
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue placeholder="Rol en obra" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {ROLE_ON_SITE_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="text-sm text-slate-600">
            Total: <span className="font-semibold text-slate-900">{members.length}</span>
          </div>
        </CardContent>
      </Card>

      {/* error */}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* tabla */}
      <Card>
        <CardHeader>
          <CardTitle>Miembros</CardTitle>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="py-10 text-center text-slate-500 text-sm">Cargando equipo...</div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-slate-500 text-sm">
              No hay miembros asignados aún.
              {allowManage && (
                <div className="mt-2">
                  <Button size="sm" onClick={handleOpenAdd}>
                    <Plus className="w-4 h-4 mr-2" />
                    Agregar el primero
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empleado</TableHead>
                    <TableHead>Puesto</TableHead>
                    <TableHead>Rol en obra</TableHead>
                    <TableHead>Asignación</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {filtered.map((m) => (
                    <TableRow key={m.assignment_id}>
                      <TableCell>
                        <div className="space-y-0.5">
                          <p className="font-medium text-slate-900">{m.full_name}</p>
                          <p className="text-xs text-slate-500 font-mono">{m.employee_id}</p>
                        </div>
                      </TableCell>

                      <TableCell className="text-sm text-slate-600">
                        {m.position_title ?? "-"}
                        {String(m.employee_status).toLowerCase() !== "active" && (
                          <span className="ml-2 text-xs text-red-600">(inactive)</span>
                        )}
                      </TableCell>

                      <TableCell>
                        <Badge className="bg-slate-100 text-slate-700">{normalizeRoleLabel(m.role_on_site)}</Badge>
                      </TableCell>

                      <TableCell className="text-sm text-slate-600">
                        <span className="font-mono text-xs">
                          {m.assigned_from}
                          {m.assigned_to ? ` → ${m.assigned_to}` : ""}
                        </span>
                        {!isActiveAssignment(m) && <div className="text-xs text-slate-400 mt-1">histórico</div>}
                      </TableCell>

                      <TableCell className="text-right">
                        {allowManage ? (
                          <Button variant="destructive" size="icon" onClick={() => handleRemoveMember(m)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal agregar */}
      <Dialog open={addOpen} onOpenChange={(v) => (savingAdd ? null : setAddOpen(v))}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Agregar miembro al equipo</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-600">Rol en obra</label>
              <Select
                value={addForm.role_on_site}
                onValueChange={(v) => setAddForm((f) => ({ ...f, role_on_site: v, employee_id: "" }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_ON_SITE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <p className="text-[11px] text-slate-500">
                Si eliges <span className="font-mono">manager</span>, el sistema cerrará al manager activo anterior.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-600">
                Empleado {addForm.role_on_site === "manager" ? '(solo "managers")' : ""} *
              </label>

              <Select
                value={addForm.employee_id}
                onValueChange={(v) => setAddForm((f) => ({ ...f, employee_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      employeesLoading
                        ? "Cargando..."
                        : addForm.role_on_site === "manager"
                        ? "Selecciona un manager"
                        : "Selecciona un empleado"
                    }
                  />
                </SelectTrigger>

                <SelectContent>
                  {employeesForModal.length === 0 ? (
                    <SelectItem value="__none__" disabled>
                      {addForm.role_on_site === "manager"
                        ? 'No hay employees con position_title que contenga "manager"'
                        : "No hay empleados disponibles"}
                    </SelectItem>
                  ) : (
                    employeesForModal.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.full_name}
                        {e.position_title ? ` — ${e.position_title}` : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>

              {addForm.role_on_site === "manager" && (
                <p className="text-[11px] text-slate-500">
                  Se filtra por <span className="font-mono">employees.position_title</span> que incluya “manager”.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)} disabled={savingAdd}>
                Cancelar
              </Button>
              <Button
                onClick={handleAddMember}
                disabled={savingAdd || !addForm.employee_id || addForm.employee_id === "__none__"}
              >
                {savingAdd ? "Guardando..." : "Agregar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
