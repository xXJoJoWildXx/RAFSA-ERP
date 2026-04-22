"use client"

import { useState, useMemo, useEffect, FormEvent } from "react"
import Link from "next/link"
import { AdminLayout } from "@/components/admin-layout"
import { RoleGuard } from "@/lib/role-guard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Search, Plus, MapPin, Calendar } from "lucide-react"
import { supabase } from "@/lib/supabaseClient"

// ----- Tipos -----

type DbObraStatus = "planned" | "in_progress" | "paused" | "closed"
type ProjectStatus = "Planning" | "In Progress" | "Completed" | "On Hold"

type ObraRow = {
  id: string
  code: string | null
  name: string
  client_name: string | null
  location_text: string | null
  status: DbObraStatus
  start_date_planned: string | null
  start_date_actual: string | null
  end_date_planned: string | null
  end_date_actual: string | null
}

type Project = {
  id: string
  name: string
  location: string
  status: ProjectStatus
  progress: number
  startDate: string
  endDate: string
  budget: string
  spent: string
  manager: string
  teamSize: number
  code?: string | null
}

// Directores de obra activos (para el form)
type EmployeeManager = {
  id: string
  full_name: string
  status: string
}

// Tipo flexible para que TS acepte tanto objeto como arreglo
type ObraAssignmentWithEmployee = {
  obra_id: string
  employee_id: string
  employees:
    | { full_name: string }
    | { full_name: string }[]
    | null
}

type SiteReportRow = {
  obra_id: string
  progress_percent: number | null
  report_date: string | null
}

type ContractRow = {
  obra_id: string
  contract_amount: number | null
}

type ObraStateAccountRow = {
  obra_id: string
  amount: number | null
  concept: string
}

// ----- Helpers de mapping / parsing -----

function mapDbStatusToUi(status: DbObraStatus): ProjectStatus {
  switch (status) {
    case "planned":     return "Planning"
    case "in_progress": return "In Progress"
    case "paused":      return "On Hold"
    case "closed":      return "Completed"
    default:            return "Planning"
  }
}

function mapUiStatusToDb(status: ProjectStatus): DbObraStatus {
  switch (status) {
    case "Planning":    return "planned"
    case "In Progress": return "in_progress"
    case "On Hold":     return "paused"
    case "Completed":   return "closed"
    default:            return "planned"
  }
}

function getStatusLabel(status: ProjectStatus): string {
  switch (status) {
    case "Planning":    return "Planeacion"
    case "In Progress": return "En progreso"
    case "Completed":   return "Completada"
    case "On Hold":     return "En pausa"
    default:            return status
  }
}

// Formato de dinero para la UI
function formatCurrency(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return "-"
  if (amount === 0) return "$0.00"
  return amount.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  })
}

// Ahora acepta extras (managerName, progress, budget, spent, teamSize)
function mapObraToProject(
  obra: ObraRow,
  opts?: {
    managerName?: string
    progress?: number
    budget?: string
    spent?: string
    teamSize?: number
  },
): Project {
  const startDate =
    obra.start_date_actual ??
    obra.start_date_planned ??
    ""

  const endDate =
    obra.end_date_actual ??
    obra.end_date_planned ??
    ""

  return {
    id: obra.id,
    code: obra.code,
    name: obra.name,
    location: obra.location_text ?? "Sin ubicacion",
    status: mapDbStatusToUi(obra.status),
    progress: opts?.progress ?? 0,
    startDate,
    endDate,
    budget: opts?.budget ?? "-",
    spent: opts?.spent ?? "-",
    manager: opts?.managerName || "Sin asignar",
    teamSize: opts?.teamSize ?? 0,
  }
}

// Parseo de dinero: "$1,200.50" -> 1200.5
function parseMoney(value: string): number {
  if (!value) return 0
  const normalized = value
    .replace(/[,$]/g, "")
    .replace(/[^\d.-]/g, "")
  const n = parseFloat(normalized)
  return Number.isNaN(n) ? 0 : n
}

// ----- Pagina principal -----

export default function AdminProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<
    "all" | "in-progress" | "planning" | "completed" | "on-hold"
  >("all")

  const [openDialog, setOpenDialog] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)

  // Directores de obra activos (para el form)
  const [managers, setManagers] = useState<EmployeeManager[]>([])
  const [loadingManagers, setLoadingManagers] = useState(false)

  // ----- READ de Supabase -----

  useEffect(() => {
    const fetchObras = async () => {
      setLoading(true)
      setError(null)

      // 1) Obtenemos las obras
      const { data, error } = await supabase
        .from("obras")
        .select(
          `
          id,
          code,
          name,
          client_name,
          location_text,
          status,
          start_date_planned,
          start_date_actual,
          end_date_planned,
          end_date_actual
        `,
        )
        .order("created_at", { ascending: false })

      if (error) {
        console.error("Error fetching obras:", error)
        setError(error.message)
        setProjects([])
        setLoading(false)
        return
      }

      const obras = (data as ObraRow[]) || []

      if (obras.length === 0) {
        setProjects([])
        setLoading(false)
        return
      }

      const obraIds = obras.map((o) => o.id)

      // 2) En paralelo: director assignments, team count, site_reports, obra_billing_items, state_accounts
      const [assignRes, teamRes, siteRes, billingItemsRes, accountsRes] =
        await Promise.all([
          supabase
            .from("obra_assignments")
            .select("obra_id, employee_id, employees(full_name)")
            .in("obra_id", obraIds)
            .eq("role_on_site", "director_obra")
            .is("assigned_to", null),
          supabase
            .from("obra_assignments")
            .select("obra_id")
            .in("obra_id", obraIds)
            .is("assigned_to", null),
          supabase
            .from("site_reports")
            .select("obra_id, progress_percent, report_date")
            .in("obra_id", obraIds),
          supabase
            .from("obra_billing_items")
            .select("obra_id, amount")
            .in("obra_id", obraIds),
          supabase
            .from("obra_state_accounts")
            .select("obra_id, amount, concept")
            .in("obra_id", obraIds),
        ])

      const { data: assignments, error: assignError } = assignRes
      const { data: teamRows,    error: teamError }   = teamRes
      const { data: siteReports, error: siteError }   = siteRes
      const { data: billingItems, error: billingItemsError } = billingItemsRes
      const { data: accounts,    error: accountsError }  = accountsRes

      if (assignError)    console.error("Error fetching obra_assignments:", assignError)
      if (teamError)      console.error("Error fetching team count:", teamError)
      if (siteError)      console.error("Error fetching site_reports:", siteError)
      if (billingItemsError) console.error("Error fetching obra_billing_items:", billingItemsError)
      if (accountsError)  console.error("Error fetching obra_state_accounts:", accountsError)

      // --- Team size map (obra_id -> cantidad de asignaciones activas) ---
      const teamSizeMap: Record<string, number> = {}
      if (teamRows) {
        ;(teamRows as { obra_id: string }[]).forEach((r) => {
          teamSizeMap[r.obra_id] = (teamSizeMap[r.obra_id] || 0) + 1
        })
      }

      // --- Director map (obra_id -> full_name) ---
      const managerMap: Record<string, string> = {}

      if (assignments) {
        ;(assignments as ObraAssignmentWithEmployee[]).forEach((a) => {
          const emp = a.employees
          let fullName: string | undefined

          if (Array.isArray(emp)) {
            fullName = emp[0]?.full_name
          } else {
            fullName = emp?.full_name
          }

          if (fullName) {
            managerMap[a.obra_id] = fullName
          }
        })
      }

      // --- Progress map (obra_id -> ultimo progress_percent) ---
      const progressMap: Record<string, number> = {}
      const lastDateMap: Record<string, string> = {}

      if (siteReports) {
        ;(siteReports as SiteReportRow[]).forEach((r) => {
          if (r.progress_percent == null) return
          if (!r.report_date) return
          const currentDate = lastDateMap[r.obra_id]
          if (!currentDate || r.report_date > currentDate) {
            lastDateMap[r.obra_id] = r.report_date
            progressMap[r.obra_id] = Number(r.progress_percent)
          }
        })
      }

      // --- Budget map (obra_id -> suma amount from obra_billing_items) ---
      const budgetMap: Record<string, number> = {}

      if (billingItems) {
        ;(billingItems as { obra_id: string; amount: number }[]).forEach((item) => {
          const amount = item.amount ?? 0
          if (!amount) return
          budgetMap[item.obra_id] =
            (budgetMap[item.obra_id] || 0) + Number(amount)
        })
      }

      // --- Spent map (obra_id -> suma monto segun concept) ---
      const spentMap: Record<string, number> = {}

      if (accounts) {
        ;(accounts as ObraStateAccountRow[]).forEach((a) => {
          const amt = a.amount ?? 0
          if (!amt) return

          // deposit / advance / retention -> +amount
          // return -> -amount
          let sign = 1
          const concept = (a.concept || "").toLowerCase()
          if (concept === "return") {
            sign = -1
          }

          spentMap[a.obra_id] =
            (spentMap[a.obra_id] || 0) + sign * Number(amt)
        })
      }

      // 3) Mapeamos obras -> projects usando datos agregados
      const mapped = obras.map((obra) => {
        const budgetNumber = budgetMap[obra.id] ?? 0
        const spentNumber = spentMap[obra.id] ?? 0

        // Avance financiero: lo cobrado / cotizacion, expresado en porcentaje
        const financialProgress =
          budgetNumber > 0
            ? Math.min(100, Math.round((spentNumber / budgetNumber) * 100))
            : 0

        return mapObraToProject(obra, {
          managerName: managerMap[obra.id],
          progress: financialProgress,
          budget: formatCurrency(budgetNumber),
          spent: formatCurrency(spentNumber),
          teamSize: teamSizeMap[obra.id] ?? 0,
        })
      })

      setProjects(mapped)
      setLoading(false)
    }

    fetchObras()
  }, [])

  // ----- READ de directores de obra (para el form) -----

  useEffect(() => {
    const fetchDirectores = async () => {
      setLoadingManagers(true)

      const { data, error } = await supabase
        .from("employees")
        .select(`
          id,
          full_name,
          status,
          employee_roles(
            employee_roles_catalog(code)
          )
        `)
        .eq("status", "active")
        .order("full_name", { ascending: true })

      if (error) {
        console.error("Error fetching directores:", error)
        setManagers([])
        setLoadingManagers(false)
        return
      }

      // Filtrar solo empleados con rol director_obra en el catalogo
      const filtered = (data || []).filter((emp: any) =>
        (emp.employee_roles || []).some(
          (er: any) => er.employee_roles_catalog?.code === "director_obra"
        )
      )

      setManagers(
        filtered.map((e: any) => ({
          id: e.id,
          full_name: e.full_name,
          status: e.status,
        }))
      )
      setLoadingManagers(false)
    }

    fetchDirectores()
  }, [])

  // ----- Filtros / busqueda -----

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const matchesSearch =
        project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        project.location.toLowerCase().includes(searchQuery.toLowerCase())

      const normalizedStatus = project.status
        .toLowerCase()
        .replace(" ", "-") as
        | "in-progress"
        | "planning"
        | "completed"
        | "on-hold"

      const matchesStatus =
        statusFilter === "all" ? true : normalizedStatus === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [projects, searchQuery, statusFilter])

  const getStatusColor = (status: ProjectStatus) => {
    switch (status) {
      case "In Progress":
        return "bg-blue-100 text-blue-700"
      case "Planning":
        return "bg-yellow-100 text-yellow-700"
      case "Completed":
        return "bg-green-100 text-green-700"
      case "On Hold":
        return "bg-slate-100 text-slate-700"
      default:
        return "bg-slate-100 text-slate-700"
    }
  }

  function handleNewProject() {
    setEditingProject(null)
    setOpenDialog(true)
  }

  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // ----- CREATE de obra + registros relacionados -----

  async function handleSaveProject(
    data: Omit<Project, "id"> & { id?: string },
  ) {
    try {
      setSaving(true)
      setFormError(null)

      // En el form, `manager` es el employee_id seleccionado (o "")
      const managerEmployeeId = data.manager || null

      const progressValue = data.progress ?? 0

      // 1) Creamos la obra base
      const payloadObra = {
        name: data.name,
        client_name: null as string | null,
        location_text: data.location || null,
        status: mapUiStatusToDb(data.status),
        notes: null as string | null,
      }

      const { data: inserted, error } = await supabase
        .from("obras")
        .insert(payloadObra)
        .select(
          `
          id,
          code,
          name,
          client_name,
          location_text,
          status,
          start_date_planned,
          start_date_actual,
          end_date_planned,
          end_date_actual,
          notes
        `,
        )
        .single()

      if (error || !inserted) {
        console.error("Error inserting obra:", error)
        setFormError("No se pudo crear la obra, intenta de nuevo.")
        return
      }

      const obra = inserted as ObraRow

      // 2) Si hay director seleccionado, creamos assignment como director_obra
      if (managerEmployeeId) {
        const { error: assignError } = await supabase
          .from("obra_assignments")
          .insert({
            obra_id: obra.id,
            employee_id: managerEmployeeId,
            role_on_site: "director_obra",
          })

        if (assignError) {
          console.error(
            "Error creating obra_assignment:",
            assignError,
          )
        }
      }

      // 3) Si hay progress > 0 y director, creamos site_report inicial
      if (progressValue > 0 && managerEmployeeId) {
        const { error: reportError } = await supabase
          .from("site_reports")
          .insert({
            obra_id: obra.id,
            reported_by: managerEmployeeId,
            progress_percent: progressValue,
            summary: "Avance inicial desde formulario de nueva obra",
          })

        if (reportError) {
          console.error(
            "Error creating initial site_report:",
            reportError,
          )
        }
      }

      // 4) Actualizamos la lista en memoria (sin recomputar agregados; se veran al recargar)
      setProjects((prev) => [mapObraToProject(obra), ...prev])
      setOpenDialog(false)
    } catch (e) {
      console.error(e)
      setFormError("Error inesperado al crear la obra.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <RoleGuard allowed={["admin"]}>
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              Gestion de Obras
            </h1>
            <p className="text-slate-600 mt-1">
              Administra y da seguimiento a todas las obras
            </p>
          </div>
          <Button onClick={handleNewProject}>
            <Plus className="w-4 h-4 mr-2" />
            Nueva Obra
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
              <CardTitle>Todas las Obras</CardTitle>
              <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                <div className="relative flex-1 md:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Buscar obras..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select
                  value={statusFilter}
                  onValueChange={(v) => setStatusFilter(v as any)}
                >
                  <SelectTrigger className="w-full sm:w-40">
                    <SelectValue placeholder="Filtrar por estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="in-progress">En progreso</SelectItem>
                    <SelectItem value="planning">Planeacion</SelectItem>
                    <SelectItem value="completed">Completada</SelectItem>
                    <SelectItem value="on-hold">En pausa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {loading && (
              <div className="py-10 text-center text-slate-500 text-sm">
                Cargando obras...
              </div>
            )}

            {!loading && error && (
              <div className="py-10 text-center text-red-500 text-sm">
                Error al cargar obras: {error}
              </div>
            )}

            {!loading && !error && filteredProjects.length === 0 && (
              <div className="py-10 text-center text-slate-500 text-sm">
                No se encontraron obras con los filtros actuales.
              </div>
            )}

            {!loading && !error && filteredProjects.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {filteredProjects.map((project) => (
                  <Link
                    key={project.id}
                    href={`/admin/projects/${project.id}`}
                    className="block"
                  >
                    <ProjectCard
                      project={project}
                      statusClass={getStatusColor(project.status)}
                    />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Dialog Crear Obra */}
        <Dialog open={openDialog} onOpenChange={setOpenDialog}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>
                {editingProject ? "Editar Obra" : "Nueva Obra"}
              </DialogTitle>
              <DialogDescription>
                Define la informacion principal de esta obra.
              </DialogDescription>
            </DialogHeader>

            <ProjectForm
              initialData={editingProject ?? undefined}
              onCancel={() => setOpenDialog(false)}
              onSubmit={handleSaveProject}
              loading={saving}
              error={formError}
              managers={managers}
              loadingManagers={loadingManagers}
            />
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
    </RoleGuard>
  )
}

// ---------- CARD DE CADA PROYECTO ----------

type ProjectCardProps = {
  project: Project
  statusClass: string
}

function ProjectCard({ project, statusClass }: ProjectCardProps) {
  return (
    <Card className="flex flex-col justify-between hover:shadow-md transition-shadow cursor-pointer">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base font-semibold text-slate-900">
              {project.name}
            </CardTitle>
            <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
              <Calendar className="w-3 h-3" />
              <span>
                {project.startDate || "Sin fecha inicio"} -{" "}
                {project.endDate || "Sin fecha fin"}
              </span>
            </div>
          </div>
          <Badge className={statusClass}>{getStatusLabel(project.status)}</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex items-center gap-1 text-sm text-slate-600">
          <MapPin className="w-4 h-4" />
          <span>{project.location}</span>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">Avance</span>
            <span className="text-slate-700 font-medium">
              {project.progress}%
            </span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${project.progress}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between text-sm">
          <div>
            <p className="text-xs text-slate-500">Cotizacion</p>
            <p className="text-sm font-medium text-slate-900">
              {project.budget}
            </p>
            <p className="text-xs text-slate-500">
              Cobrado: {project.spent}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">Director de Obra</p>
            <p className="text-sm font-medium text-slate-900">
              {project.manager}
            </p>
            <p className="text-xs text-slate-500">
              Equipo: {project.teamSize}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------- FORMULARIO ----------

type ProjectFormProps = {
  initialData?: Project
  onSubmit: (data: Omit<Project, "id"> & { id?: string }) => Promise<void> | void
  onCancel: () => void
  loading?: boolean
  error?: string | null
  managers: EmployeeManager[]
  loadingManagers?: boolean
}

function ProjectForm({
  initialData,
  onSubmit,
  onCancel,
  loading = false,
  error,
  managers,
  loadingManagers = false,
}: ProjectFormProps) {
  const [form, setForm] = useState<Omit<Project, "id">>(() => ({
    name: initialData?.name ?? "",
    location: initialData?.location ?? "",
    status: initialData?.status ?? "Planning",
    progress: initialData?.progress ?? 0,
    startDate: initialData?.startDate ?? "",
    endDate: initialData?.endDate ?? "",
    budget: "-",
    spent: "-",
    manager: "",
    teamSize: initialData?.teamSize ?? 0,
  }))

  function handleChange<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    if (!form.location.trim()) return

    onSubmit({
      ...form,
      id: initialData?.id,
    })
  }

  return (
    <form className="mt-2 space-y-4" onSubmit={handleSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-600">
            Nombre de la obra *
          </label>
          <Input
            value={form.name}
            onChange={(e) => handleChange("name", e.target.value)}
            placeholder="Plaza Centro..."
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-600">
            Ubicacion *
          </label>
          <Input
            value={form.location}
            onChange={(e) => handleChange("location", e.target.value)}
            placeholder="Ciudad, Estado"
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-600">
            Estado
          </label>
          <Select
            value={form.status}
            onValueChange={(v) =>
              handleChange("status", v as ProjectStatus)
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Planning">Planeacion</SelectItem>
              <SelectItem value="In Progress">En progreso</SelectItem>
              <SelectItem value="Completed">Completada</SelectItem>
              <SelectItem value="On Hold">En pausa</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Director de Obra */}
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <label className="text-xs font-medium text-slate-600">
            Director de Obra
          </label>
          <div className="flex">
            <div className="w-full md:w-2/3">
              <Select
                value={form.manager}
                onValueChange={(v) => handleChange("manager", v)}
                disabled={loadingManagers}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      loadingManagers
                        ? "Cargando directores..."
                        : managers.length === 0
                        ? "Sin directores disponibles"
                        : "Seleccionar director"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {managers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-500 mt-1">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 mt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={loading}>
          {loading
            ? "Guardando..."
            : initialData
            ? "Guardar cambios"
            : "Crear obra"}
        </Button>
      </div>
    </form>
  )
}
