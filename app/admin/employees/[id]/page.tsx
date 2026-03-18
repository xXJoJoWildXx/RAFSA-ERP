"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"

import { AdminLayout } from "@/components/admin-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Mail,
  Phone,
  MapPin,
  Briefcase,
  Calendar,
  ArrowLeft,
  Edit,
  Building2,
  AlertCircle,
  FileText,
  Download,
  Eye,
  Trash2,
  Plus,
  FolderOpen,
  History,
} from "lucide-react"
import { supabase } from "@/lib/supabaseClient"

// -------------------- Tipos reales de la DB --------------------

type EmployeeRow = {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  status: string
  hire_date: string | null
  photo_url: string | null
  imss_number: string | null
  rfc: string | null
  birth_date: string | null
  base_salary: number | string
  real_salary: number | string
  bonus_amount: number | string
  overtime_hour_cost: number | string
  emergency_contact: string | null
  created_at: string
}

// Roles
type RoleCatalogRow = {
  id: string
  code: string
  name: string
  is_active: boolean
}

type EmployeeRoleJoinRow = {
  employee_id: string
  role_id: string
  employee_roles_catalog: RoleCatalogRow | RoleCatalogRow[] | null
}

type EmployeeRole = {
  id: string
  code: string
  name: string
}

// Fila de obra
type ObraRow = {
  id: string
  name: string | null
  status: string | null
}

type ObraAssignmentWithObra = {
  employee_id: string
  obra_id: string
  obras: ObraRow | ObraRow[] | null
}

type AssignedObra = {
  obraId: string
  name: string
  status: string | null
}

type EmployeeDetail = {
  id: string
  name: string
  email: string | null
  phone: string | null
  statusUi: "Activo" | "Inactivo" | "De permiso"
  statusRaw: string
  joinDate: string | null
  avatar: string
  imss_number: string | null
  rfc: string | null
  birth_date: string | null
  base_salary: number
  real_salary: number
  bonus_amount: number
  overtime_hour_cost: number
  emergency_contact: string | null
  created_at: string
  photo_url: string | null
  roles: EmployeeRole[]
}

type EditEmployeeForm = {
  full_name: string
  email: string
  phone: string
  status: "active" | "inactive"
  hire_date: string
  birth_date: string
  imss_number: string
  rfc: string
  emergency_contact: string
  payroll_salary: string
  real_salary: string
  bonus_amount: string
  overtime_hour_cost: string
}

// -------------------- Historial salarial --------------------

type EmployeeSalaryHistoryRow = {
  id: string
  employee_id: string
  real_salary: number
  payroll_salary: number
  bonus_amount: number
  overtime_hour_cost: number
  valid_from: string
  valid_to: string | null
  changed_by: string | null
  changed_by_name: string
  change_reason: string | null
  created_at: string
}

// -------------------- Documentos --------------------

type EmployeeDocType =
  | "tax_certificate"
  | "birth_certificate"
  | "imss"
  | "curp"
  | "ine"
  | "address_proof"
  | "profile_photo"

type RequiredEmployeeDocType = Exclude<EmployeeDocType, "profile_photo">

const REQUIRED_DOCS: RequiredEmployeeDocType[] = [
  "tax_certificate",
  "birth_certificate",
  "imss",
  "curp",
  "ine",
  "address_proof",
]

const DOC_LABELS: Record<EmployeeDocType, string> = {
  tax_certificate: "Constancia de Situación Fiscal",
  birth_certificate: "Acta de Nacimiento",
  imss: "IMSS",
  curp: "CURP",
  ine: "INE",
  address_proof: "Comprobante de domicilio",
  profile_photo: "Foto de perfil",
}

type EmployeeDocumentRow = {
  id?: string
  employee_id: string
  doc_type: EmployeeDocType
  storage_bucket: string
  storage_path: string
  file_name: string | null
  mime_type: string | null
  file_size: number | null
  created_at?: string
  updated_at?: string
}

type EmployeeDocumentsApiResponse = {
  documents: EmployeeDocumentRow[]
  signed_urls?: Partial<Record<EmployeeDocType, string>>
  profile_photo_url?: string | null
}

// -------------------- Carpeta DC3 --------------------

type Dc3DocumentRow = {
  id: string
  employee_id: string
  storage_bucket: string
  storage_path: string
  file_name: string | null
  mime_type: string | null
  file_size: number | null
  created_at?: string
  updated_at?: string
}

type EmployeeDc3ApiResponse = {
  documents: Dc3DocumentRow[]
  signed_urls?: Record<string, string>
}

// -------------------- Helpers --------------------

function mapDbStatusToUi(status: string): EmployeeDetail["statusUi"] {
  const normalized = status?.toLowerCase()
  if (normalized === "active") return "Activo"
  if (normalized === "inactive") return "Inactivo"
  if (normalized === "on_leave" || normalized === "on-leave") return "De permiso"
  return "Inactivo"
}

function mapUiStatusToDb(
  statusUi: EmployeeDetail["statusUi"],
): "active" | "inactive" {
  if (statusUi === "Inactivo") return "inactive"
  return "active"
}

function getStatusColor(statusUi: EmployeeDetail["statusUi"]) {
  switch (statusUi) {
    case "Activo":
      return "bg-green-100 text-green-700"
    case "De permiso":
      return "bg-yellow-100 text-yellow-700"
    case "Inactivo":
      return "bg-slate-100 text-slate-700"
    default:
      return "bg-slate-100 text-slate-700"
  }
}

function makeAvatarInitials(name?: string | null): string {
  if (!name) return "??"
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

function formatDate(dateString: string | null) {
  if (!dateString) return "No especificado"
  const d = new Date(dateString)
  if (Number.isNaN(d.getTime())) return dateString
  return d.toLocaleDateString("es-MX", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  })
}

function formatDateTime(dateString: string | null) {
  if (!dateString) return "No especificado"
  const d = new Date(dateString)
  if (Number.isNaN(d.getTime())) return dateString
  return d.toLocaleString("es-MX", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatMoneyMXN(value: number) {
  return `$${value.toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} MXN`
}

function mapRowToDetail(row: EmployeeRow): EmployeeDetail {
  const statusUi = mapDbStatusToUi(row.status)
  const payrollSalary =
    row.base_salary !== null && row.base_salary !== undefined
      ? Number(row.base_salary)
      : 0
  const realSalary =
    row.real_salary !== null && row.real_salary !== undefined
      ? Number(row.real_salary)
      : 0
  const bonusAmount =
    row.bonus_amount !== null && row.bonus_amount !== undefined
      ? Number(row.bonus_amount)
      : 0
  const overtime =
    row.overtime_hour_cost !== null && row.overtime_hour_cost !== undefined
      ? Number(row.overtime_hour_cost)
      : 0

  return {
    id: row.id,
    name: row.full_name,
    email: row.email,
    phone: row.phone,
    statusUi,
    statusRaw: row.status,
    joinDate: row.hire_date,
    avatar: makeAvatarInitials(row.full_name),
    imss_number: row.imss_number,
    rfc: row.rfc,
    birth_date: row.birth_date,
    base_salary: payrollSalary,
    real_salary: realSalary,
    bonus_amount: bonusAmount,
    overtime_hour_cost: overtime,
    emergency_contact: row.emergency_contact,
    created_at: row.created_at,
    photo_url: row.photo_url ?? null,
    roles: [],
  }
}

function getObraStatusColor(status: string | null) {
  const normalized = status?.toLowerCase() || ""
  switch (normalized) {
    case "planned":
      return "bg-slate-100 text-slate-700"
    case "in_progress":
      return "bg-blue-100 text-blue-700"
    case "paused":
      return "bg-yellow-100 text-yellow-700"
    case "closed":
      return "bg-emerald-100 text-emerald-700"
    default:
      return "bg-slate-100 text-slate-700"
  }
}

function formatObraStatus(status: string | null) {
  const normalized = status?.toLowerCase() || ""
  switch (normalized) {
    case "planned":
      return "Planeada"
    case "in_progress":
      return "En progreso"
    case "paused":
      return "Pausada"
    case "closed":
      return "Cerrada"
    default:
      return status ?? "Desconocido"
  }
}

function normalizeMimeIsPdf(mime: string | null) {
  const m = (mime || "").toLowerCase()
  return m.includes("pdf")
}

function sortRolesWithPriority(roles: EmployeeRole[]) {
  const copy = [...roles]
  copy.sort((a, b) => {
    const aIsDirector = a.code === "director_obra"
    const bIsDirector = b.code === "director_obra"
    if (aIsDirector && !bIsDirector) return -1
    if (!aIsDirector && bIsDirector) return 1
    return a.name.localeCompare(b.name, "es")
  })
  return copy
}

function getPrimaryRoleLabelFromSorted(sortedRoles: EmployeeRole[]) {
  if (!sortedRoles || sortedRoles.length === 0) return "Sin rol"
  return sortedRoles[0].name
}

function formatHistoryRange(validFrom: string, validTo: string | null) {
  const from = formatDateTime(validFrom)
  if (!validTo) return `${from} - Actual`
  return `${from} - ${formatDateTime(validTo)}`
}

async function fetchEmployeeSalaryHistory(employeeId: string) {
  const res = await fetch(
    `/api/employee-salary-history?employeeId=${encodeURIComponent(employeeId)}`,
    {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    },
  )

  const json = await res.json().catch(() => null)

  if (!res.ok) {
    console.error("Salary history API error:", json)
    throw new Error(
      json?.details || json?.error || "No se pudo cargar el historial salarial.",
    )
  }

  return json as {
    ok: boolean
    history: EmployeeSalaryHistoryRow[]
  }
}

async function updateEmployeeSalaryHistory(args: {
  employeeId: string
  real_salary: number
  payroll_salary: number
  bonus_amount: number
  overtime_hour_cost: number
  authUserId?: string | null
  change_reason?: string | null
}) {
  const res = await fetch("/api/employee-salary-history", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  })

  const json = await res.json().catch(() => null)

  if (!res.ok) {
    throw new Error(json?.error || "No se pudo actualizar el salario.")
  }

  return json as {
    ok: boolean
    updated: boolean
    message?: string
    employee?: EmployeeRow
  }
}

async function deleteEmployeeCascade(employeeId: string) {
  const res = await fetch(`/api/employees/${employeeId}`, {
    method: "DELETE",
  })

  const json = await res.json().catch(() => null)

  if (!res.ok) {
    throw new Error(json?.error || "No se pudo eliminar el empleado.")
  }

  return json as {
    ok: boolean
    deleted: boolean
  }
}

// -------------------- Page --------------------

export default function EmployeeDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params?.id

  const [employee, setEmployee] = useState<EmployeeDetail | null>(null)
  const [projects, setProjects] = useState<AssignedObra[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null)

  // Documentos base
  const [documents, setDocuments] = useState<EmployeeDocumentRow[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [docsError, setDocsError] = useState<string | null>(null)

  // Carpeta DC3
  const [dc3Documents, setDc3Documents] = useState<Dc3DocumentRow[]>([])
  const [dc3SignedUrls, setDc3SignedUrls] = useState<Record<string, string>>({})
  const [dc3Loading, setDc3Loading] = useState(false)
  const [dc3Error, setDc3Error] = useState<string | null>(null)
  const [dc3DialogOpen, setDc3DialogOpen] = useState(false)
  const [dc3Saving, setDc3Saving] = useState(false)
  const [dc3Files, setDc3Files] = useState<File[]>([])

  // Edit perfil general
  const [editOpen, setEditOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editForm, setEditForm] = useState<EditEmployeeForm | null>(null)

  // Popups individuales de overview
  const [laborOpen, setLaborOpen] = useState(false)
  const [payrollOpen, setPayrollOpen] = useState(false)

  // Historial salarios
  const [salaryHistoryOpen, setSalaryHistoryOpen] = useState(false)
  const [salaryHistoryLoading, setSalaryHistoryLoading] = useState(false)
  const [salaryHistoryError, setSalaryHistoryError] = useState<string | null>(null)
  const [salaryHistoryRows, setSalaryHistoryRows] = useState<EmployeeSalaryHistoryRow[]>([])
  const [currentAuthUserId, setCurrentAuthUserId] = useState<string | null>(null)

  // Delete empleado
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState("")

  // Popup documentos
  const [docsDialogOpen, setDocsDialogOpen] = useState(false)
  const [docsSaving, setDocsSaving] = useState(false)
  const [docFiles, setDocFiles] = useState<
    Partial<Record<EmployeeDocType, File | null>>
  >({
    tax_certificate: null,
    birth_certificate: null,
    imss: null,
    curp: null,
    ine: null,
    address_proof: null,
    profile_photo: null,
  })

  const [docSignedUrls, setDocSignedUrls] = useState<
    Partial<Record<EmployeeDocType, string>>
  >({})

  // Roles
  const [rolesCatalog, setRolesCatalog] = useState<RoleCatalogRow[]>([])
  const [rolesDialogOpen, setRolesDialogOpen] = useState(false)
  const [rolesSaving, setRolesSaving] = useState(false)

  const [editRoleIds, setEditRoleIds] = useState<string[]>([])
  const [rolePickerValue, setRolePickerValue] = useState<string>("")

  // -------- Cargar catálogo roles --------
  useEffect(() => {
    const fetchRolesCatalog = async () => {
      const { data, error } = await supabase
        .from("employee_roles_catalog")
        .select("id, code, name, is_active")
        .eq("is_active", true)
        .order("name", { ascending: true })

      if (error) {
        console.error("Error fetching employee_roles_catalog:", error)
        return
      }

      setRolesCatalog((data || []) as RoleCatalogRow[])
    }

    fetchRolesCatalog()
  }, [])

  // -------- Carga inicial: empleado + obras + roles --------
  useEffect(() => {
    if (!id) return

    const fetchData = async () => {
      setLoading(true)
      setError(null)

      try {
        const { data: empData, error: empError } = await supabase
          .from("employees")
          .select(
            `
            id,
            full_name,
            email,
            phone,
            status,
            hire_date,
            photo_url,
            imss_number,
            rfc,
            birth_date,
            base_salary,
            real_salary,
            bonus_amount,
            overtime_hour_cost,
            emergency_contact,
            created_at
          `,
          )
          .eq("id", id)
          .single()

        if (empError) {
          console.error("Error fetching employee:", empError)
          setError("No se pudo cargar la información del empleado.")
          setEmployee(null)
          setLoading(false)
          return
        }

        const row = empData as EmployeeRow
        const mapped = mapRowToDetail(row)

        const { data: roleJoinData, error: roleJoinErr } = await supabase
          .from("employee_roles")
          .select(
            `
            employee_id,
            role_id,
            employee_roles_catalog (
              id,
              code,
              name,
              is_active
            )
          `,
          )
          .eq("employee_id", id)

        if (roleJoinErr) {
          console.error("Error fetching employee_roles join:", roleJoinErr)
        } else {
          const joinRows = (roleJoinData || []) as EmployeeRoleJoinRow[]
          const roles: EmployeeRole[] = []

          joinRows.forEach((jr) => {
            const raw = jr.employee_roles_catalog
            const cat = Array.isArray(raw) ? raw[0] : raw
            if (!cat) return
            if (cat.is_active === false) return
            roles.push({ id: cat.id, code: cat.code, name: cat.name })
          })

          mapped.roles = roles
        }

        setEmployee(mapped)

        const { data: assignData, error: assignError } = await supabase
          .from("obra_assignments")
          .select(
            `
            employee_id,
            obra_id,
            obras (
              id,
              name,
              status
            )
          `,
          )
          .eq("employee_id", id)

        if (assignError) {
          console.error("Error fetching obra_assignments:", assignError)
        } else {
          const rows = (assignData || []) as ObraAssignmentWithObra[]

          const mappedProjects: AssignedObra[] = rows
            .map((row) => {
              const raw = row.obras
              let obra: ObraRow | null = null
              if (Array.isArray(raw)) obra = raw[0] ?? null
              else obra = raw

              if (!obra) return null

              const status = obra.status ?? null
              const normalized = status?.toLowerCase() || ""
              if (normalized === "closed") return null

              return {
                obraId: row.obra_id,
                name: obra.name ?? `Obra ${row.obra_id}`,
                status,
              }
            })
            .filter((p): p is AssignedObra => p !== null)

          setProjects(mappedProjects)
        }
      } catch (e) {
        console.error(e)
        setError("Error inesperado al cargar la información del empleado.")
        setEmployee(null)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [id])

  // -------- Carga de documentos base --------
  const fetchDocuments = async () => {
    if (!id) return
    setDocsLoading(true)
    setDocsError(null)

    try {
      const res = await fetch(
        `/api/employee-docs?employeeId=${encodeURIComponent(id)}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        },
      )

      if (!res.ok) {
        const text = await res.text().catch(() => "")
        throw new Error(text || "No se pudieron cargar los documentos.")
      }

      const json = (await res.json()) as EmployeeDocumentsApiResponse

      setDocuments(json.documents || [])
      setDocSignedUrls(json.signed_urls || {})
      setProfilePhotoUrl(json.profile_photo_url || null)
    } catch (e: any) {
      console.error(e)
      setDocsError(e?.message || "No se pudieron cargar los documentos.")
      setDocuments([])
      setDocSignedUrls({})
      setProfilePhotoUrl(null)
    } finally {
      setDocsLoading(false)
    }
  }

  useEffect(() => {
    const loadCurrentUser = async () => {
      const { data, error } = await supabase.auth.getUser()

      if (error) {
        console.error("Error obteniendo usuario autenticado:", error)
        setCurrentAuthUserId(null)
        return
      }

      setCurrentAuthUserId(data.user?.id ?? null)
    }

    loadCurrentUser()
  }, [])

  // -------- Carga de carpeta DC3 --------
  const fetchDc3Documents = async () => {
    if (!id) return
    setDc3Loading(true)
    setDc3Error(null)

    try {
      const res = await fetch(
        `/api/employee-dc3-folder?employeeId=${encodeURIComponent(id)}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        },
      )

      if (!res.ok) {
        const text = await res.text().catch(() => "")
        throw new Error(text || "No se pudo cargar la carpeta DC3.")
      }

      const json = (await res.json()) as EmployeeDc3ApiResponse
      setDc3Documents(json.documents || [])
      setDc3SignedUrls(json.signed_urls || {})
    } catch (e: any) {
      console.error(e)
      setDc3Error(e?.message || "No se pudo cargar la carpeta DC3.")
      setDc3Documents([])
      setDc3SignedUrls({})
    } finally {
      setDc3Loading(false)
    }
  }

  const loadSalaryHistory = async () => {
    if (!id) return
    setSalaryHistoryLoading(true)
    setSalaryHistoryError(null)

    try {
      const res = await fetchEmployeeSalaryHistory(id)
      setSalaryHistoryRows(res.history || [])
    } catch (e: any) {
      console.error(e)
      setSalaryHistoryError(e?.message || "No se pudo cargar el historial salarial.")
      setSalaryHistoryRows([])
    } finally {
      setSalaryHistoryLoading(false)
    }
  }

  useEffect(() => {
    if (!id) return
    fetchDocuments()
    fetchDc3Documents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const docsMap = useMemo(() => {
    const map = new Map<EmployeeDocType, EmployeeDocumentRow>()
    for (const d of documents) map.set(d.doc_type, d)
    return map
  }, [documents])

  // -------- Edit empleado (perfil) --------
  const initEditFormFromEmployee = () => {
    if (!employee) return

    setEditForm({
      full_name: employee.name ?? "",
      email: employee.email ?? "",
      phone: employee.phone ?? "",
      status: mapUiStatusToDb(employee.statusUi),
      hire_date: employee.joinDate ?? "",
      birth_date: employee.birth_date ?? "",
      imss_number: employee.imss_number ?? "",
      rfc: employee.rfc ?? "",
      emergency_contact: employee.emergency_contact ?? "",
      payroll_salary: employee.base_salary?.toString() ?? "0",
      real_salary: employee.real_salary?.toString() ?? "0",
      bonus_amount: employee.bonus_amount?.toString() ?? "0",
      overtime_hour_cost: employee.overtime_hour_cost?.toString() ?? "0",
    })
  }

  const handleOpenChange = (open: boolean) => {
    setEditOpen(open)
    if (open) {
      initEditFormFromEmployee()
    }
  }

  const handleEditChange = (field: keyof EditEmployeeForm, value: string) => {
    setEditForm((prev) => (prev ? { ...prev, [field]: value } : prev))
  }

  const handleSave = async () => {
    if (!editForm || !id) return
    if (!editForm.full_name.trim()) {
      alert("El nombre completo es obligatorio.")
      return
    }

    setSaving(true)

    const payload = {
      full_name: editForm.full_name.trim(),
      email: editForm.email.trim() || null,
      phone: editForm.phone.trim() || null,
      status: editForm.status,
      hire_date: editForm.hire_date || null,
      birth_date: editForm.birth_date || null,
      imss_number: editForm.imss_number.trim() || null,
      rfc: editForm.rfc.trim() || null,
      emergency_contact: editForm.emergency_contact.trim() || null,
      base_salary: Number(editForm.payroll_salary) || 0,
      real_salary: Number(editForm.real_salary) || 0,
      bonus_amount: Number(editForm.bonus_amount) || 0,
      overtime_hour_cost: Number(editForm.overtime_hour_cost) || 0,
    }

    try {
      const { data, error } = await supabase
        .from("employees")
        .update(payload)
        .eq("id", id)
        .select(
          `
          id,
          full_name,
          email,
          phone,
          status,
          hire_date,
          photo_url,
          imss_number,
          rfc,
          birth_date,
          base_salary,
          real_salary,
          bonus_amount,
          overtime_hour_cost,
          emergency_contact,
          created_at
        `,
        )
        .single()

      if (error) {
        console.error("Error updating employee:", error)
        alert("No se pudo actualizar el empleado.")
        return
      }

      const updatedRow = data as EmployeeRow
      setEmployee((prev) => {
        const next = mapRowToDetail(updatedRow)
        next.roles = prev?.roles || []
        return next
      })
      setEditOpen(false)
    } catch (e) {
      console.error(e)
      alert("Ocurrió un error inesperado al actualizar el empleado.")
    } finally {
      setSaving(false)
    }
  }

  const handleSavePayroll = async () => {
    if (!id || !editForm) return

    try {
      setSaving(true)

      const result = await updateEmployeeSalaryHistory({
        employeeId: id,
        real_salary: Number(editForm.real_salary) || 0,
        payroll_salary: Number(editForm.payroll_salary) || 0,
        bonus_amount: Number(editForm.bonus_amount) || 0,
        overtime_hour_cost: Number(editForm.overtime_hour_cost) || 0,
        authUserId: currentAuthUserId,
        change_reason: null,
      })

      if (result?.employee) {
        const updatedRow = result.employee as EmployeeRow
        setEmployee((prev) => {
          const next = mapRowToDetail(updatedRow)
          next.roles = prev?.roles || []
          return next
        })
      }

      await loadSalaryHistory()
      setPayrollOpen(false)
    } catch (e: any) {
      console.error(e)
      alert(e?.message || "No se pudieron guardar los salarios.")
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteEmployee = async () => {
    if (!id || !employee) return

    if (deleteConfirmText.trim().toUpperCase() !== "ELIMINAR") {
      alert('Para confirmar, escribe "ELIMINAR".')
      return
    }

    try {
      setDeleting(true)
      await deleteEmployeeCascade(id)
      setDeleteOpen(false)
      router.push("/admin/employees")
    } catch (e: any) {
      console.error(e)
      alert(e?.message || "No se pudo eliminar el empleado.")
    } finally {
      setDeleting(false)
    }
  }

  // -------- Documentos base --------

  const handleChangeDocFile = (docType: EmployeeDocType, file: File | null) => {
    setDocFiles((prev) => ({ ...prev, [docType]: file }))
  }

  async function uploadOrReplaceDoc(docType: EmployeeDocType, file: File) {
    if (!id) return
    const fd = new FormData()
    fd.append("employeeId", id)
    fd.append("docType", docType)
    fd.append("file", file)

    const res = await fetch("/api/employee-docs", {
      method: "POST",
      body: fd,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new Error(text || `No se pudo subir ${DOC_LABELS[docType]}.`)
    }
  }

  async function deleteDoc(docType: EmployeeDocType) {
    if (!id) return
    const res = await fetch("/api/employee-docs", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: id, docType }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new Error(text || `No se pudo eliminar ${DOC_LABELS[docType]}.`)
    }
  }

  const handleSaveDocuments = async () => {
    if (!id) return
    setDocsSaving(true)

    try {
      const entries = Object.entries(docFiles) as Array<
        [EmployeeDocType, File | null]
      >
      const selected = entries.filter(([, f]) => !!f) as Array<
        [EmployeeDocType, File]
      >

      for (const [docType, file] of selected) {
        await uploadOrReplaceDoc(docType, file)
      }

      await fetchDocuments()

      setDocFiles({
        tax_certificate: null,
        birth_certificate: null,
        imss: null,
        curp: null,
        ine: null,
        address_proof: null,
        profile_photo: null,
      })

      setDocsDialogOpen(false)
    } catch (e: any) {
      console.error(e)
      alert(e?.message || "Hubo un error guardando los documentos.")
    } finally {
      setDocsSaving(false)
    }
  }

  // -------- Carpeta DC3 --------

  const handleChangeDc3Files = (files: FileList | null) => {
    if (!files) return
    setDc3Files(Array.from(files))
  }

  const uploadDc3File = async (file: File) => {
    if (!id) return

    const fd = new FormData()
    fd.append("employeeId", id)
    fd.append("file", file)

    const res = await fetch("/api/employee-dc3-folder", {
      method: "POST",
      body: fd,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new Error(text || `No se pudo subir "${file.name}".`)
    }
  }

  const deleteDc3File = async (documentId: string) => {
    const res = await fetch("/api/employee-dc3-folder", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new Error(
        text || "No se pudo eliminar el documento de la carpeta DC3.",
      )
    }
  }

  const handleSaveDc3Documents = async () => {
    if (!id) return
    if (dc3Files.length === 0) {
      setDc3DialogOpen(false)
      return
    }

    setDc3Saving(true)

    try {
      for (const file of dc3Files) {
        await uploadDc3File(file)
      }

      await fetchDc3Documents()
      setDc3Files([])
      setDc3DialogOpen(false)
    } catch (e: any) {
      console.error(e)
      alert(
        e?.message || "Hubo un error guardando los documentos de la carpeta DC3.",
      )
    } finally {
      setDc3Saving(false)
    }
  }

  // -------- Roles --------

  const openRolesDialog = () => {
    if (!employee) return
    setEditRoleIds(employee.roles.map((r) => r.id))
    setRolePickerValue("")
    setRolesDialogOpen(true)
  }

  const availableRolesForPicker = useMemo(() => {
    const selected = new Set(editRoleIds)
    return rolesCatalog.filter((r) => !selected.has(r.id))
  }, [rolesCatalog, editRoleIds])

  const selectedRoleChips = useMemo(() => {
    const map = new Map(rolesCatalog.map((r) => [r.id, r]))
    return editRoleIds
      .map((rid) => map.get(rid))
      .filter((r): r is RoleCatalogRow => !!r)
  }, [editRoleIds, rolesCatalog])

  const addRole = (roleId: string) => {
    if (!roleId) return
    setEditRoleIds((prev) =>
      prev.includes(roleId) ? prev : [...prev, roleId],
    )
    setRolePickerValue("")
  }

  const removeRole = (roleId: string) => {
    setEditRoleIds((prev) => prev.filter((rid) => rid !== roleId))
  }

  const saveRoles = async () => {
    if (!id) return
    if (editRoleIds.length === 0) {
      alert("Selecciona al menos un rol.")
      return
    }

    setRolesSaving(true)

    try {
      const { error: delErr } = await supabase
        .from("employee_roles")
        .delete()
        .eq("employee_id", id)

      if (delErr) {
        console.error("Error deleting employee_roles:", delErr)
        alert("No se pudieron limpiar los roles actuales.")
        return
      }

      const payload = editRoleIds.map((roleId) => ({
        employee_id: id,
        role_id: roleId,
      }))
      const { error: insErr } = await supabase
        .from("employee_roles")
        .insert(payload)

      if (insErr) {
        console.error("Error inserting employee_roles:", insErr)
        alert("No se pudieron guardar los roles.")
        return
      }

      const roles = rolesCatalog
        .filter((r) => editRoleIds.includes(r.id))
        .map((r) => ({ id: r.id, code: r.code, name: r.name }))

      setEmployee((prev) => (prev ? { ...prev, roles } : prev))
      setRolesDialogOpen(false)
    } catch (e) {
      console.error(e)
      alert("Error inesperado al guardar roles.")
    } finally {
      setRolesSaving(false)
    }
  }

  // -------------------- UI states --------------------

  if (!id) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-[60vh] text-sm text-slate-500">
          ID de empleado inválido.
        </div>
      </AdminLayout>
    )
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-[60vh] text-sm text-slate-500">
          Cargando empleado...
        </div>
      </AdminLayout>
    )
  }

  if (error || !employee) {
    return (
      <AdminLayout>
        <div className="max-w-xl mx-auto mt-10 space-y-4 text-center">
          <div className="flex justify-center">
            <AlertCircle className="w-10 h-10 text-red-500" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">
            Error al cargar el empleado
          </h1>
          <p className="text-sm text-slate-600">
            {error ?? "Empleado no encontrado."}
          </p>
          <Button
            className="mt-4"
            onClick={() => router.push("/admin/employees")}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver a empleados
          </Button>
        </div>
      </AdminLayout>
    )
  }

  const sortedRoles = sortRolesWithPriority(employee.roles)
  const primaryRoleLabel = getPrimaryRoleLabelFromSorted(sortedRoles)
  const salaryDifference = employee.real_salary - employee.base_salary

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin/employees">
              <Button variant="ghost" size="icon" aria-label="Volver">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>

            <div>
              <h1 className="text-3xl font-bold text-slate-900">
                {employee.name}
              </h1>
              <p className="text-slate-600 mt-1">{primaryRoleLabel}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Dialog open={editOpen} onOpenChange={handleOpenChange}>
              <DialogTrigger asChild>
                <Button>
                  <Edit className="w-4 h-4 mr-2" />
                  Editar perfil
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle>Editar empleado</DialogTitle>
                  <DialogDescription>
                    Actualiza la información general del empleado.
                  </DialogDescription>
                </DialogHeader>

                {editForm && (
                  <div className="space-y-6 py-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="full_name">Nombre completo</Label>
                        <Input
                          id="full_name"
                          value={editForm.full_name}
                          onChange={(e) =>
                            handleEditChange("full_name", e.target.value)
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="email">Correo</Label>
                        <Input
                          id="email"
                          type="email"
                          value={editForm.email}
                          onChange={(e) =>
                            handleEditChange("email", e.target.value)
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="phone">Teléfono</Label>
                        <Input
                          id="phone"
                          value={editForm.phone}
                          onChange={(e) =>
                            handleEditChange("phone", e.target.value)
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="hire_date">Fecha de contratación</Label>
                        <Input
                          id="hire_date"
                          type="date"
                          value={editForm.hire_date ?? ""}
                          onChange={(e) =>
                            handleEditChange("hire_date", e.target.value)
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Estatus</Label>
                        <Select
                          value={editForm.status}
                          onValueChange={(value) =>
                            handleEditChange(
                              "status",
                              value as EditEmployeeForm["status"],
                            )
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona un estatus" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Activo</SelectItem>
                            <SelectItem value="inactive">Inactivo</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="birth_date">Fecha de nacimiento</Label>
                        <Input
                          id="birth_date"
                          type="date"
                          value={editForm.birth_date ?? ""}
                          onChange={(e) =>
                            handleEditChange("birth_date", e.target.value)
                          }
                        />
                      </div>
                    </div>
                  </div>
                )}

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditOpen(false)}
                    disabled={saving}
                  >
                    Cancelar
                  </Button>
                  <Button type="button" onClick={handleSave} disabled={saving}>
                    {saving ? "Guardando..." : "Guardar cambios"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog
              open={deleteOpen}
              onOpenChange={(open) => {
                setDeleteOpen(open)
                if (!open) setDeleteConfirmText("")
              }}
            >
              <DialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Eliminar
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-xl">
                <DialogHeader>
                  <DialogTitle>Eliminar empleado</DialogTitle>
                  <DialogDescription>
                    Esta acción eliminará a <span className="font-semibold">{employee.name}</span> y
                    todos los registros relacionados que dependan de este empleado.
                    Esta acción no se puede deshacer.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    ¿Estás seguro de que deseas eliminar permanentemente a este empleado?
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="delete-confirm-input">
                      Para confirmar, escribe <span className="font-semibold">ELIMINAR</span>
                    </Label>
                    <Input
                      id="delete-confirm-input"
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      placeholder='Escribe "ELIMINAR"'
                      autoComplete="off"
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setDeleteOpen(false)
                      setDeleteConfirmText("")
                    }}
                    disabled={deleting}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleDeleteEmployee}
                    disabled={deleting || deleteConfirmText.trim().toUpperCase() !== "ELIMINAR"}
                  >
                    {deleting ? "Eliminando..." : "Sí, eliminar empleado"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Dialog open={rolesDialogOpen} onOpenChange={setRolesDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Modificar roles</DialogTitle>
              <DialogDescription>
                Agrega o elimina roles. Los roles seleccionados no aparecerán
                en el dropdown.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Agregar rol</Label>
                <Select value={rolePickerValue} onValueChange={(v) => addRole(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un rol..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRolesForPicker.length === 0 ? (
                      <SelectItem value="__empty__" disabled>
                        No hay más roles disponibles
                      </SelectItem>
                    ) : (
                      availableRolesForPicker.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Roles seleccionados</Label>

                {selectedRoleChips.length === 0 ? (
                  <p className="text-sm text-slate-600">
                    Aún no hay roles seleccionados.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {selectedRoleChips.map((r) => (
                      <span
                        key={r.id}
                        className="inline-flex items-center justify-between rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700"
                      >
                        <span className="truncate">{r.name}</span>
                        <button
                          type="button"
                          className="ml-2 rounded-full p-1 hover:bg-slate-100 flex-shrink-0"
                          onClick={() => removeRole(r.id)}
                          aria-label={`Quitar rol ${r.name}`}
                        >
                          <span className="text-slate-500 leading-none">×</span>
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRolesDialogOpen(false)}
                disabled={rolesSaving}
              >
                Cancelar
              </Button>
              <Button type="button" onClick={saveRoles} disabled={rolesSaving}>
                {rolesSaving ? "Guardando..." : "Guardar roles"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={salaryHistoryOpen}
          onOpenChange={async (open) => {
            setSalaryHistoryOpen(open)
            if (open) {
              await loadSalaryHistory()
            }
          }}
        >
          <DialogContent className="lg:!w-[calc(100vw-4rem)] lg:!max-w-6xl w-[calc(100vw-1.5rem)] sm:w-[calc(100vw-2rem)] max-w-6xl p-0 overflow-hidden">
            <div className="flex flex-col max-h-[85vh]">
              <div className="sticky top-0 z-10 bg-white px-6 pt-6 pb-4 border-b">
                <DialogHeader>
                  <DialogTitle>Historial salarial</DialogTitle>
                  <DialogDescription>
                    Consulta los cambios históricos de sueldos, bonificación y hora extra.
                  </DialogDescription>
                </DialogHeader>
              </div>

              <div className="px-6 py-5 overflow-y-auto">
                {salaryHistoryLoading ? (
                  <p className="text-sm text-slate-600">Cargando historial...</p>
                ) : salaryHistoryError ? (
                  <p className="text-sm text-red-500">{salaryHistoryError}</p>
                ) : salaryHistoryRows.length === 0 ? (
                  <p className="text-sm text-slate-600">
                    No hay registros de historial salarial.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1100px] text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-left">
                          <th className="py-3 pr-4 font-semibold text-slate-700">Vigencia</th>
                          <th className="py-3 pr-4 font-semibold text-slate-700">Sueldo real</th>
                          <th className="py-3 pr-4 font-semibold text-slate-700">Sueldo en nómina</th>
                          <th className="py-3 pr-4 font-semibold text-slate-700">Diferencia</th>
                          <th className="py-3 pr-4 font-semibold text-slate-700">Bonificación</th>
                          <th className="py-3 pr-4 font-semibold text-slate-700">Hora extra</th>
                          <th className="py-3 pr-4 font-semibold text-slate-700">Modificado por</th>
                          <th className="py-3 pr-0 font-semibold text-slate-700">Motivo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {salaryHistoryRows.map((row) => {
                          const diff = row.real_salary - row.payroll_salary

                          return (
                            <tr key={row.id} className="border-b border-slate-100 align-top">
                              <td className="py-3 pr-4 text-slate-700">
                                {formatHistoryRange(row.valid_from, row.valid_to)}
                              </td>
                              <td className="py-3 pr-4 font-medium text-slate-900">
                                {formatMoneyMXN(row.real_salary)}
                              </td>
                              <td className="py-3 pr-4 font-medium text-slate-900">
                                {formatMoneyMXN(row.payroll_salary)}
                              </td>
                              <td className="py-3 pr-4 font-medium text-slate-900">
                                {formatMoneyMXN(diff)}
                              </td>
                              <td className="py-3 pr-4 font-medium text-slate-900">
                                {formatMoneyMXN(row.bonus_amount)}
                              </td>
                              <td className="py-3 pr-4 font-medium text-slate-900">
                                {formatMoneyMXN(row.overtime_hour_cost)}
                              </td>
                              <td className="py-3 pr-4 text-slate-700">
                                {row.changed_by_name || "No registrado"}
                              </td>
                              <td className="py-3 pr-0 text-slate-700">
                                {row.change_reason || "Sin motivo"}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="sticky bottom-0 z-10 bg-white px-6 py-4 border-t">
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSalaryHistoryOpen(false)}
                  >
                    Cerrar
                  </Button>
                </DialogFooter>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 ">
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-24 h-24 rounded-full bg-blue-100 overflow-hidden flex items-center justify-center">
                  {profilePhotoUrl ? (
                    <img
                      src={profilePhotoUrl}
                      alt="Foto de perfil"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-3xl font-bold text-blue-600">
                      {employee.avatar}
                    </span>
                  )}
                </div>

                <div className="space-y-1 w-full">
                  <h3 className="font-semibold text-slate-900 text-xl">
                    {employee.name}
                  </h3>
                  <Badge className={getStatusColor(employee.statusUi)}>
                    {employee.statusUi}
                  </Badge>

                  <div className="mt-3 text-left">
                    {sortedRoles.length === 0 ? (
                      <p className="text-sm text-slate-600 text-center">
                        Sin roles asignados
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {sortedRoles.map((r) => (
                          <span
                            key={r.id}
                            className="
                              inline-flex items-center justify-between
                              rounded-full border border-slate-200 bg-white
                              px-3 py-1 text-xs text-slate-700
                              min-h-7
                            "
                          >
                            <span className="truncate">{r.name}</span>
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="mt-2 flex justify-center">
                      <button
                        type="button"
                        onClick={openRolesDialog}
                        className="
                          inline-flex items-center gap-2
                          text-xs text-slate-500
                          underline-offset-4
                          hover:text-slate-800 hover:underline
                          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2
                        "
                      >
                        <Edit className="w-3.5 h-3.5" />
                        Modificar roles
                      </button>
                    </div>
                  </div>
                </div>

                <div className="w-full space-y-3 pt-4 border-t text-left">
                  <div className="flex items-center gap-3 text-sm">
                    <Briefcase className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="text-slate-600">
                      Departamento no especificado
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="text-slate-600 break-all">
                      {employee.email ?? "Sin correo"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="text-slate-600">
                      {employee.phone ?? "Sin teléfono"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="text-slate-600">
                      Ubicación no especificada
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="text-slate-600">
                      Contratado: {formatDate(employee.joinDate)}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="lg:col-span-2">
            <Tabs defaultValue="overview" className="space-y-6">
              <TabsList>
                <TabsTrigger value="overview">Resumen</TabsTrigger>
                <TabsTrigger value="documents">Documentos</TabsTrigger>
                <TabsTrigger value="dc3">Carpeta DC3</TabsTrigger>
                <TabsTrigger value="projects">Obras</TabsTrigger>
              </TabsList>

              <TabsContent value="overview">
                <div className="grid grid-cols-1 gap-6">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <CardTitle>Salarios</CardTitle>

                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          className="bg-slate-900 hover:bg-slate-800 text-white"
                          onClick={async () => {
                            setSalaryHistoryOpen(true)
                            await loadSalaryHistory()
                          }}
                        >
                          <History className="w-4 h-4 mr-2" />
                          Historial
                        </Button>

                        <Dialog
                          open={payrollOpen}
                          onOpenChange={(open) => {
                            setPayrollOpen(open)
                            if (open) initEditFormFromEmployee()
                          }}
                        >
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm">
                              <Edit className="w-4 h-4 mr-2" />
                              Editar
                            </Button>
                          </DialogTrigger>

                          <DialogContent className="max-w-xl">
                            <DialogHeader>
                              <DialogTitle>Editar salarios</DialogTitle>
                              <DialogDescription>
                                Actualiza la información salarial del empleado.
                              </DialogDescription>
                            </DialogHeader>

                            {editForm && (
                              <div className="space-y-4 py-2">
                                <div className="space-y-2">
                                  <Label htmlFor="real_salary">
                                    Sueldo real (MXN)
                                  </Label>
                                  <Input
                                    id="real_salary"
                                    type="number"
                                    step="0.01"
                                    value={editForm.real_salary}
                                    onChange={(e) =>
                                      handleEditChange("real_salary", e.target.value)
                                    }
                                  />
                                </div>

                                <div className="space-y-2">
                                  <Label htmlFor="payroll_salary">
                                    Sueldo en nómina (MXN)
                                  </Label>
                                  <Input
                                    id="payroll_salary"
                                    type="number"
                                    step="0.01"
                                    value={editForm.payroll_salary}
                                    onChange={(e) =>
                                      handleEditChange("payroll_salary", e.target.value)
                                    }
                                  />
                                </div>

                                <div className="space-y-2">
                                  <Label htmlFor="bonus_amount">
                                    Bonificación (MXN)
                                  </Label>
                                  <Input
                                    id="bonus_amount"
                                    type="number"
                                    step="0.01"
                                    value={editForm.bonus_amount}
                                    onChange={(e) =>
                                      handleEditChange("bonus_amount", e.target.value)
                                    }
                                  />
                                </div>

                                <div className="space-y-2">
                                  <Label htmlFor="overtime_hour_cost">
                                    Costo hora extra (MXN)
                                  </Label>
                                  <Input
                                    id="overtime_hour_cost"
                                    type="number"
                                    step="0.01"
                                    value={editForm.overtime_hour_cost}
                                    onChange={(e) =>
                                      handleEditChange(
                                        "overtime_hour_cost",
                                        e.target.value,
                                      )
                                    }
                                  />
                                </div>
                              </div>
                            )}

                            <DialogFooter>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => setPayrollOpen(false)}
                                disabled={saving}
                              >
                                Cancelar
                              </Button>
                              <Button
                                type="button"
                                onClick={handleSavePayroll}
                                disabled={saving}
                              >
                                {saving ? "Guardando..." : "Guardar cambios"}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </CardHeader>

                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div className="space-y-1">
                          <p className="text-slate-500">Sueldo real</p>
                          <p className="font-medium text-slate-900 text-2xl">
                            {formatMoneyMXN(employee.real_salary)}
                          </p>
                        </div>

                        <div className="space-y-1">
                          <p className="text-slate-500">Sueldo en nómina</p>
                          <p className="font-medium text-slate-900 text-xl">
                            {formatMoneyMXN(employee.base_salary)}
                          </p>
                        </div>

                        <div className="space-y-1">
                          <p className="text-slate-500">Diferencia de salarios</p>
                          <p className="font-medium text-slate-900 text-xl">
                            {formatMoneyMXN(salaryDifference)}
                          </p>
                        </div>

                        <div className="space-y-1">
                          <p className="text-slate-500">Bonificación</p>
                          <p className="font-medium text-slate-900 text-xl">
                            {formatMoneyMXN(employee.bonus_amount)}
                          </p>
                        </div>

                        <div className="space-y-1">
                          <p className="text-slate-500">Costo hora extra</p>
                          <p className="font-medium text-slate-900 text-xl">
                            {formatMoneyMXN(employee.overtime_hour_cost)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <CardTitle>Información laboral</CardTitle>

                      <Dialog
                        open={laborOpen}
                        onOpenChange={(open) => {
                          setLaborOpen(open)
                          if (open) initEditFormFromEmployee()
                        }}
                      >
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Edit className="w-4 h-4 mr-2" />
                            Editar
                          </Button>
                        </DialogTrigger>

                        <DialogContent className="max-w-xl">
                          <DialogHeader>
                            <DialogTitle>Editar información laboral</DialogTitle>
                            <DialogDescription>
                              Actualiza los datos laborales y de contacto del
                              empleado.
                            </DialogDescription>
                          </DialogHeader>

                          {editForm && (
                            <div className="space-y-4 py-2">
                              <div className="space-y-2">
                                <Label htmlFor="imss_number">Número IMSS</Label>
                                <Input
                                  id="imss_number"
                                  value={editForm.imss_number}
                                  onChange={(e) =>
                                    handleEditChange("imss_number", e.target.value)
                                  }
                                />
                              </div>

                              <div className="space-y-2">
                                <Label htmlFor="rfc">RFC</Label>
                                <Input
                                  id="rfc"
                                  value={editForm.rfc}
                                  onChange={(e) =>
                                    handleEditChange("rfc", e.target.value)
                                  }
                                />
                              </div>

                              <div className="space-y-2">
                                <Label htmlFor="emergency_contact">
                                  Contacto de emergencia
                                </Label>
                                <Input
                                  id="emergency_contact"
                                  value={editForm.emergency_contact}
                                  onChange={(e) =>
                                    handleEditChange(
                                      "emergency_contact",
                                      e.target.value,
                                    )
                                  }
                                />
                              </div>
                            </div>
                          )}

                          <DialogFooter>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setLaborOpen(false)}
                              disabled={saving}
                            >
                              Cancelar
                            </Button>
                            <Button
                              type="button"
                              onClick={async () => {
                                await handleSave()
                                setLaborOpen(false)
                              }}
                              disabled={saving}
                            >
                              {saving ? "Guardando..." : "Guardar cambios"}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </CardHeader>

                    <CardContent>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="space-y-1">
                          <p className="text-slate-500">Número IMSS</p>
                          <p className="font-medium text-slate-900">
                            {employee.imss_number ?? "No registrado"}
                          </p>
                        </div>

                        <div className="space-y-1">
                          <p className="text-slate-500">RFC</p>
                          <p className="font-medium text-slate-900">
                            {employee.rfc ?? "No registrado"}
                          </p>
                        </div>

                        <div className="space-y-1">
                          <p className="text-slate-500">Contacto de emergencia</p>
                          <p className="font-medium text-slate-900">
                            {employee.emergency_contact ?? "No especificado"}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="documents">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Documentos del empleado</CardTitle>

                    <Dialog open={docsDialogOpen} onOpenChange={setDocsDialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline">
                          <Edit className="w-4 h-4 mr-2" />
                          Editar
                        </Button>
                      </DialogTrigger>

                      <DialogContent className="lg:!w-[calc(100vw-4rem)] lg:!max-w-6xl w-[calc(100vw-1.5rem)] sm:w-[calc(100vw-2rem)] max-w-6xl p-0 overflow-hidden">
                        <div className="flex flex-col max-h-[85vh]">
                          <div className="sticky top-0 z-10 bg-white px-6 pt-6 pb-4 border-b">
                            <DialogHeader>
                              <DialogTitle>Editar documentos</DialogTitle>
                              <DialogDescription>
                                Sube, reemplaza o elimina documentos del
                                empleado. Los cambios se guardan en Storage y en
                                la DB.
                              </DialogDescription>
                            </DialogHeader>
                          </div>

                          <div className="px-6 py-5 overflow-y-auto">
                            <div className="space-y-6">
                              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                {REQUIRED_DOCS.map((docType) => {
                                  const existing = docsMap.get(docType)
                                  return (
                                    <div
                                      key={docType}
                                      className="border border-slate-200 rounded-lg p-4 space-y-3"
                                    >
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="space-y-1">
                                          <p className="text-sm font-medium text-slate-900">
                                            {DOC_LABELS[docType]}
                                          </p>
                                          <p className="text-xs text-slate-500">
                                            {existing ? (
                                              <>
                                                Subido:{" "}
                                                <span className="font-medium">
                                                  {existing.file_name ?? "Archivo"}
                                                </span>
                                              </>
                                            ) : (
                                              "No subido"
                                            )}
                                          </p>
                                        </div>

                                        {existing ? (
                                          <Badge className="bg-green-100 text-green-700">
                                            Listo
                                          </Badge>
                                        ) : (
                                          <Badge className="bg-slate-100 text-slate-700">
                                            Pendiente
                                          </Badge>
                                        )}
                                      </div>

                                      <div className="space-y-2">
                                        <Label>Seleccionar archivo</Label>
                                        <Input
                                          type="file"
                                          accept=".pdf,image/*"
                                          onChange={(e) => {
                                            const file = e.target.files?.[0] ?? null
                                            handleChangeDocFile(docType, file)
                                          }}
                                        />
                                        {docFiles[docType] ? (
                                          <p className="text-xs text-slate-600 truncate">
                                            Nuevo: {docFiles[docType]?.name}
                                          </p>
                                        ) : (
                                          <p className="text-xs text-slate-400">
                                            Sin cambios
                                          </p>
                                        )}
                                      </div>

                                      <div className="flex items-center justify-end gap-2">
                                        <Button
                                          type="button"
                                          variant="destructive"
                                          disabled={!existing || docsSaving}
                                          onClick={async () => {
                                            const ok = confirm(
                                              `¿Eliminar "${DOC_LABELS[docType]}"?`,
                                            )
                                            if (!ok) return
                                            try {
                                              setDocsSaving(true)
                                              await deleteDoc(docType)
                                              await fetchDocuments()
                                            } catch (err: any) {
                                              console.error(err)
                                              alert(
                                                err?.message ||
                                                  "No se pudo eliminar el documento.",
                                              )
                                            } finally {
                                              setDocsSaving(false)
                                            }
                                          }}
                                        >
                                          <Trash2 className="w-4 h-4 mr-2" />
                                          Eliminar
                                        </Button>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>

                              <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="space-y-1">
                                    <p className="text-sm font-medium text-slate-900">
                                      Foto de perfil
                                    </p>
                                    <p className="text-xs text-slate-500">
                                      {profilePhotoUrl ? "Subida" : "No subida"}
                                    </p>
                                  </div>

                                  {profilePhotoUrl ? (
                                    <Badge className="bg-green-100 text-green-700">
                                      Listo
                                    </Badge>
                                  ) : (
                                    <Badge className="bg-slate-100 text-slate-700">
                                      Pendiente
                                    </Badge>
                                  )}
                                </div>

                                <div className="space-y-2">
                                  <Label>Seleccionar imagen</Label>
                                  <Input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0] ?? null
                                      handleChangeDocFile("profile_photo", file)
                                    }}
                                  />
                                  {docFiles.profile_photo ? (
                                    <p className="text-xs text-slate-600 truncate">
                                      Nuevo: {docFiles.profile_photo.name}
                                    </p>
                                  ) : (
                                    <p className="text-xs text-slate-400">
                                      Sin cambios
                                    </p>
                                  )}
                                </div>

                                <div className="flex items-center justify-end">
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    disabled={!profilePhotoUrl || docsSaving}
                                    onClick={async () => {
                                      const ok = confirm(
                                        "¿Eliminar la foto de perfil?",
                                      )
                                      if (!ok) return
                                      try {
                                        setDocsSaving(true)
                                        await deleteDoc("profile_photo")
                                        await fetchDocuments()
                                      } catch (err: any) {
                                        console.error(err)
                                        alert(
                                          err?.message ||
                                            "No se pudo eliminar la foto.",
                                        )
                                      } finally {
                                        setDocsSaving(false)
                                      }
                                    }}
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Eliminar foto
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="sticky bottom-0 z-10 bg-white px-6 py-4 border-t">
                            <DialogFooter className="gap-2 sm:gap-3">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => setDocsDialogOpen(false)}
                                disabled={docsSaving}
                              >
                                Cancelar
                              </Button>
                              <Button
                                type="button"
                                onClick={handleSaveDocuments}
                                disabled={docsSaving}
                              >
                                {docsSaving ? "Guardando..." : "Guardar documentos"}
                              </Button>
                            </DialogFooter>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </CardHeader>

                  <CardContent>
                    {docsLoading ? (
                      <p className="text-sm text-slate-600">
                        Cargando documentos...
                      </p>
                    ) : docsError ? (
                      <p className="text-sm text-red-500">{docsError}</p>
                    ) : (
                      <div className="space-y-4">
                        {REQUIRED_DOCS.map((docType) => {
                          const doc = docsMap.get(docType)
                          const signedUrl = docSignedUrls[docType]
                          const isReady = !!doc
                          const isPdf = normalizeMimeIsPdf(doc?.mime_type ?? null)

                          return (
                            <div
                              key={docType}
                              className="flex items-center justify-between p-4 border border-slate-200 rounded-lg"
                            >
                              <div className="flex items-start gap-3 flex-1">
                                <FileText className="w-5 h-5 text-slate-600 mt-0.5" />
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-medium text-slate-900">
                                      {DOC_LABELS[docType]}
                                    </h4>
                                    {isReady ? (
                                      <Badge className="bg-green-100 text-green-700">
                                        Subido
                                      </Badge>
                                    ) : (
                                      <Badge className="bg-slate-100 text-slate-700">
                                        Pendiente
                                      </Badge>
                                    )}
                                  </div>

                                  <p className="text-xs text-slate-500 mt-1">
                                    {doc ? (
                                      <>
                                        Archivo:{" "}
                                        <span className="font-medium">
                                          {doc.file_name ?? "Archivo"}
                                        </span>
                                        {doc.file_size ? (
                                          <span className="ml-2">
                                            • {Math.round(doc.file_size / 1024)} KB
                                          </span>
                                        ) : null}
                                      </>
                                    ) : (
                                      "Aún no se ha subido este documento."
                                    )}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  disabled={!isReady || !signedUrl}
                                  onClick={() =>
                                    signedUrl &&
                                    window.open(
                                      signedUrl,
                                      "_blank",
                                      "noopener,noreferrer",
                                    )
                                  }
                                >
                                  <Eye className="w-4 h-4 mr-2" />
                                  {isPdf ? "Ver" : "Abrir"}
                                </Button>

                                <Button
                                  type="button"
                                  variant="outline"
                                  disabled={!isReady || !signedUrl}
                                  onClick={() => {
                                    if (!signedUrl) return
                                    const a = document.createElement("a")
                                    a.href = signedUrl
                                    a.download = doc?.file_name || "documento"
                                    document.body.appendChild(a)
                                    a.click()
                                    a.remove()
                                  }}
                                >
                                  <Download className="w-4 h-4 mr-2" />
                                  Descargar
                                </Button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="dc3">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FolderOpen className="w-5 h-5 text-slate-700" />
                      <CardTitle>Carpeta DC3</CardTitle>
                    </div>

                    <Dialog open={dc3DialogOpen} onOpenChange={setDc3DialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline">
                          <Plus className="w-4 h-4 mr-2" />
                          Agregar archivos
                        </Button>
                      </DialogTrigger>

                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>
                            Agregar documentos a Carpeta DC3
                          </DialogTitle>
                          <DialogDescription>
                            Sube permisos, licencias u otros documentos
                            adicionales del empleado.
                          </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-2">
                          <div className="space-y-2">
                            <Label>Seleccionar archivos</Label>
                            <Input
                              type="file"
                              multiple
                              accept=".pdf,image/*"
                              onChange={(e) =>
                                handleChangeDc3Files(e.target.files)
                              }
                            />
                          </div>

                          {dc3Files.length > 0 ? (
                            <div className="space-y-2">
                              <p className="text-sm font-medium text-slate-900">
                                Archivos seleccionados
                              </p>
                              <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-3">
                                {dc3Files.map((file, index) => (
                                  <div
                                    key={`${file.name}-${index}`}
                                    className="flex items-center justify-between text-sm text-slate-700"
                                  >
                                    <span className="truncate">{file.name}</span>
                                    <span className="text-xs text-slate-400 ml-3">
                                      {Math.round(file.size / 1024)} KB
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm text-slate-500">
                              No hay archivos seleccionados.
                            </p>
                          )}
                        </div>

                        <DialogFooter>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setDc3DialogOpen(false)}
                            disabled={dc3Saving}
                          >
                            Cancelar
                          </Button>
                          <Button
                            type="button"
                            onClick={handleSaveDc3Documents}
                            disabled={dc3Saving}
                          >
                            {dc3Saving ? "Guardando..." : "Guardar archivos"}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </CardHeader>

                  <CardContent>
                    {dc3Loading ? (
                      <p className="text-sm text-slate-600">
                        Cargando carpeta DC3...
                      </p>
                    ) : dc3Error ? (
                      <p className="text-sm text-red-500">{dc3Error}</p>
                    ) : dc3Documents.length === 0 ? (
                      <p className="text-sm text-slate-600">
                        Esta carpeta aún no tiene documentos cargados.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {dc3Documents.map((doc) => {
                          const signedUrl = dc3SignedUrls[doc.id]
                          const isPdf = normalizeMimeIsPdf(doc.mime_type)

                          return (
                            <div
                              key={doc.id}
                              className="flex items-center justify-between p-4 border border-slate-200 rounded-lg"
                            >
                              <div className="flex items-start gap-3 flex-1">
                                <FileText className="w-5 h-5 text-slate-600 mt-0.5" />
                                <div className="flex-1">
                                  <h4 className="font-medium text-slate-900">
                                    {doc.file_name ?? "Archivo sin nombre"}
                                  </h4>

                                  <p className="text-xs text-slate-500 mt-1">
                                    {doc.file_size ? (
                                      <span>
                                        {Math.round(doc.file_size / 1024)} KB
                                      </span>
                                    ) : (
                                      <span>Tamaño no disponible</span>
                                    )}
                                    {doc.created_at ? (
                                      <span className="ml-2">
                                        • {formatDate(doc.created_at)}
                                      </span>
                                    ) : null}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  disabled={!signedUrl}
                                  onClick={() => {
                                    if (!signedUrl) return
                                    window.open(
                                      signedUrl,
                                      "_blank",
                                      "noopener,noreferrer",
                                    )
                                  }}
                                >
                                  <Eye className="w-4 h-4 mr-2" />
                                  {isPdf ? "Ver" : "Abrir"}
                                </Button>

                                <Button
                                  type="button"
                                  variant="outline"
                                  disabled={!signedUrl}
                                  onClick={() => {
                                    if (!signedUrl) return
                                    const a = document.createElement("a")
                                    a.href = signedUrl
                                    a.download = doc.file_name || "documento-dc3"
                                    document.body.appendChild(a)
                                    a.click()
                                    a.remove()
                                  }}
                                >
                                  <Download className="w-4 h-4 mr-2" />
                                  Descargar
                                </Button>

                                <Button
                                  type="button"
                                  variant="destructive"
                                  onClick={async () => {
                                    const ok = confirm(
                                      `¿Eliminar "${doc.file_name ?? "este archivo"}"?`,
                                    )
                                    if (!ok) return

                                    try {
                                      await deleteDc3File(doc.id)
                                      await fetchDc3Documents()
                                    } catch (e: any) {
                                      console.error(e)
                                      alert(
                                        e?.message ||
                                          "No se pudo eliminar el archivo.",
                                      )
                                    }
                                  }}
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  Eliminar
                                </Button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="projects">
                <Card>
                  <CardHeader>
                    <CardTitle>Obras asignadas</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {projects.length === 0 ? (
                      <p className="text-sm text-slate-600">
                        Este empleado no tiene obras activas asignadas.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {projects.map((project) => (
                          <div
                            key={project.obraId}
                            className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:border-blue-300 transition-colors"
                          >
                            <div className="flex items-start gap-3 flex-1">
                              <Building2 className="w-5 h-5 text-blue-600 mt-1" />
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-medium text-slate-900">
                                    {project.name}
                                  </h4>
                                  {project.status && (
                                    <Badge
                                      className={getObraStatusColor(
                                        project.status,
                                      )}
                                    >
                                      {formatObraStatus(project.status)}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-slate-500 mt-1">
                                  ID: {project.obraId}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}