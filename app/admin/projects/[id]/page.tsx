"use client"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { AdminLayout } from "@/components/admin-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  MapPin,
  DollarSign,
  Users,
  Clock,
  ArrowLeft,
  Edit,
  CheckCircle2,
  AlertCircle,
} from "lucide-react"
import Link from "next/link"
import { supabase } from "@/lib/supabaseClient"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"


// ---------- Tipos DB básicos ----------

type DbObraStatus = "planned" | "in_progress" | "paused" | "closed"

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
  notes: string | null
}

type ContractRow = {
  id: string
  obra_id: string
  contract_amount: string | number | null
  currency: string
}

type ObraStateAccountRow = {
  id: string
  obra_id: string
  amount: string | number
  concept: "deposit" | "advance" | "retention" | "return"
  method: "transfer" | "cash" | "check" | "other" | null
  date: string          // fecha del depósito (columna date)
  bank_ref: string | null
  note: string | null
}


type SiteReportRow = {
  id: string
  obra_id: string
  report_date: string
  progress_percent: string | number | null
}

type ObraAssignmentRow = {
  id: string
  obra_id: string
  employee_id: string
  role_on_site: string | null
  employees:
    | { full_name: string }
    | { full_name: string }[]
    | null
}

// ---------- Helpers de mapping / formatos ----------

function mapDbStatusToBadge(status: DbObraStatus) {
  switch (status) {
    case "planned":
      return { label: "Planned", className: "bg-yellow-100 text-yellow-700" }
    case "in_progress":
      return { label: "In Progress", className: "bg-blue-100 text-blue-700" }
    case "paused":
      return { label: "On Hold", className: "bg-slate-100 text-slate-700" }
    case "closed":
      return { label: "Completed", className: "bg-green-100 text-green-700" }
    default:
      return { label: status, className: "bg-slate-100 text-slate-700" }
  }
}

function formatCurrency(
  value: number,
  currency: string = "MXN",
): string {
  if (!Number.isFinite(value)) return "-"
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value)
}

// ---------- Página de detalle ----------

export default function ProjectDetailPage() {
  const params = useParams()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [obra, setObra] = useState<ObraRow | null>(null)
  const [progress, setProgress] = useState<number>(0)
  const [budgetTotal, setBudgetTotal] = useState<number>(0)
  const [budgetCurrency, setBudgetCurrency] = useState<string>("MXN")
  const [spentTotal, setSpentTotal] = useState<number>(0)
  // Team info
  const [teamSize, setTeamSize] = useState<number>(0)
  const [managerName, setManagerName] = useState<string | null>(null)
  // Editar obra
  const [editOpen, setEditOpen] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [editForm, setEditForm] = useState({
    name: "",
    client_name: "",
    location_text: "",
    status: "planned" as DbObraStatus,
    start_date_planned: "",
    end_date_planned: "",
    notes: "",
  })
  const [activeTab, setActiveTab] = useState("overview")

  // Estado de cuenta
  const [stateAccounts, setStateAccounts] = useState<ObraStateAccountRow[]>([])
  const [newPaymentOpen, setNewPaymentOpen] = useState(false)
  const [newPaymentSaving, setNewPaymentSaving] = useState(false)
  const [newPaymentForm, setNewPaymentForm] = useState({
    concept: "deposit" as ObraStateAccountRow["concept"],
    amount: "",
    method: "transfer" as ObraStateAccountRow["method"],
    date: new Date().toISOString().slice(0, 10),
    bank_ref: "",
    note: "",
  })

  //Funcion que maneja la actualización de la obra
  async function handleUpdateObra() {
    if (!obra) return
    setSavingEdit(true)

    const payload = {
      name: editForm.name,
      client_name: editForm.client_name || null,
      location_text: editForm.location_text || null,
      status: editForm.status,
      start_date_planned: editForm.start_date_planned || null,
      end_date_planned: editForm.end_date_planned || null,
      notes: editForm.notes || null,
    }

    const { data, error } = await supabase
      .from("obras")
      .update(payload)
      .eq("id", obra.id)
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

    if (error || !data) {
      console.error("Error updating obra:", error)
      // aquí puedes poner un toast o setError si quieres
      setSavingEdit(false)
      return
    }

    setObra(data as ObraRow)
    setEditOpen(false)
    setSavingEdit(false)
  }

  //Función que maneja la eliminación de la obra
  async function handleDeleteObra() {
    if (!obra) return
    const ok = window.confirm(
      "¿Seguro que deseas eliminar esta obra? Esta acción no se puede deshacer.",
    )
    if (!ok) return

    setDeleteLoading(true)
    const { error } = await supabase
      .from("obras")
      .delete()
      .eq("id", obra.id)

    if (error) {
      console.error("Error deleting obra:", error)
      setDeleteLoading(false)
      return
    }

    // Redirigimos al listado
    router.push("/admin/projects")
  }

    // Función para registrar un nuevo pago / movimiento en el estado de cuenta
  async function handleCreatePayment() {
    if (!obra) return

    const amountNumber = Number(newPaymentForm.amount)
    if (!amountNumber || amountNumber <= 0) {
      alert("Ingresa un monto válido mayor a 0.")
      return
    }

    setNewPaymentSaving(true)

    const payload = {
      obra_id: obra.id,
      concept: newPaymentForm.concept,
      amount: amountNumber,
      method: newPaymentForm.method,
      date: newPaymentForm.date,
      bank_ref: newPaymentForm.bank_ref || null,
      note: newPaymentForm.note || null,
      // uploaded_by: lo dejamos null por ahora (luego lo conectamos al usuario logueado)
    }

    const { data, error } = await supabase
      .from("obra_state_accounts")
      .insert(payload)
      .select("id, obra_id, amount, concept, method, date, bank_ref, note")
      .single()

    if (error || !data) {
      console.error("Error creating payment:", error)
      alert("No se pudo registrar el movimiento, intenta de nuevo.")
      setNewPaymentSaving(false)
      return
    }

    // Actualizamos lista y totales
    setStateAccounts((prev) => {
      const next = [...prev, data as ObraStateAccountRow]
      next.sort((a, b) => (a.date > b.date ? -1 : 1))
      const totalSpent = next.reduce((sum, m) => {
        const val =
          typeof m.amount === "string" ? parseFloat(m.amount) : m.amount
        return sum + (val || 0)
      }, 0)
      setSpentTotal(totalSpent)
      return next
    })

    // Reset form + cerrar modal
    setNewPaymentForm({
      concept: "deposit",
      amount: "",
      method: "transfer",
      date: new Date().toISOString().slice(0, 10),
      bank_ref: "",
      note: "",
    })
    setNewPaymentOpen(false)
    setNewPaymentSaving(false)
  }



  // 👇 estos siguen mock por ahora (luego los conectamos a tablas reales)
  const milestones = [
    {
      id: 1,
      name: "Site Preparation",
      status: "completed",
      date: "2024-02-15",
      progress: 100,
    },
    {
      id: 2,
      name: "Foundation Work",
      status: "completed",
      date: "2024-04-30",
      progress: 100,
    },
    {
      id: 3,
      name: "Structural Framework",
      status: "in-progress",
      date: "2024-08-15",
      progress: 75,
    },
    {
      id: 4,
      name: "Interior Construction",
      status: "pending",
      date: "2024-10-30",
      progress: 0,
    },
    {
      id: 5,
      name: "Final Inspection",
      status: "pending",
      date: "2024-12-20",
      progress: 0,
    },
  ]

  const teamMembers = [
    { id: 1, name: "John Smith", role: "Project Manager", avatar: "JS" },
    { id: 2, name: "Sarah Johnson", role: "Lead Engineer", avatar: "SJ" },
    { id: 3, name: "Mike Chen", role: "Site Supervisor", avatar: "MC" },
    { id: 4, name: "Emily Davis", role: "Safety Officer", avatar: "ED" },
    { id: 5, name: "James Wilson", role: "Quality Control", avatar: "JW" },
  ]

  const recentActivities = [
    {
      id: 1,
      action: "Milestone completed",
      detail: "Foundation Work finished ahead of schedule",
      time: "2 days ago",
    },
    {
      id: 2,
      action: "Document uploaded",
      detail: "Updated structural plans v2.1",
      time: "5 days ago",
    },
    {
      id: 3,
      action: "Team member added",
      detail: "Emily Davis joined as Safety Officer",
      time: "1 week ago",
    },
    {
      id: 4,
      action: "Budget updated",
      detail: "Additional $200,000 allocated for materials",
      time: "2 weeks ago",
    },
  ]

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      setError(null)

      try {
        const obraId = params.id

        // 1) Obra base
        const {
          data: obraData,
          error: obraError,
        } = await supabase
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
            end_date_actual,
            notes
          `,
          )
          .eq("id", obraId)
          .single()

        if (obraError || !obraData) {
          console.error("Error fetching obra:", obraError)
          setError("No se encontró la obra o hubo un error al cargarla.")
          setLoading(false)
          return
        }

        setObra(obraData as ObraRow)

        setEditForm({
          name: obraData.name,
          client_name: obraData.client_name ?? "",
          location_text: obraData.location_text ?? "",
          status: obraData.status as DbObraStatus,
          start_date_planned: obraData.start_date_planned ?? "",
          end_date_planned: obraData.end_date_planned ?? "",
          notes: obraData.notes ?? "",
        })

        // 2) En paralelo: contratos, estado de cuenta, reportes, team
        const [
          { data: contractsData, error: contractsError },
          { data: stateAccountsData, error: stateAccountsError },
          { data: reportsData, error: reportsError },
          { data: assignmentsData, error: assignmentsError },
        ] = await Promise.all([
          supabase
            .from("contracts")
            .select("id, obra_id, contract_amount, currency")
            .eq("obra_id", obraId),
          supabase
            .from("obra_state_accounts")
            .select("id, obra_id, amount, concept, method, date, bank_ref, note")
            .eq("obra_id", obraId),
          supabase
            .from("site_reports")
            .select("id, obra_id, report_date, progress_percent")
            .eq("obra_id", obraId)
            .order("report_date", { ascending: false })
            .limit(1),
          supabase
            .from("obra_assignments")
            .select("id, obra_id, employee_id, role_on_site, employees(full_name)")
            .eq("obra_id", obraId),
        ])

        if (contractsError) console.error("contracts error", contractsError)
        if (stateAccountsError)
          console.error("state accounts error", stateAccountsError)
        if (reportsError) console.error("reports error", reportsError)
        if (assignmentsError)
          console.error("assignments error", assignmentsError)

        // Budget: suma de contratos
        const contracts = (contractsData || []) as ContractRow[]
        const totalContractAmount = contracts.reduce((sum, c) => {
          const val = typeof c.contract_amount === "string"
            ? parseFloat(c.contract_amount)
            : c.contract_amount || 0
          return sum + (val || 0)
        }, 0)

        const currency =
          contracts[0]?.currency && contracts[0].currency.trim() !== ""
            ? contracts[0].currency
            : "MXN"

        setBudgetTotal(totalContractAmount)
        setBudgetCurrency(currency)

        // Spent: suma de movimientos (deposit, advance, retention, return)
        const stateAccounts = (stateAccountsData || []) as ObraStateAccountRow[]

        // los guardamos para el tab de Estado de Cuenta
        // ordenados por fecha (desc) por comodidad visual
        stateAccounts.sort((a, b) => (a.date > b.date ? -1 : 1))
        setStateAccounts(stateAccounts)

        const totalSpent = stateAccounts.reduce((sum, m) => {
          const val =
            typeof m.amount === "string" ? parseFloat(m.amount) : m.amount
          return sum + (val || 0)
        }, 0)
        setSpentTotal(totalSpent)

        // Progress: último site_report.progress_percent
        const lastReport = (reportsData || []) as SiteReportRow[]
        const progressValue = lastReport[0]?.progress_percent
        setProgress(
          progressValue !== null && progressValue !== undefined
            ? Number(progressValue)
            : 0,
        )

        // Team Size: cantidad de assignments (incluye manager y demás roles)
        const assignments = (assignmentsData || []) as ObraAssignmentRow[]
        setTeamSize(assignments.length)

        // Buscar responsable de obra (role_on_site = 'manager')
        const managerAssignment = assignments.find(
          (a) => a.role_on_site?.toLowerCase() === "manager",
        )

        let foundManagerName: string | null = null

        if (managerAssignment) {
          const emp = managerAssignment.employees
          if (Array.isArray(emp)) {
            foundManagerName = emp[0]?.full_name ?? null
          } else {
            foundManagerName = emp?.full_name ?? null
          }
        }

        setManagerName(foundManagerName)

      } catch (e) {
        console.error(e)
        setError("Error inesperado al cargar la obra.")
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [params.id])

    if (loading) {
    return (
      <AdminLayout>
        <div className="py-10 text-center text-slate-500 text-sm">
          Cargando información de la obra...
        </div>
      </AdminLayout>
    )
  }

  if (error || !obra) {
    return (
      <AdminLayout>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Link href="/admin/projects">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <h1 className="text-2xl font-bold text-slate-900">
              Detalle de obra
            </h1>
          </div>
          <Card>
            <CardContent className="py-10 text-center text-red-500">
              {error ?? "No se encontró la obra."}
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    )
  }

  const statusUi = mapDbStatusToBadge(obra.status)

  const displayedProgress = Math.max(
    0,
    Math.min(100, Number.isFinite(progress) ? progress : 0),
  )

  const budgetFormatted = formatCurrency(budgetTotal, budgetCurrency)
  const spentFormatted = formatCurrency(spentTotal, budgetCurrency)
  const remaining = budgetTotal - spentTotal
  const remainingFormatted = formatCurrency(remaining, budgetCurrency)

  const startDate =
    obra.start_date_actual ?? obra.start_date_planned ?? "Sin fecha de inicio"
  const endDate =
    obra.end_date_actual ?? obra.end_date_planned ?? "Sin fecha de cierre"

  const location = obra.location_text ?? "Sin ubicación registrada"
  const clientName = obra.client_name ?? "Cliente no especificado"

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin/projects">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">
                {obra.name}
              </h1>
              <div className="flex flex-wrap items-center gap-2 mt-1 text-sm">
                <MapPin className="w-4 h-4 text-slate-500" />
                <span className="text-slate-600">{location}</span>
                <span className="text-slate-400 mx-2">•</span>
                <span className="text-slate-500">
                  Cliente: <span className="font-medium">{clientName}</span>
                </span>
                {obra.code && (
                  <>
                    <span className="text-slate-400 mx-2">•</span>
                    <span className="text-slate-500">
                      Clave:{" "}
                      <span className="font-mono text-xs">{obra.code}</span>
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Edit className="w-4 h-4 mr-2" />
              Edit Project
            </Button>

            <Button
              variant="destructive"
              onClick={handleDeleteObra}
              disabled={deleteLoading}
            >
              {deleteLoading ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </div>

        {/* Tabs + contenido */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">

          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="milestones">Milestones</TabsTrigger>
            <TabsTrigger value="account">Estado de Cuenta</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          {/* OVERVIEW */}
          <TabsContent value="overview" className="space-y-6">
            {/* Overview cards (Status / Progress / Budget / Team) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Status */}
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-600">
                        Status
                      </p>
                      <Badge className={`${statusUi.className} mt-2`}>
                        {statusUi.label}
                      </Badge>
                      <p className="text-xs text-slate-500 mt-2">
                        Inicio: {startDate}
                        <br />
                        Fin: {endDate}
                      </p>
                    </div>
                    <div className="p-3 bg-blue-50 rounded-lg">
                      <Clock className="w-5 h-5 text-blue-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Progress */}
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-600">
                        Progress
                      </p>
                      <p className="text-2xl font-bold text-slate-900 mt-2">
                        {displayedProgress}%
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Basado en el último reporte de obra
                      </p>
                    </div>
                    <div className="p-3 bg-green-50 rounded-lg">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Budget – ahora clickable */}
              <Card
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setActiveTab("account")}
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-600">Budget</p>
                      <p className="text-2xl font-bold text-slate-900 mt-2">
                        {budgetFormatted}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Spent: {spentFormatted}
                      </p>
                    </div>
                    <div className="p-3 bg-purple-50 rounded-lg">
                      <DollarSign className="w-5 h-5 text-purple-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Team size – clickable*/}
              <Card
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setActiveTab("team")}
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-600">Team Size</p>
                      <p className="text-xs text-slate-500 mt-1">
                        Manager:{" "}
                        <span className="font-medium text-slate-900">
                          {managerName ?? "Sin responsable asignado"}
                        </span>
                      </p>
                      <p className="text-2xl font-bold text-slate-900 mt-3">
                        {teamSize}
                      </p>
                    </div>
                    <div className="p-3 bg-orange-50 rounded-lg">
                      <Users className="w-5 h-5 text-orange-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Project Details */}
            <Card>
              <CardHeader>
                <CardTitle>Project Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-slate-600">
                    Description / Notes
                  </p>
                  <p className="text-sm text-slate-900 mt-1">
                    {obra.notes ||
                      "No hay notas registradas aún para esta obra."}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div>
                    <p className="text-sm font-medium text-slate-600">
                      Start Date (planned / actual)
                    </p>
                    <p className="text-sm text-slate-900 mt-1">
                      {startDate}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-600">
                      End Date (planned / actual)
                    </p>
                    <p className="text-sm text-slate-900 mt-1">{endDate}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-600">
                      Client
                    </p>
                    <p className="text-sm text-slate-900 mt-1">
                      {clientName}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-600">
                      Location
                    </p>
                    <p className="text-sm text-slate-900 mt-1">
                      {location}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Budget Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Budget Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-600">
                        Total Spent
                      </span>
                      <span className="text-sm font-bold text-slate-900">
                        {budgetTotal > 0
                          ? `${Math.round((spentTotal / budgetTotal) * 100)}%`
                          : "0%"}
                      </span>
                    </div>
                    <Progress
                      value={
                        budgetTotal > 0
                          ? Math.min(
                              100,
                              Math.max(0, (spentTotal / budgetTotal) * 100),
                            )
                          : 0
                      }
                      className="h-2"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                    <div>
                      <p className="text-sm text-slate-600">Total Budget</p>
                      <p className="text-lg font-bold text-slate-900">
                        {budgetFormatted}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-600">Remaining</p>
                      <p className="text-lg font-bold text-green-600">
                        {remainingFormatted}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* MILESTONES (igual que antes) */}
          <TabsContent value="milestones">
            <Card>
              <CardHeader>
                <CardTitle>Project Milestones</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {milestones.map((milestone) => (
                    <div
                      key={milestone.id}
                      className="flex items-start gap-4 pb-4 border-b last:border-0"
                    >
                      <div className="mt-1">
                        {milestone.status === "completed" ? (
                          <CheckCircle2 className="w-5 h-5 text-green-600" />
                        ) : milestone.status === "in-progress" ? (
                          <Clock className="w-5 h-5 text-blue-600" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-slate-400" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium text-slate-900">
                            {milestone.name}
                          </h4>
                          <span className="text-sm text-slate-600">
                            {milestone.date}
                          </span>
                        </div>
                        <Progress
                          value={milestone.progress}
                          className="h-2"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          {milestone.progress}% complete
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

                    {/* ESTADO DE CUENTA */}
          <TabsContent value="account" className="space-y-6">
            {/* Resumen de montos */}
            <Card>
              <CardHeader>
                <CardTitle>Estado de Cuenta</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <p className="text-sm text-slate-600">Costo de la obra</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1">
                      {budgetFormatted}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Cobrado</p>
                    <p className="text-xl font-semibold text-green-600 mt-1">
                      {spentFormatted}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">
                      Restante por cobrar
                    </p>
                    <p className="text-xl font-semibold text-slate-900 mt-1">
                      {remainingFormatted}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Lista de movimientos */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Pagos y movimientos</CardTitle>
                <Button size="sm" onClick={() => setNewPaymentOpen(true)}>
                  + Nuevo depósito
                </Button>
              </CardHeader>
              <CardContent>
                {stateAccounts.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Aún no hay movimientos registrados para esta obra.
                  </p>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fecha depósito</TableHead>
                          <TableHead>Concepto</TableHead>
                          <TableHead>Método</TableHead>
                          <TableHead>Referencia</TableHead>
                          <TableHead>Nota</TableHead>
                          <TableHead className="text-right">Monto</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stateAccounts.map((m) => {
                          const amountNumber =
                            typeof m.amount === "string"
                              ? parseFloat(m.amount)
                              : m.amount
                          return (
                            <TableRow key={m.id}>
                              <TableCell>{m.date}</TableCell>
                              <TableCell>
                                {m.concept === "deposit"
                                  ? "Depósito"
                                  : m.concept === "advance"
                                  ? "Anticipo"
                                  : m.concept === "retention"
                                  ? "Retención"
                                  : "Devolución"}
                              </TableCell>
                              <TableCell>
                                {m.method === "transfer"
                                  ? "Transferencia"
                                  : m.method === "cash"
                                  ? "Efectivo"
                                  : m.method === "check"
                                  ? "Cheque"
                                  : "Otro"}
                              </TableCell>
                              <TableCell>{m.bank_ref || "-"}</TableCell>
                              <TableCell className="max-w-xs truncate">
                                {m.note || "-"}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {formatCurrency(
                                  Number(amountNumber || 0),
                                  budgetCurrency,
                                )}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TEAM (mock) */}
          <TabsContent value="team">
            <Card>
              <CardHeader>
                <CardTitle>Team Members</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {teamMembers.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center gap-3 p-4 border border-slate-200 rounded-lg"
                    >
                      <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                        <span className="text-sm font-bold text-blue-600">
                          {member.avatar}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">
                          {member.name}
                        </p>
                        <p className="text-sm text-slate-600">
                          {member.role}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ACTIVITY (mock) */}
          <TabsContent value="activity">
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentActivities.map((activity) => (
                    <div
                      key={activity.id}
                      className="flex items-start gap-4 pb-4 border-b last:border-0"
                    >
                      <div className="w-2 h-2 bg-blue-600 rounded-full mt-2" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-900">
                          {activity.action}
                        </p>
                        <p className="text-sm text-slate-600 mt-1">
                          {activity.detail}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          {activity.time}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit Obra</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-600">Name *</label>
              <Input
                value={editForm.name}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-600">
                Client Name
              </label>
              <Input
                value={editForm.client_name}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, client_name: e.target.value }))
                }
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-600">
                Location
              </label>
              <Input
                value={editForm.location_text}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, location_text: e.target.value }))
                }
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-600">Status</label>
              <Select
                value={editForm.status}
                onValueChange={(v) =>
                  setEditForm((f) => ({ ...f, status: v as DbObraStatus }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planned">Planned</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">
                  Planned Start
                </label>
                <Input
                  type="date"
                  value={editForm.start_date_planned || ""}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      start_date_planned: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">
                  Planned End
                </label>
                <Input
                  type="date"
                  value={editForm.end_date_planned || ""}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      end_date_planned: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-600">Notes</label>
              <Textarea
                value={editForm.notes}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, notes: e.target.value }))
                }
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleUpdateObra} disabled={savingEdit}>
                {savingEdit ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog nuevo depósito / movimiento */}
      <Dialog open={newPaymentOpen} onOpenChange={setNewPaymentOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar nuevo depósito</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">
                  Concepto
                </label>
                <Select
                  value={newPaymentForm.concept}
                  onValueChange={(v) =>
                    setNewPaymentForm((f) => ({
                      ...f,
                      concept: v as ObraStateAccountRow["concept"],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="deposit">Depósito</SelectItem>
                    <SelectItem value="advance">Anticipo</SelectItem>
                    <SelectItem value="retention">Retención</SelectItem>
                    <SelectItem value="return">Devolución</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">
                  Monto
                </label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={newPaymentForm.amount}
                  onChange={(e) =>
                    setNewPaymentForm((f) => ({
                      ...f,
                      amount: e.target.value,
                    }))
                  }
                  placeholder="0.00"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">
                  Método de pago
                </label>
                <Select
                  value={newPaymentForm.method || "transfer"}
                  onValueChange={(v) =>
                    setNewPaymentForm((f) => ({
                      ...f,
                      method: v as ObraStateAccountRow["method"],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="transfer">Transferencia</SelectItem>
                    <SelectItem value="cash">Efectivo</SelectItem>
                    <SelectItem value="check">Cheque</SelectItem>
                    <SelectItem value="other">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">
                  Fecha del depósito
                </label>
                <Input
                  type="date"
                  value={newPaymentForm.date}
                  onChange={(e) =>
                    setNewPaymentForm((f) => ({
                      ...f,
                      date: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-600">
                Referencia bancaria
              </label>
              <Input
                value={newPaymentForm.bank_ref}
                onChange={(e) =>
                  setNewPaymentForm((f) => ({
                    ...f,
                    bank_ref: e.target.value,
                  }))
                }
                placeholder="Referencia / folio / recibo"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-600">
                Nota
              </label>
              <Textarea
                rows={3}
                value={newPaymentForm.note}
                onChange={(e) =>
                  setNewPaymentForm((f) => ({
                    ...f,
                    note: e.target.value,
                  }))
                }
                placeholder="Comentario adicional sobre este movimiento"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setNewPaymentOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleCreatePayment}
                disabled={newPaymentSaving}
              >
                {newPaymentSaving ? "Guardando..." : "Guardar depósito"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </AdminLayout>
  )
}
