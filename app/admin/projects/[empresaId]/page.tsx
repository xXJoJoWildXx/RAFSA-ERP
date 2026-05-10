"use client"

import { useState, useMemo, useEffect, FormEvent } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { AdminLayout } from "@/components/admin-layout"
import { RoleGuard } from "@/lib/role-guard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { Search, Plus, MapPin, ChevronRight, Building2, ArrowLeft, Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabaseClient"

// ----- Tipos -----

type DbObraStatus = "planned" | "in_progress" | "paused" | "closed"
type ProjectStatus = "Planning" | "In Progress" | "Completed" | "On Hold"

type ObraRow = {
  id: string; code: string | null; name: string; client_name: string | null
  location_text: string | null; status: DbObraStatus
  start_date_planned: string | null; start_date_actual: string | null
  end_date_planned: string | null;   end_date_actual: string | null
}

type Project = {
  id: string; name: string; location: string; status: ProjectStatus
  progress: number; startDate: string; endDate: string
  budget: string; spent: string; manager: string; teamSize: number; code?: string | null
}

type EmployeeManager = { id: string; full_name: string; status: string }

type ObraAssignmentWithEmployee = {
  obra_id: string; employee_id: string
  employees: { full_name: string } | { full_name: string }[] | null
}

type SiteReportRow       = { obra_id: string; progress_percent: number | null; report_date: string | null }
type ObraStateAccountRow = { obra_id: string; amount: number | null; concept: string }

// ----- Helpers -----

function mapDbStatusToUi(s: DbObraStatus): ProjectStatus {
  return s === "planned" ? "Planning" : s === "in_progress" ? "In Progress" : s === "paused" ? "On Hold" : "Completed"
}
function mapUiStatusToDb(s: ProjectStatus): DbObraStatus {
  return s === "Planning" ? "planned" : s === "In Progress" ? "in_progress" : s === "On Hold" ? "paused" : "closed"
}
function getStatusLabel(s: ProjectStatus) {
  return s === "Planning" ? "Planeación" : s === "In Progress" ? "En progreso" : s === "Completed" ? "Completada" : "En pausa"
}
function formatCurrency(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return "-"
  if (amount === 0) return "$0.00"
  return amount.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 })
}
function mapObraToProject(obra: ObraRow, opts?: { managerName?: string; progress?: number; budget?: string; spent?: string; teamSize?: number }): Project {
  return {
    id: obra.id, code: obra.code, name: obra.name,
    location: obra.location_text ?? "Sin ubicación",
    status: mapDbStatusToUi(obra.status),
    progress: opts?.progress ?? 0,
    startDate: obra.start_date_actual ?? obra.start_date_planned ?? "",
    endDate: obra.end_date_actual ?? obra.end_date_planned ?? "",
    budget: opts?.budget ?? "-", spent: opts?.spent ?? "-",
    manager: opts?.managerName || "Sin asignar", teamSize: opts?.teamSize ?? 0,
  }
}

// ----- Página -----

export default function EmpresaObrasPage() {
  const params    = useParams()
  const empresaId = params.empresaId as string

  const [empresaNombre, setEmpresaNombre] = useState("")
  const [projects, setProjects]           = useState<Project[]>([])
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState<string | null>(null)
  const [searchQuery, setSearchQuery]     = useState("")
  const [statusFilter, setStatusFilter]   = useState<"all" | "in-progress" | "planning" | "completed" | "on-hold">("all")
  const [openDialog, setOpenDialog]       = useState(false)
  const [managers, setManagers]           = useState<EmployeeManager[]>([])
  const [loadingManagers, setLoadingManagers] = useState(false)
  const [saving, setSaving]               = useState(false)
  const [formError, setFormError]         = useState<string | null>(null)

  useEffect(() => {
    supabase.from("empresas").select("name").eq("id", empresaId).single()
      .then(({ data }) => { if (data) setEmpresaNombre(data.name) })
  }, [empresaId])

  useEffect(() => {
    async function fetchObras() {
      setLoading(true); setError(null)
      const { data, error } = await supabase
        .from("obras")
        .select("id, code, name, client_name, location_text, status, start_date_planned, start_date_actual, end_date_planned, end_date_actual")
        .eq("empresa_id", empresaId).order("created_at", { ascending: false })

      if (error) { setError(error.message); setLoading(false); return }
      const obras = (data as ObraRow[]) || []
      if (obras.length === 0) { setProjects([]); setLoading(false); return }

      const obraIds = obras.map((o) => o.id)
      const [assignRes, teamRes, siteRes, billingRes, accountsRes] = await Promise.all([
        supabase.from("obra_assignments").select("obra_id, employee_id, employees(full_name)").in("obra_id", obraIds).eq("role_on_site", "director_obra").is("assigned_to", null),
        supabase.from("obra_assignments").select("obra_id").in("obra_id", obraIds).is("assigned_to", null),
        supabase.from("site_reports").select("obra_id, progress_percent, report_date").in("obra_id", obraIds),
        supabase.from("obra_billing_items").select("obra_id, amount").in("obra_id", obraIds),
        supabase.from("obra_state_accounts").select("obra_id, amount, concept").in("obra_id", obraIds),
      ])

      const teamMap: Record<string, number> = {}
      ;(teamRes.data || []).forEach((r: { obra_id: string }) => { teamMap[r.obra_id] = (teamMap[r.obra_id] || 0) + 1 })

      const managerMap: Record<string, string> = {}
      ;(assignRes.data as ObraAssignmentWithEmployee[] || []).forEach((a) => {
        const emp = a.employees; const name = Array.isArray(emp) ? emp[0]?.full_name : emp?.full_name
        if (name) managerMap[a.obra_id] = name
      })

      const progressMap: Record<string, number> = {}; const lastDateMap: Record<string, string> = {}
      ;(siteRes.data as SiteReportRow[] || []).forEach((r) => {
        if (!r.progress_percent || !r.report_date) return
        if (!lastDateMap[r.obra_id] || r.report_date > lastDateMap[r.obra_id]) {
          lastDateMap[r.obra_id] = r.report_date; progressMap[r.obra_id] = Number(r.progress_percent)
        }
      })

      const budgetMap: Record<string, number> = {}
      ;(billingRes.data || []).forEach((item: { obra_id: string; amount: number }) => {
        budgetMap[item.obra_id] = (budgetMap[item.obra_id] || 0) + Number(item.amount || 0)
      })

      const spentMap: Record<string, number> = {}
      ;(accountsRes.data as ObraStateAccountRow[] || []).forEach((a) => {
        const sign = (a.concept || "").toLowerCase() === "return" ? -1 : 1
        spentMap[a.obra_id] = (spentMap[a.obra_id] || 0) + sign * Number(a.amount || 0)
      })

      setProjects(obras.map((obra) => {
        const budget = budgetMap[obra.id] ?? 0; const spent = spentMap[obra.id] ?? 0
        return mapObraToProject(obra, {
          managerName: managerMap[obra.id],
          progress: budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0,
          budget: formatCurrency(budget), spent: formatCurrency(spent), teamSize: teamMap[obra.id] ?? 0,
        })
      }))
      setLoading(false)
    }
    fetchObras()
  }, [empresaId])

  useEffect(() => {
    async function fetchDirectores() {
      setLoadingManagers(true)
      const { data } = await supabase.from("employees")
        .select("id, full_name, status, employee_roles(employee_roles_catalog(code))")
        .eq("status", "active").order("full_name", { ascending: true })
      const filtered = (data || []).filter((emp: any) =>
        (emp.employee_roles || []).some((er: any) => er.employee_roles_catalog?.code === "director_obra"))
      setManagers(filtered.map((e: any) => ({ id: e.id, full_name: e.full_name, status: e.status })))
      setLoadingManagers(false)
    }
    fetchDirectores()
  }, [])

  const filteredProjects = useMemo(() => projects.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.location.toLowerCase().includes(searchQuery.toLowerCase())
    const normalizedStatus = p.status.toLowerCase().replace(" ", "-") as any
    return matchesSearch && (statusFilter === "all" || normalizedStatus === statusFilter)
  }), [projects, searchQuery, statusFilter])

  const getStatusColor = (s: ProjectStatus) => {
    if (s === "In Progress") return "bg-[#0174bd]/15 text-[#4da8e8] border border-[#0174bd]/25"
    if (s === "Planning")    return "bg-amber-500/15 text-amber-300 border border-amber-500/25"
    if (s === "Completed")   return "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
    return "bg-slate-500/15 text-slate-400 border border-slate-500/25"
  }

  async function handleSaveProject(data: Omit<Project, "id"> & { id?: string }) {
    setSaving(true); setFormError(null)
    try {
      const { data: inserted, error } = await supabase.from("obras")
        .insert({ name: data.name, client_name: null, location_text: data.location || null, status: mapUiStatusToDb(data.status), notes: null, empresa_id: empresaId })
        .select("id, code, name, client_name, location_text, status, start_date_planned, start_date_actual, end_date_planned, end_date_actual").single()
      if (error || !inserted) { setFormError("No se pudo crear la obra, intenta de nuevo."); return }
      const obra = inserted as ObraRow
      if (data.manager) await supabase.from("obra_assignments").insert({ obra_id: obra.id, employee_id: data.manager, role_on_site: "director_obra" })
      setProjects((prev) => [mapObraToProject(obra), ...prev]); setOpenDialog(false)
    } catch { setFormError("Error inesperado al crear la obra.") }
    finally { setSaving(false) }
  }

  const inputCls   = "bg-slate-900 border-slate-700 text-slate-200 placeholder:text-slate-600 focus:border-[#0174bd]/60"
  const btnOutline = "border-slate-700 text-slate-400 hover:bg-slate-700/60 hover:text-slate-200 hover:border-slate-600"

  return (
    <RoleGuard allowed={["admin"]}>
      <AdminLayout>
        <div className="space-y-6">

          {/* ── Back + Header ── */}
          <div className="flex items-center gap-3">
            <Link href="/admin/projects">
              <Button variant="ghost" size="icon" className="rounded-xl text-slate-500 hover:text-slate-200 hover:bg-slate-700/60">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div
              className="rounded-2xl border border-slate-700/60 p-5 flex items-center justify-between flex-1"
              style={{
                background: "linear-gradient(135deg, #1e293b 0%, #0f1e2e 50%, #162438 100%)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 20px rgba(0,0,0,0.3)",
              }}
            >
              <div>
                <p className="text-[#4da8e8]/60 text-xs font-medium uppercase tracking-widest mb-1">Empresa</p>
                <h1 className="text-2xl font-bold text-slate-100">{empresaNombre || "Cargando..."}</h1>
                <p className="text-slate-400 text-sm mt-0.5">
                  {projects.length} {projects.length === 1 ? "obra registrada" : "obras registradas"}
                </p>
              </div>
              <Button onClick={() => setOpenDialog(true)} className="font-semibold bg-[#0174bd] hover:bg-[#0174bd]/90 text-white">
                <Plus className="w-4 h-4 mr-2" />Nueva obra
              </Button>
            </div>
          </div>

          {/* ── Lista de obras ── */}
          <div className="bg-slate-900 rounded-2xl border border-slate-700/60">
            {/* Header */}
            <div className="p-6 pb-4 border-b border-slate-700/60 rounded-t-2xl"
              style={{ background: "linear-gradient(135deg, #1a2535 0%, #111e2c 100%)" }}
            >
              <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                <h2 className="text-lg font-bold text-slate-100">Obras</h2>
                <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                  <div className="relative flex-1 md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                    <Input placeholder="Buscar obras..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                      className={`pl-10 ${inputCls}`} />
                  </div>
                  <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                    <SelectTrigger className={`w-full sm:w-40 ${inputCls}`}>
                      <SelectValue placeholder="Filtrar" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                      <SelectItem value="all"         className="focus:bg-slate-700 focus:text-slate-100">Todos</SelectItem>
                      <SelectItem value="in-progress" className="focus:bg-slate-700 focus:text-slate-100">En progreso</SelectItem>
                      <SelectItem value="planning"    className="focus:bg-slate-700 focus:text-slate-100">Planeación</SelectItem>
                      <SelectItem value="completed"   className="focus:bg-slate-700 focus:text-slate-100">Completada</SelectItem>
                      <SelectItem value="on-hold"     className="focus:bg-slate-700 focus:text-slate-100">En pausa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 pt-5">
              {loading && (
                <div className="py-16 flex flex-col items-center gap-3 text-slate-500">
                  <Loader2 className="w-8 h-8 animate-spin text-[#0174bd]" />
                  <span className="text-sm">Cargando obras...</span>
                </div>
              )}
              {!loading && error && <div className="py-10 text-center text-red-400 text-sm">Error: {error}</div>}
              {!loading && !error && filteredProjects.length === 0 && (
                <div className="py-16 flex flex-col items-center gap-2 text-slate-500">
                  <Building2 className="w-10 h-10 text-slate-700" />
                  <p className="text-sm font-medium text-slate-400">No hay obras registradas</p>
                  <p className="text-xs text-slate-600">Crea la primera obra para esta empresa</p>
                </div>
              )}
              {!loading && !error && filteredProjects.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                  {filteredProjects.map((project) => (
                    <Link key={project.id} href={`/admin/projects/${empresaId}/${project.id}`} className="block">
                      <ProjectCard project={project} statusClass={getStatusColor(project.status)} />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Dialog nueva obra ── */}
          <Dialog open={openDialog} onOpenChange={setOpenDialog}>
            <DialogContent className="max-w-xl bg-slate-800 border-slate-700 text-slate-100">
              <DialogHeader>
                <DialogTitle className="text-slate-100">Nueva obra</DialogTitle>
                <DialogDescription className="text-slate-400">Define la información principal de esta obra.</DialogDescription>
              </DialogHeader>
              <ProjectForm onCancel={() => setOpenDialog(false)} onSubmit={handleSaveProject}
                loading={saving} error={formError} managers={managers} loadingManagers={loadingManagers} />
            </DialogContent>
          </Dialog>

        </div>
      </AdminLayout>
    </RoleGuard>
  )
}

// ---------- CARD ----------

function ProjectCard({ project, statusClass }: { project: Project; statusClass: string }) {
  return (
    <div
      className="group relative rounded-2xl border border-slate-700/60 p-5 flex flex-col gap-4
        hover:border-[#0174bd]/40 hover:shadow-xl hover:shadow-black/40 hover:-translate-y-1
        transition-all duration-200 cursor-pointer overflow-hidden"
      style={{
        background: "linear-gradient(145deg, #1e293b 0%, #172030 60%, #1a2535 100%)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
      }}
    >

      {/* Acento top */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[#0174bd] to-[#4da8e8] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold text-slate-100 text-base leading-tight truncate group-hover:text-white transition-colors duration-200">
            {project.name}
          </h3>
          <div className="flex items-center gap-1 mt-1.5 text-xs text-slate-500">
            <MapPin className="w-3 h-3 shrink-0" />
            <span className="truncate">{project.location}</span>
          </div>
        </div>
        <Badge className={`${statusClass} shrink-0 text-xs font-semibold`}>
          {getStatusLabel(project.status)}
        </Badge>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500">Avance financiero</span>
          <span className="text-xs font-bold text-slate-300">{project.progress}%</span>
        </div>
        <div className="w-full bg-slate-700/60 rounded-full h-1.5 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-[#0174bd] to-[#4da8e8] transition-all duration-700"
            style={{ width: `${project.progress}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-1">
        <div className="bg-slate-700/40 rounded-xl p-3">
          <p className="text-xs text-slate-500 mb-0.5">Cotización</p>
          <p className="text-sm font-bold text-slate-200 truncate">{project.budget}</p>
          <p className="text-xs text-slate-500 mt-0.5">Cobrado: {project.spent}</p>
        </div>
        <div className="bg-slate-700/40 rounded-xl p-3">
          <p className="text-xs text-slate-500 mb-0.5">Director</p>
          <p className="text-sm font-bold text-slate-200 truncate">{project.manager}</p>
          <p className="text-xs text-slate-500 mt-0.5">Equipo: {project.teamSize}</p>
        </div>
      </div>

      <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-1 group-hover:translate-x-0">
        <ChevronRight className="w-4 h-4 text-[#4da8e8]" />
      </div>
    </div>
  )
}

// ---------- FORM ----------

type ProjectFormProps = {
  onSubmit: (data: Omit<Project, "id"> & { id?: string }) => Promise<void> | void
  onCancel: () => void; loading?: boolean; error?: string | null
  managers: EmployeeManager[]; loadingManagers?: boolean
}

function ProjectForm({ onSubmit, onCancel, loading = false, error, managers, loadingManagers = false }: ProjectFormProps) {
  const [form, setForm] = useState<Omit<Project, "id">>({
    name: "", location: "", status: "Planning",
    progress: 0, startDate: "", endDate: "", budget: "-", spent: "-", manager: "", teamSize: 0,
  })

  const inputCls        = "bg-slate-900 border-slate-700 text-slate-200 placeholder:text-slate-600 focus:border-[#0174bd]/60"
  const selectTrigger   = "bg-slate-900 border-slate-700 text-slate-200"
  const selectContent   = "bg-slate-800 border-slate-700 text-slate-200"
  const selectItemClass = "focus:bg-slate-700 focus:text-slate-100"

  return (
    <form className="mt-2 space-y-4" onSubmit={(e) => { e.preventDefault(); if (!form.name.trim()) return; onSubmit({ ...form }) }}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-400">Nombre de la obra *</label>
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Plaza Centro..." required className={inputCls} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-400">Ubicación</label>
          <Input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            placeholder="Ciudad, Estado" className={inputCls} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-400">Estatus</label>
          <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as ProjectStatus }))}>
            <SelectTrigger className={selectTrigger}><SelectValue /></SelectTrigger>
            <SelectContent className={selectContent}>
              <SelectItem value="Planning"    className={selectItemClass}>Planeación</SelectItem>
              <SelectItem value="In Progress" className={selectItemClass}>En progreso</SelectItem>
              <SelectItem value="Completed"   className={selectItemClass}>Completada</SelectItem>
              <SelectItem value="On Hold"     className={selectItemClass}>En pausa</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <label className="text-xs font-medium text-slate-400">Director de obra</label>
          <Select value={form.manager} onValueChange={(v) => setForm((f) => ({ ...f, manager: v }))} disabled={loadingManagers}>
            <SelectTrigger className={selectTrigger}>
              <SelectValue placeholder={loadingManagers ? "Cargando..." : managers.length === 0 ? "Sin directores disponibles" : "Seleccionar director"} />
            </SelectTrigger>
            <SelectContent className={selectContent}>
              {managers.map((m) => <SelectItem key={m.id} value={m.id} className={selectItemClass}>{m.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex justify-end gap-2 mt-4">
        <Button type="button" variant="outline" onClick={onCancel}
          className="border-slate-700 text-slate-400 hover:bg-slate-700/60 hover:text-slate-200">Cancelar</Button>
        <Button type="submit" disabled={loading} className="bg-[#0174bd] hover:bg-[#0174bd]/90 text-white">
          {loading ? "Guardando..." : "Crear obra"}
        </Button>
      </div>
    </form>
  )
}
