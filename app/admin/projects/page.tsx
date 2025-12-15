"use client"

import { useState, useMemo, useEffect, FormEvent } from "react"
import Link from "next/link"
import { AdminLayout } from "@/components/admin-layout"
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

// Empleados que pueden fungir como managers
type EmployeeManager = {
  id: string
  full_name: string
  position_title: string | null
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
    case "planned":
      return "Planning"
    case "in_progress":
      return "In Progress"
    case "paused":
      return "On Hold"
    case "closed":
      return "Completed"
    default:
      return "Planning"
  }
}

function mapUiStatusToDb(status: ProjectStatus): DbObraStatus {
  switch (status) {
    case "Planning":
      return "planned"
    case "In Progress":
      return "in_progress"
    case "On Hold":
      return "paused"
    case "Completed":
      return "closed"
    default:
      return "planned"
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
    location: obra.location_text ?? "Sin ubicación",
    status: mapDbStatusToUi(obra.status),
    progress: opts?.progress ?? 0,
    startDate,
    endDate,
    budget: opts?.budget ?? "-",
    spent: opts?.spent ?? "-",
    // 🔴 Ya no usamos client_name como fallback
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

// ----- Página principal -----

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

  // Managers activos (para el form)
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

      // 2) En paralelo: manager assignments, site_reports, contracts, state_accounts
      const [assignRes, siteRes, contractsRes, accountsRes] =
        await Promise.all([
          supabase
            .from("obra_assignments")
            .select("obra_id, employee_id, employees(full_name)")
            .in("obra_id", obraIds)
            .eq("role_on_site", "manager"),
          supabase
            .from("site_reports")
            .select("obra_id, progress_percent, report_date")
            .in("obra_id", obraIds),
          supabase
            .from("contracts")
            .select("obra_id, contract_amount")
            .in("obra_id", obraIds),
          supabase
            .from("obra_state_accounts")
            .select("obra_id, amount, concept")
            .in("obra_id", obraIds),
        ])

      const { data: assignments, error: assignError } = assignRes
      const { data: siteReports, error: siteError } = siteRes
      const { data: contracts, error: contractsError } = contractsRes
      const { data: accounts, error: accountsError } = accountsRes

      if (assignError) {
        console.error("Error fetching obra_assignments:", assignError)
      }
      if (siteError) {
        console.error("Error fetching site_reports:", siteError)
      }
      if (contractsError) {
        console.error("Error fetching contracts:", contractsError)
      }
      if (accountsError) {
        console.error("Error fetching obra_state_accounts:", accountsError)
      }

      // --- Manager map (obra_id -> full_name) ---
      const managerMap: Record<string, string> = {}

      if (assignments) {
        (assignments as ObraAssignmentWithEmployee[]).forEach((a) => {
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

      // --- Progress map (obra_id -> último progress_percent) ---
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

      // --- Budget map (obra_id -> suma contract_amount) ---
      const budgetMap: Record<string, number> = {}

      if (contracts) {
        ;(contracts as ContractRow[]).forEach((c) => {
          const amount = c.contract_amount ?? 0
          if (!amount) return
          budgetMap[c.obra_id] =
            (budgetMap[c.obra_id] || 0) + Number(amount)
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

      // 3) Mapeamos obras → projects usando datos agregados
      const mapped = obras.map((obra) => {
        const progress = progressMap[obra.id] ?? 0
        const budgetNumber = budgetMap[obra.id]
        const spentNumber = spentMap[obra.id]

        return mapObraToProject(obra, {
          managerName: managerMap[obra.id],
          progress,
          budget: formatCurrency(budgetNumber),
          spent: formatCurrency(spentNumber),
        })
      })

      setProjects(mapped)
      setLoading(false)
    }

    fetchObras()
  }, [])

  // ----- READ de empleados que pueden ser managers (para el form) -----

  useEffect(() => {
    const fetchManagers = async () => {
      setLoadingManagers(true)

      const { data, error } = await supabase
        .from("employees")
        .select("id, full_name, position_title, status")
        .eq("status", "active")

      if (error) {
        console.error("Error fetching managers:", error)
        setManagers([])
        setLoadingManagers(false)
        return
      }

      const rows = (data || []) as EmployeeManager[]

      // Heurística: puesto que incluye "manager" o "gerente"
      const filtered = rows.filter((e) => {
        if (!e.position_title) return false
        const t = e.position_title.toLowerCase()
        return t.includes("manager") || t.includes("gerente")
      })

      setManagers(filtered)
      setLoadingManagers(false)
    }

    fetchManagers()
  }, [])

  // ----- Filtros / búsqueda -----

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
      const budgetAmount = parseMoney(data.budget)
      const spentAmount = parseMoney(data.spent)

      // 1) Creamos la obra base
      const payloadObra = {
        name: data.name,
        client_name: null as string | null, // ya NO guardamos manager como cliente
        location_text: data.location || null,
        status: mapUiStatusToDb(data.status),
        start_date_planned: data.startDate || null,
        end_date_planned: data.endDate || null,
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

      // 2) Si hay manager seleccionado, creamos assignment como 'manager'
      if (managerEmployeeId) {
        const { error: assignError } = await supabase
          .from("obra_assignments")
          .insert({
            obra_id: obra.id,
            employee_id: managerEmployeeId,
            role_on_site: "manager",
          })

        if (assignError) {
          console.error(
            "Error creating obra_assignment:",
            assignError,
          )
        }
      }

      // 3) Si hay progress > 0 y manager (necesario para reported_by), creamos site_report inicial
      if (progressValue > 0 && managerEmployeeId) {
        const { error: reportError } = await supabase
          .from("site_reports")
          .insert({
            obra_id: obra.id,
            reported_by: managerEmployeeId,
            progress_percent: progressValue,
            summary: "Initial progress from New Project form",
          })

        if (reportError) {
          console.error(
            "Error creating initial site_report:",
            reportError,
          )
        }
      }

      // 4) Si hay budget, creamos un contrato "manual"
      if (budgetAmount > 0) {
        const { error: contractError } = await supabase
          .from("contracts")
          .insert({
            obra_id: obra.id,
            contract_amount: budgetAmount,
            currency: "MXN",
            file_url: "manual://new-project-form",
            file_name: "Manual budget entry",
          })

        if (contractError) {
          console.error(
            "Error creating contract from budget:",
            contractError,
          )
        }
      }

      // 5) Si hay spent, creamos un movimiento en estado de cuenta
      if (spentAmount > 0) {
        const { error: accountError } = await supabase
          .from("obra_state_accounts")
          .insert({
            obra_id: obra.id,
            amount: spentAmount,
            concept: "deposit",
            method: "transfer",
            note: "Initial spent from New Project form",
          })

        if (accountError) {
          console.error(
            "Error creating obra_state_account from spent:",
            accountError,
          )
        }
      }

      // 6) Actualizamos la lista en memoria (sin recomputar agregados; se verán al recargar)
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
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              Project Management
            </h1>
            <p className="text-slate-600 mt-1">
              Manage and track all construction projects
            </p>
          </div>
          <Button onClick={handleNewProject}>
            <Plus className="w-4 h-4 mr-2" />
            New Project
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
              <CardTitle>All Projects</CardTitle>
              <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                <div className="relative flex-1 md:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Search projects..."
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
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="in-progress">In Progress</SelectItem>
                    <SelectItem value="planning">Planning</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="on-hold">On Hold</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {loading && (
              <div className="py-10 text-center text-slate-500 text-sm">
                Loading projects...
              </div>
            )}

            {!loading && error && (
              <div className="py-10 text-center text-red-500 text-sm">
                Error loading projects: {error}
              </div>
            )}

            {!loading && !error && filteredProjects.length === 0 && (
              <div className="py-10 text-center text-slate-500 text-sm">
                No projects found with the current filters.
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

        {/* Dialog Create */}
        <Dialog open={openDialog} onOpenChange={setOpenDialog}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>
                {editingProject ? "Edit Project" : "New Project"}
              </DialogTitle>
              <DialogDescription>
                Define the main information for this project.
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
                {project.startDate || "Sin fecha inicio"} –{" "}
                {project.endDate || "Sin fecha fin"}
              </span>
            </div>
          </div>
          <Badge className={statusClass}>{project.status}</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex items-center gap-1 text-sm text-slate-600">
          <MapPin className="w-4 h-4" />
          <span>{project.location}</span>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">Progress</span>
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
            <p className="text-xs text-slate-500">Budget</p>
            <p className="text-sm font-medium text-slate-900">
              {project.budget}
            </p>
            <p className="text-xs text-slate-500">
              Spent: {project.spent}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">Manager</p>
            <p className="text-sm font-medium text-slate-900">
              {project.manager}
            </p>
            <p className="text-xs text-slate-500">
              Team: {project.teamSize}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------- FORMULARIO  ----------

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
    startDate:
      initialData?.startDate ?? new Date().toISOString().slice(0, 10),
    endDate: initialData?.endDate ?? "",
    budget: initialData?.budget ?? "",
    spent: initialData?.spent ?? "",
    manager: "", // en creación no tenemos asignado; aquí guardamos employee_id
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
            Project Name *
          </label>
          <Input
            value={form.name}
            onChange={(e) => handleChange("name", e.target.value)}
            placeholder="Downtown Plaza..."
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-600">
            Location *
          </label>
          <Input
            value={form.location}
            onChange={(e) => handleChange("location", e.target.value)}
            placeholder="City, State"
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-600">
            Status
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
              <SelectItem value="Planning">Planning</SelectItem>
              <SelectItem value="In Progress">In Progress</SelectItem>
              <SelectItem value="Completed">Completed</SelectItem>
              <SelectItem value="On Hold">On Hold</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-600">
            Progress (%)
          </label>
          <Input
            type="number"
            min={0}
            max={100}
            value={form.progress}
            onChange={(e) =>
              handleChange(
                "progress",
                Math.min(100, Math.max(0, Number(e.target.value) || 0)),
              )
            }
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-600">
            Start Date
          </label>
          <Input
            type="date"
            value={form.startDate}
            onChange={(e) =>
              handleChange("startDate", e.target.value)
            }
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-600">
            End Date
          </label>
          <Input
            type="date"
            value={form.endDate}
            onChange={(e) => handleChange("endDate", e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-600">
            Budget
          </label>
          <Input
            value={form.budget}
            onChange={(e) => handleChange("budget", e.target.value)}
            placeholder="$0.00"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-600">
            Spent
          </label>
          <Input
            value={form.spent}
            onChange={(e) => handleChange("spent", e.target.value)}
            placeholder="$0.00"
          />
        </div>

        {/* Manager centrado y ocupando todo el renglón */}
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <label className="text-xs font-medium text-slate-600 text-center md:text-left">
            Manager
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
                        ? "Loading managers..."
                        : managers.length === 0
                        ? "No managers available"
                        : "Select a manager"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {managers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.full_name}
                      {m.position_title ? (
                        <span className="ml-1 text-xs text-slate-500">
                          ({m.position_title})
                        </span>
                      ) : null}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Team Size queda fuera visualmente por ahora */}
      </div>

      {error && (
        <p className="text-xs text-red-500 mt-1">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 mt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading
            ? "Saving..."
            : initialData
            ? "Save changes"
            : "Create project"}
        </Button>
      </div>
    </form>
  )
}
