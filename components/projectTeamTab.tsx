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
  return new Date().toISOString().slice(0, 10)
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

export function ProjectTeamTab({ obraId, allowManage = true, onTeamChange }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [members, setMembers] = useState<TeamMember[]>([])

  // filtros
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState<"all" | string>("all")

  // modal add
  const [addOpen, setAddOpen] = useState(false)
  const [savingAdd, setSavingAdd] = useState(false)
  // true cuando se abre desde "Asignar Director" - bloquea el selector de rol
  const [directorMode, setDirectorMode] = useState(false)

  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [employeesLoading, setEmployeesLoading] = useState(false)

  const [addForm, setAddForm] = useState({
    employee_id: "",
    role_on_site: "ayudante_obra",
  })

  // Segundo slot de Director de Obra
  const [showSecondSlot, setShowSecondSlot] = useState(false)
  // ID del assignment a reemplazar cuando se hace "Actualizar" en un card de director
  const [replacingDirectorAssignmentId, setReplacingDirectorAssignmentId] = useState<string | null>(null)

  // Transferencia de empleado entre obras
  const [transferConfirmOpen, setTransferConfirmOpen] = useState(false)
  const [savingTransfer, setSavingTransfer] = useState(false)
  const [transferInfo, setTransferInfo] = useState<{
    employeeName: string
    fromObraName: string
    assignmentIds: string[]   // puede haber >1 si hubo datos sucios previos
  } | null>(null)

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

    // Evitar duplicado activo para el mismo empleado
    const alreadyActive = members.some(
      (m) => m.employee_id === addForm.employee_id && isActiveAssignment(m),
    )
    if (alreadyActive) {
      setError("Este empleado ya esta asignado actualmente a la obra.")
      setSavingAdd(false)
      return
    }

    // El empleado debe tener el rol director_obra en el catalogo
    const selectedEmp = employees.find((e) => e.id === addForm.employee_id) ?? null
    if (addForm.role_on_site === "director_obra" && !isEmployeeDirectorObra(selectedEmp)) {
      setError("Solo puedes asignar como Director de Obra a empleados que tengan ese rol en el catalogo.")
      setSavingAdd(false)
      return
    }

    // Maximo 2 directores activos por obra
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

    // Para roles que NO son director, verificar si el empleado ya esta en otra obra
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
        return  // Pausar - esperar confirmacion del usuario
      }
    }

    const { data: authData } = await supabase.auth.getUser()
    const created_by = authData?.user?.id ?? null

    try {
      // Si se esta reemplazando un director especifico, eliminar su asignacion primero
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

    await fetchMembers()
    onTeamChange?.()
  }

  useEffect(() => {
    fetchMembers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obraId])

  // Hasta 2 directores de obra activos simultaneamente
  const directors = useMemo(() => {
    return members
      .filter((m) => (m.role_on_site || "") === "director_obra" && isActiveAssignment(m))
      .slice(0, 2)
  }, [members])

  // Revela el segundo slot si ya hay 2 directores asignados
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

  //  Siempre filtra empleados por el rol seleccionado en el modal
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
      // 1. Eliminar las asignaciones activas del empleado en la otra obra
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

      // 2. Insertar la nueva asignacion en esta obra
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

      // 3. Limpiar estado y refrescar
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
    // Dejar el modal de agregar abierto para que el usuario pueda elegir otro empleado
    setAddOpen(true)
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

      {/* Cards de Directores de Obra (hasta 2) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
        {/* Slot 1 - siempre visible */}
        {[0, ...(showSecondSlot ? [1] : [])].map((slot) => {
          const dir = directors[slot] ?? null
          return (
            <Card key={slot} className="border-amber-100">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="p-2 rounded-md bg-amber-50 border border-amber-100 shrink-0">
                        <Crown className="w-4 h-4 text-amber-600" />
                      </div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        Director de Obra {showSecondSlot ? `${slot + 1}` : ""}
                      </p>
                      {dir && (
                        <Badge className="bg-amber-100 text-amber-800 text-xs">Activo</Badge>
                      )}
                    </div>

                    <p className="text-xl font-bold text-slate-900 truncate">
                      {dir?.full_name ?? "Sin asignar"}
                    </p>

                    <div className="text-sm text-slate-500">
                      {dir ? (
                        <span className="font-mono text-xs">
                          Desde {dir.assigned_from}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">
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
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        {dir ? "Actualizar" : "Asignar"}
                      </Button>
                      {dir && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleRemoveMember(dir)}
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Quitar
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}

        {/* Boton para agregar segundo slot */}
        {allowManage && !showSecondSlot && directors.length < 2 && (
          <button
            onClick={() => {
              setShowSecondSlot(true)
              handleAssignDirectorShortcut()
            }}
            className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 p-5 text-slate-400 hover:border-amber-300 hover:text-amber-600 transition-colors min-h-[110px] w-full"
          >
            <div className="p-2 rounded-full border-2 border-current">
              <Plus className="w-4 h-4" />
            </div>
            <span className="text-sm font-medium">Agregar 2 Director de Obra</span>
          </button>
        )}
      </div>

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
              No hay miembros asignados aun.
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
                    <TableHead>Asignacion</TableHead>
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
                          {m.assigned_to ? `  ${m.assigned_to}` : ""}
                        </span>
                        {!isActiveAssignment(m) && <div className="text-xs text-slate-400 mt-1">historico</div>}
                      </TableCell>

                      <TableCell className="text-right">
                        {allowManage ? (
                          <Button variant="destructive" size="icon" onClick={() => handleRemoveMember(m)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
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
            <DialogTitle>
              {directorMode ? "Asignar Director de Obra" : "Agregar miembro al equipo"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-600">Rol en obra</label>

              {directorMode ? (
                <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                  <Crown className="w-4 h-4 text-amber-600 shrink-0" />
                  <span className="text-sm font-medium text-amber-800">Director de Obra</span>
                </div>
              ) : (
                <Select
                  value={addForm.role_on_site}
                  onValueChange={(v) => setAddForm((f) => ({ ...f, role_on_site: v, employee_id: "" }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
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
              <label className="text-xs font-medium text-slate-600">
                Empleado *
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
                        : `Selecciona un empleado`
                    }
                  />
                </SelectTrigger>

                <SelectContent>
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

      {/* Dialog de confirmacion de transferencia */}
      <Dialog open={transferConfirmOpen} onOpenChange={(v) => (savingTransfer ? null : setTransferConfirmOpen(v))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Transferir empleado</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {transferInfo && (
              <p className="text-sm text-slate-700 leading-relaxed">
                Seguro que quieres agregar a{" "}
                <span className="font-semibold">"{transferInfo.employeeName}"</span>{" "}
                a esta obra? Actualmente se encuentra en el equipo de la obra{" "}
                <span className="font-semibold">"{transferInfo.fromObraName}"</span>.
                Si aceptas, sera transferido a esta obra y eliminado de la otra.
              </p>
            )}

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancelTransfer}
                disabled={savingTransfer}
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
