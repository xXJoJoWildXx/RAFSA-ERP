"use client"

// Página de detalle de empleado, con tabs para perfil, documentos, DC3, historial salarial, datos bancarios, etc.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"

import { AdminLayout } from "@/components/admin-layout"
import { RoleGuard } from "@/lib/role-guard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
// Card components unused after dark mode refactor — keeping import for stability
// import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  Phone,
  Calendar,
  Clock,
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
  Landmark,
  CreditCard,
  Wallet,
  X,
  LayoutDashboard,
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
  termination_date: string | null
  photo_url: string | null
  imss_number: string | null
  rfc: string | null
  birth_date: string | null
  real_salary: number | string
  bonus_amount: number | string
  overtime_hour_cost: number | string
  viatics_amount: number | string
  bank_name: string | null
  account_number: string | null
  interbank_clabe: string | null
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
  terminationDate: string | null
  avatar: string
  imss_number: string | null
  rfc: string | null
  birth_date: string | null
  real_salary: number
  bonus_amount: number
  overtime_hour_cost: number
  viatics_amount: number
  bank_name: string | null
  account_number: string | null
  interbank_clabe: string | null
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
  termination_date: string
  birth_date: string
  imss_number: string
  rfc: string
  emergency_contact: string
  real_salary: string
  bonus_amount: string
  overtime_hour_cost: string
  viatics_amount: string
}

type BankingForm = {
  bank_name: string
  account_number: string
  interbank_clabe: string
}

// -------------------- Historial salarial --------------------

type EmployeeSalaryHistoryRow = {
  id: string
  employee_id: string
  real_salary: number
  bonus_amount: number
  overtime_hour_cost: number
  viatics_amount: number
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

// -------------------- Documentos de Obra --------------------

type WorkFolderType = "dc3" | "medical_reports"

type WorkDocumentRow = {
  id: string
  employee_id: string
  folder_type: WorkFolderType
  storage_bucket: string
  storage_path: string
  file_name: string | null
  mime_type: string | null
  file_size: number | null
  created_at?: string
  updated_at?: string
}

type EmployeeWorkDocumentsApiResponse = {
  documents: WorkDocumentRow[]
  signed_urls?: Record<string, string>
}

// -------------------- Banking API --------------------

type EmployeeBankingApiResponse = {
  ok: boolean
  bank_name: string | null
  account_number: string | null
  interbank_clabe: string | null
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
      return "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
    case "De permiso":
      return "bg-yellow-500/15 text-yellow-400 border border-yellow-500/25"
    case "Inactivo":
      return "bg-slate-500/15 text-slate-400 border border-slate-500/25"
    default:
      return "bg-slate-500/15 text-slate-400 border border-slate-500/25"
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

  // Parsear manualmente para evitar problemas de zona horaria
  // Si es formato YYYY-MM-DD, crear date sin convertir a UTC
  const parts = dateString.split("T")[0]?.split("-")
  if (parts && parts.length === 3) {
    const [year, month, day] = parts.map(Number)
    const d = new Date(year, month - 1, day)
    return d.toLocaleDateString("es-MX", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    })
  }

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

function calculateAge(birthDate: string | null) {
  if (!birthDate) return null

  const parts = birthDate.split("T")[0]?.split("-")
  if (!parts || parts.length !== 3) return null

  const [year, month, day] = parts.map(Number)
  const birth = new Date(year, month - 1, day)

  if (Number.isNaN(birth.getTime())) return null

  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()

  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birth.getDate())
  ) {
    age--
  }

  return age >= 0 ? age : null
}

function calculateTenure(hireDate: string | null): string {
  if (!hireDate) return "No especificado"
  const parts = hireDate.split("T")[0]?.split("-")
  if (!parts || parts.length !== 3) return "No especificado"
  const [year, month, day] = parts.map(Number)
  const hire = new Date(year, month - 1, day)
  if (Number.isNaN(hire.getTime())) return "No especificado"
  const today = new Date()
  let years = today.getFullYear() - hire.getFullYear()
  let months = today.getMonth() - hire.getMonth()
  let days = today.getDate() - hire.getDate()
  if (days < 0) {
    months--
    days += new Date(today.getFullYear(), today.getMonth(), 0).getDate()
  }
  if (months < 0) { years--; months += 12 }
  const segs: string[] = []
  if (years > 0) segs.push(`${years} ${years === 1 ? "año" : "años"}`)
  if (months > 0) segs.push(`${months} ${months === 1 ? "mes" : "meses"}`)
  if (days > 0 || segs.length === 0) segs.push(`${days} ${days === 1 ? "día" : "días"}`)
  return segs.join(", ")
}

function mapRowToDetail(row: EmployeeRow): EmployeeDetail {
  const statusUi = mapDbStatusToUi(row.status)
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
  const viatics =
    row.viatics_amount !== null && row.viatics_amount !== undefined
      ? Number(row.viatics_amount)
      : 0

  return {
    id: row.id,
    name: row.full_name,
    email: row.email,
    phone: row.phone,
    statusUi,
    statusRaw: row.status,
    joinDate: row.hire_date ?? null,
    terminationDate: row.termination_date ?? null,
    avatar: makeAvatarInitials(row.full_name),
    imss_number: row.imss_number,
    rfc: row.rfc,
    birth_date: row.birth_date,
    real_salary: realSalary,
    bonus_amount: bonusAmount,
    overtime_hour_cost: overtime,
    viatics_amount: viatics,
    bank_name: row.bank_name ?? null,
    account_number: row.account_number ?? null,
    interbank_clabe: row.interbank_clabe ?? null,
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
      return "bg-slate-500/15 text-slate-400 border border-slate-500/25"
    case "in_progress":
      return "bg-[#0174bd]/15 text-[#4da8e8] border border-[#0174bd]/25"
    case "paused":
      return "bg-yellow-500/15 text-yellow-400 border border-yellow-500/25"
    case "closed":
      return "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
    default:
      return "bg-slate-500/15 text-slate-400 border border-slate-500/25"
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
  bonus_amount: number
  overtime_hour_cost: number
  viatics_amount: number
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

async function fetchEmployeeBanking(employeeId: string) {
  const res = await fetch(
    `/api/employee-banking?employeeId=${encodeURIComponent(employeeId)}`,
    {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    },
  )

  const json = await res.json().catch(() => null)

  if (!res.ok) {
    throw new Error(json?.error || "No se pudieron cargar los datos bancarios.")
  }

  return json as EmployeeBankingApiResponse
}

async function saveEmployeeBanking(args: {
  employeeId: string
  bank_name: string | null
  account_number: string | null
  interbank_clabe: string | null
}) {
  const res = await fetch("/api/employee-banking", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  })

  const json = await res.json().catch(() => null)

  if (!res.ok) {
    throw new Error(json?.error || "No se pudieron guardar los datos bancarios.")
  }

  return json as {
    ok: boolean
    banking: {
      bank_name: string
      account_number: string
      interbank_clabe: string
    }
  }
}

// ------------------ Helpers para Documentos de Obra ------------------

async function createWorkDocumentSignedUpload(args: {
  employeeId: string
  fileName: string
  folderType: WorkFolderType
}) {
  const res = await fetch("/api/employee-work-documents-upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  })

  const json = await res.json().catch(() => null)

  if (!res.ok) {
    throw new Error(json?.error || "No se pudo preparar la subida del archivo.")
  }

  return json as {
    bucket: string
    path: string
    token: string
    signedUrl?: string | null
    folderType: WorkFolderType
  }
}

async function saveWorkDocumentMetadata(args: {
  employeeId: string
  folderType: WorkFolderType
  storagePath: string
  fileName: string
  mimeType: string | null
  fileSize: number | null
}) {
  const res = await fetch("/api/employee-work-documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  })

  const json = await res.json().catch(() => null)

  if (!res.ok) {
    throw new Error(json?.error || "No se pudo guardar la metadata del archivo.")
  }

  return json
}

async function deleteWorkDocumentApi(documentId: string) {
  const res = await fetch("/api/employee-work-documents", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentId }),
  })

  const json = await res.json().catch(() => null)

  if (!res.ok) {
    throw new Error(json?.error || "No se pudo eliminar el archivo.")
  }

  return json
}

// ------------------ Helpers para la Bucket ------------------

const BUCKET_EMPLOYEE_DOCS = "employee-documents"

function safeFileExt(fileName: string) {
  const parts = fileName.split(".")
  if (parts.length <= 1) return ""
  const ext = parts[parts.length - 1]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
  return ext ? `.${ext}` : ""
}

function sanitizeFileBaseName(fileName: string) {
  const base = fileName.replace(/\.[^/.]+$/, "")
  return (
    base
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-_]/g, "")
      .slice(0, 60) || "archivo"
  )
}

function buildEmployeeDocPath(employeeId: string, docType: EmployeeDocType, file: File) {
  const ts = Date.now()
  const ext = safeFileExt(file.name)
  const base = sanitizeFileBaseName(file.name)
  return `employees/${employeeId}/${docType}/${ts}-${base}${ext}`
}

async function uploadEmployeeDocDirect(args: {
  employeeId: string
  docType: EmployeeDocType
  file: File
}) {
  const { employeeId, docType, file } = args
  const path = buildEmployeeDocPath(employeeId, docType, file)

  const { error } = await supabase.storage
    .from(BUCKET_EMPLOYEE_DOCS)
    .upload(path, file, {
      upsert: false,
      contentType: file.type || "application/octet-stream",
    })

  if (error) {
    throw error
  }

  return {
    storage_bucket: BUCKET_EMPLOYEE_DOCS,
    storage_path: path,
    file_name: file.name || null,
    mime_type: file.type || null,
    file_size: file.size ?? null,
  }
}

async function forceDownloadFile(signedUrl: string, fileName: string) {
  const response = await fetch(signedUrl)

  if (!response.ok) {
    throw new Error("No se pudo descargar el archivo.")
  }

  const blob = await response.blob()
  const objectUrl = window.URL.createObjectURL(blob)

  const link = document.createElement("a")
  link.href = objectUrl
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()

  window.URL.revokeObjectURL(objectUrl)
}

// -------------------- Shared class constants --------------------

const inputCls =
  "bg-slate-900 border-slate-700 text-slate-200 placeholder:text-slate-500 focus:border-[#0174bd]/60 focus-visible:ring-0 focus-visible:ring-offset-0"

// wrapper div class — handles the neon border hover
const fileWrapCls =
  "rounded-md border border-slate-700 transition-all duration-200" +
  " hover:border-[#38bdf8]/70 hover:shadow-[0_0_0_2px_rgba(56,189,248,0.15),0_0_10px_rgba(56,189,248,0.12)]"

// input inside the wrapper — no border so the wrapper border shows
const fileInputCls =
  "w-full bg-slate-900 text-slate-200 rounded-md cursor-pointer" +
  " border-0 outline-none focus-visible:ring-0 focus-visible:ring-offset-0" +
  " file:bg-transparent file:border-0 file:border-r file:border-slate-700 file:pr-3 file:mr-3" +
  " file:text-[#0174bd] file:font-medium file:cursor-pointer" +
  " hover:file:text-[#38bdf8] hover:file:drop-shadow-[0_0_5px_rgba(56,189,248,0.7)]"

const selectTriggerCls =
  "bg-slate-900 border-slate-700 text-slate-200 focus:ring-0 focus:border-[#0174bd]/60 focus-visible:ring-0 focus-visible:ring-offset-0"

const selectContentCls =
  "bg-slate-800 border-slate-700 text-slate-200 [&_[role=option]]:text-slate-200 [&_[role=option]:hover]:bg-slate-700 [&_[role=option][data-highlighted]]:bg-slate-700"

const btnOutlineCls =
  "border-slate-700 text-slate-400 hover:bg-slate-700/60 hover:text-slate-200"

const labelCls = "text-slate-300"

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
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false)

  const [documents, setDocuments] = useState<EmployeeDocumentRow[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [docsError, setDocsError] = useState<string | null>(null)

  const [dc3Documents, setDc3Documents] = useState<WorkDocumentRow[]>([])
  const [dc3SignedUrls, setDc3SignedUrls] = useState<Record<string, string>>({})
  const [dc3Loading, setDc3Loading] = useState(false)
  const [dc3Error, setDc3Error] = useState<string | null>(null)
  const [dc3DialogOpen, setDc3DialogOpen] = useState(false)
  const [dc3Saving, setDc3Saving] = useState(false)
  const [dc3Files, setDc3Files] = useState<File[]>([])

  const [medicalDocuments, setMedicalDocuments] = useState<WorkDocumentRow[]>([])
  const [medicalSignedUrls, setMedicalSignedUrls] = useState<Record<string, string>>({})
  const [medicalLoading, setMedicalLoading] = useState(false)
  const [medicalError, setMedicalError] = useState<string | null>(null)
  const [medicalDialogOpen, setMedicalDialogOpen] = useState(false)
  const [medicalSaving, setMedicalSaving] = useState(false)
  const [medicalFiles, setMedicalFiles] = useState<File[]>([])

  const [fileViewer, setFileViewer] = useState<{ url: string; name: string; isPdf: boolean } | null>(null)

  const [editOpen, setEditOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editForm, setEditForm] = useState<EditEmployeeForm | null>(null)

  const [laborOpen, setLaborOpen] = useState(false)
  const [payrollOpen, setPayrollOpen] = useState(false)

  const [salaryHistoryOpen, setSalaryHistoryOpen] = useState(false)
  const [salaryHistoryLoading, setSalaryHistoryLoading] = useState(false)
  const [salaryHistoryError, setSalaryHistoryError] = useState<string | null>(null)
  const [salaryHistoryRows, setSalaryHistoryRows] = useState<EmployeeSalaryHistoryRow[]>([])
  const [currentAuthUserId, setCurrentAuthUserId] = useState<string | null>(null)

  const [bankingOpen, setBankingOpen] = useState(false)
  const [bankingLoading, setBankingLoading] = useState(false)
  const [bankingSaving, setBankingSaving] = useState(false)
  const [bankingForm, setBankingForm] = useState<BankingForm>({
    bank_name: "",
    account_number: "",
    interbank_clabe: "",
  })

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState("")

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

  const [rolesCatalog, setRolesCatalog] = useState<RoleCatalogRow[]>([])
  const [rolesDialogOpen, setRolesDialogOpen] = useState(false)
  const [rolesSaving, setRolesSaving] = useState(false)

  const [editRoleIds, setEditRoleIds] = useState<string[]>([])
  const [rolePickerValue, setRolePickerValue] = useState<string>("")

  // ── Sliding tab pill ──
  const [activeTab, setActiveTab] = useState("overview")
  const navRef = useRef<HTMLDivElement>(null)
  const pillReady = useRef(false)

  const employeeTabs = [
    { value: "overview",  label: "Resumen",    Icon: LayoutDashboard },
    { value: "banking",   label: "Bancario",   Icon: Landmark        },
    { value: "documents", label: "Documentos", Icon: FileText        },
    { value: "dc3",       label: "Docs. Obra", Icon: FolderOpen      },
    { value: "projects",  label: "Obras",      Icon: Building2       },
  ] as const

  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const pill  = nav.querySelector<HTMLElement>("[data-nav-pill]")
    const btn   = nav.querySelector<HTMLElement>(`[data-tab-btn="${activeTab}"]`)
    if (!pill || !btn) return
    const navRect = nav.getBoundingClientRect()
    const btnRect = btn.getBoundingClientRect()
    const left  = btnRect.left - navRect.left + nav.scrollLeft
    const width = btnRect.width
    if (!pillReady.current) {
      // First paint: place instantly, then enable transition
      pill.style.transition = "none"
      pill.style.left  = `${left}px`
      pill.style.width = `${width}px`
      pillReady.current = true
      requestAnimationFrame(() => {
        pill.style.transition =
          "left 0.3s cubic-bezier(0.4,0,0.2,1), width 0.3s cubic-bezier(0.4,0,0.2,1)"
      })
    } else {
      pill.style.left  = `${left}px`
      pill.style.width = `${width}px`
    }
  }, [activeTab])

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
            termination_date,
            photo_url,
            imss_number,
            rfc,
            birth_date,
            real_salary,
            bonus_amount,
            overtime_hour_cost,
            viatics_amount,
            bank_name,
            account_number,
            interbank_clabe,
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

        setBankingForm({
          bank_name: mapped.bank_name ?? "",
          account_number: mapped.account_number ?? "",
          interbank_clabe: mapped.interbank_clabe ?? "",
        })

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

  const fetchWorkDocuments = async (folderType: WorkFolderType) => {
    if (!id) return

    const setLoadingByFolder =
      folderType === "dc3" ? setDc3Loading : setMedicalLoading
    const setErrorByFolder =
      folderType === "dc3" ? setDc3Error : setMedicalError
    const setDocsByFolder =
      folderType === "dc3" ? setDc3Documents : setMedicalDocuments
    const setUrlsByFolder =
      folderType === "dc3" ? setDc3SignedUrls : setMedicalSignedUrls

    setLoadingByFolder(true)
    setErrorByFolder(null)

    try {
      const res = await fetch(
        `/api/employee-work-documents?employeeId=${encodeURIComponent(id)}&folderType=${folderType}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        },
      )

      if (!res.ok) {
        const text = await res.text().catch(() => "")
        throw new Error(
          text ||
            (folderType === "dc3"
              ? "No se pudo cargar la carpeta DC3."
              : "No se pudo cargar la carpeta de reportes médicos."),
        )
      }

      const json = (await res.json()) as EmployeeWorkDocumentsApiResponse
      setDocsByFolder(json.documents || [])
      setUrlsByFolder(json.signed_urls || {})
    } catch (e: any) {
      console.error(e)
      setErrorByFolder(
        e?.message ||
          (folderType === "dc3"
            ? "No se pudo cargar la carpeta DC3."
            : "No se pudo cargar la carpeta de reportes médicos."),
      )
      setDocsByFolder([])
      setUrlsByFolder({})
    } finally {
      setLoadingByFolder(false)
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

  const loadBanking = async () => {
    if (!id) return
    setBankingLoading(true)

    try {
      const res = await fetchEmployeeBanking(id)
      setBankingForm({
        bank_name: res.bank_name ?? "",
        account_number: res.account_number ?? "",
        interbank_clabe: res.interbank_clabe ?? "",
      })
    } catch (e: any) {
      console.error(e)
      alert(e?.message || "No se pudieron cargar los datos bancarios.")
    } finally {
      setBankingLoading(false)
    }
  }

  useEffect(() => {
    if (!id) return
    fetchDocuments()
    fetchWorkDocuments("dc3")
    fetchWorkDocuments("medical_reports")
  }, [id])

  const docsMap = useMemo(() => {
    const map = new Map<EmployeeDocType, EmployeeDocumentRow>()
    for (const d of documents) map.set(d.doc_type, d)
    return map
  }, [documents])

  const initEditFormFromEmployee = () => {
    if (!employee) return

    setEditForm({
      full_name: employee.name ?? "",
      email: employee.email ?? "",
      phone: employee.phone ?? "",
      status: mapUiStatusToDb(employee.statusUi),
      hire_date: employee.joinDate ?? "",
      termination_date: employee.terminationDate ?? "",
      birth_date: employee.birth_date ?? "",
      imss_number: employee.imss_number ?? "",
      rfc: employee.rfc ?? "",
      emergency_contact: employee.emergency_contact ?? "",
      real_salary: employee.real_salary?.toString() ?? "0",
      bonus_amount: employee.bonus_amount?.toString() ?? "0",
      overtime_hour_cost: employee.overtime_hour_cost?.toString() ?? "0",
      viatics_amount: employee.viatics_amount?.toString() ?? "0",
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
      termination_date: editForm.termination_date || null,
      birth_date: editForm.birth_date || null,
      imss_number: editForm.imss_number.trim() || null,
      rfc: editForm.rfc.trim() || null,
      emergency_contact: editForm.emergency_contact.trim() || null,
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
          termination_date,
          photo_url,
          imss_number,
          rfc,
          birth_date,
          real_salary,
          bonus_amount,
          overtime_hour_cost,
          viatics_amount,
          bank_name,
          account_number,
          interbank_clabe,
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
        bonus_amount: Number(editForm.bonus_amount) || 0,
        overtime_hour_cost: Number(editForm.overtime_hour_cost) || 0,
        viatics_amount: Number(editForm.viatics_amount) || 0,
        authUserId: currentAuthUserId,
        change_reason: null,
      })

      if (result?.employee) {
        const updatedRow = result.employee as EmployeeRow
        setEmployee((prev) => {
          const next = mapRowToDetail(updatedRow)
          next.roles = prev?.roles || []
          next.terminationDate =
            updatedRow.termination_date ?? prev?.terminationDate ?? null
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

  const handleSaveBanking = async () => {
    if (!id) return

    try {
      setBankingSaving(true)

      const res = await saveEmployeeBanking({
        employeeId: id,
        bank_name: bankingForm.bank_name.trim() || null,
        account_number: bankingForm.account_number.trim() || null,
        interbank_clabe: bankingForm.interbank_clabe.trim() || null,
      })

      setEmployee((prev) =>
        prev
          ? {
              ...prev,
              bank_name: res.banking.bank_name || null,
              account_number: res.banking.account_number || null,
              interbank_clabe: res.banking.interbank_clabe || null,
            }
          : prev,
      )

      setBankingForm({
        bank_name: res.banking.bank_name || "",
        account_number: res.banking.account_number || "",
        interbank_clabe: res.banking.interbank_clabe || "",
      })

      setBankingOpen(false)
    } catch (e: any) {
      console.error(e)
      alert(e?.message || "No se pudieron guardar los datos bancarios.")
    } finally {
      setBankingSaving(false)
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

  const handleChangeDocFile = (docType: EmployeeDocType, file: File | null) => {
    setDocFiles((prev) => ({ ...prev, [docType]: file }))
  }

  async function uploadOrReplaceDoc(docType: EmployeeDocType, file: File) {
    if (!id) return

    const existing = docsMap.get(docType)

    if (existing) {
      await deleteDoc(docType)
    }

    const uploaded = await uploadEmployeeDocDirect({
      employeeId: id,
      docType,
      file,
    })

    const payload = {
      employee_id: id,
      doc_type: docType,
      storage_bucket: uploaded.storage_bucket,
      storage_path: uploaded.storage_path,
      file_name: uploaded.file_name,
      mime_type: uploaded.mime_type,
      file_size: uploaded.file_size,
    }

    const { error: upsertErr } = await supabase
      .from("employee_documents")
      .upsert(payload, { onConflict: "employee_id,doc_type" })

    if (upsertErr) {
      throw upsertErr
    }

    if (docType === "profile_photo") {
      const { error: photoErr } = await supabase
        .from("employees")
        .update({ photo_url: uploaded.storage_path })
        .eq("id", id)

      if (photoErr) {
        throw photoErr
      }
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

      for (const [, file] of selected) {
        const maxMb = 25
        if (file.size > maxMb * 1024 * 1024) {
          throw new Error(
            `El archivo "${file.name}" excede el límite de ${maxMb} MB.`,
          )
        }
      }

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

  const handleChangeWorkFiles = (
    folderType: WorkFolderType,
    files: FileList | null,
  ) => {
    if (!files) return

    const selected = Array.from(files)

    if (folderType === "dc3") {
      setDc3Files(selected)
      return
    }

    setMedicalFiles(selected)
  }

  const uploadWorkFile = async (
    folderType: WorkFolderType,
    file: File,
  ) => {
    if (!id) return

    const maxMb = 25
    if (file.size > maxMb * 1024 * 1024) {
      throw new Error(`"${file.name}" excede el límite de ${maxMb} MB.`)
    }

    const prep = await createWorkDocumentSignedUpload({
      employeeId: id,
      fileName: file.name,
      folderType,
    })

    const { error: uploadError } = await supabase.storage
      .from(prep.bucket)
      .uploadToSignedUrl(prep.path, prep.token, file)

    if (uploadError) {
      throw uploadError
    }

    await saveWorkDocumentMetadata({
      employeeId: id,
      folderType,
      storagePath: prep.path,
      fileName: file.name,
      mimeType: file.type || null,
      fileSize: file.size ?? null,
    })
  }

  const deleteWorkDocumentByFolder = async (
    folderType: WorkFolderType,
    documentId: string,
  ) => {
    await deleteWorkDocumentApi(documentId)
    await fetchWorkDocuments(folderType)
  }

  const handleSaveWorkDocuments = async (folderType: WorkFolderType) => {
    if (!id) return

    const selectedFiles = folderType === "dc3" ? dc3Files : medicalFiles
    const setSavingByFolder = folderType === "dc3" ? setDc3Saving : setMedicalSaving
    const setDialogOpenByFolder =
      folderType === "dc3" ? setDc3DialogOpen : setMedicalDialogOpen
    const clearFilesByFolder =
      folderType === "dc3" ? () => setDc3Files([]) : () => setMedicalFiles([])

    if (selectedFiles.length === 0) {
      setDialogOpenByFolder(false)
      return
    }

    setSavingByFolder(true)

    try {
      for (const file of selectedFiles) {
        await uploadWorkFile(folderType, file)
      }

      await fetchWorkDocuments(folderType)
      clearFilesByFolder()
      setDialogOpenByFolder(false)
    } catch (e: any) {
      console.error(e)
      alert(
        e?.message ||
          (folderType === "dc3"
            ? "Hubo un error guardando los documentos de la carpeta DC3."
            : "Hubo un error guardando los documentos de la carpeta de reportes médicos."),
      )
    } finally {
      setSavingByFolder(false)
    }
  }

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

  if (!id) {
    return (
      <RoleGuard allowed={["admin"]}>
        <AdminLayout>
          <div className="flex items-center justify-center h-[60vh] text-sm text-slate-400">
            ID de empleado inválido.
          </div>
        </AdminLayout>
      </RoleGuard>
    )
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-[60vh] text-sm text-slate-400">
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
            <AlertCircle className="w-10 h-10 text-red-400" />
          </div>
          <h1 className="text-xl font-semibold text-slate-100">
            Error al cargar el empleado
          </h1>
          <p className="text-sm text-slate-400">
            {error ?? "Empleado no encontrado."}
          </p>
          <Button
            className="mt-4 bg-[#0174bd] hover:bg-[#0174bd]/90 text-white"
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
  const employeeAge = calculateAge(employee.birth_date)

  return (
    <RoleGuard allowed={["admin"]}>
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin/employees">
              <Button variant="ghost" size="icon" aria-label="Volver" className="text-slate-400 hover:text-slate-200 hover:bg-slate-700/60">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>

            <div>
              <h1 className="text-3xl font-bold text-slate-100">
                {employee.name}
              </h1>
              <p className="text-slate-400 mt-1">{primaryRoleLabel}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Dialog open={editOpen} onOpenChange={handleOpenChange}>
              <DialogTrigger asChild>
                <Button className="bg-[#0174bd] hover:bg-[#0174bd]/90 text-white">
                  <Edit className="w-4 h-4 mr-2" />
                  Editar perfil
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl bg-slate-800 border-slate-700 text-slate-100">
                <DialogHeader>
                  <DialogTitle className="text-slate-100">Editar empleado</DialogTitle>
                  <DialogDescription className="text-slate-400">
                    Actualiza la información general del empleado.
                  </DialogDescription>
                </DialogHeader>

                {editForm && (
                  <div className="space-y-6 py-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="full_name" className={labelCls}>Nombre completo</Label>
                        <Input
                          id="full_name"
                          className={inputCls}
                          value={editForm.full_name}
                          onChange={(e) =>
                            handleEditChange("full_name", e.target.value)
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="phone" className={labelCls}>Teléfono</Label>
                        <Input
                          id="phone"
                          className={inputCls}
                          value={editForm.phone}
                          onChange={(e) =>
                            handleEditChange("phone", e.target.value)
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="hire_date" className={labelCls}>Fecha de contratación</Label>
                        <Input
                          id="hire_date"
                          type="date"
                          className={inputCls}
                          value={editForm.hire_date ?? ""}
                          onChange={(e) =>
                            handleEditChange("hire_date", e.target.value)
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className={labelCls}>Estatus</Label>
                        <Select
                          value={editForm.status}
                          onValueChange={(value) =>
                            handleEditChange(
                              "status",
                              value as EditEmployeeForm["status"],
                            )
                          }
                        >
                          <SelectTrigger className={selectTriggerCls}>
                            <SelectValue placeholder="Selecciona un estatus" />
                          </SelectTrigger>
                          <SelectContent className={selectContentCls}>
                            <SelectItem value="active">Activo</SelectItem>
                            <SelectItem value="inactive">Inactivo</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="birth_date" className={labelCls}>Fecha de nacimiento</Label>
                        <Input
                          id="birth_date"
                          type="date"
                          className={inputCls}
                          value={editForm.birth_date ?? ""}
                          onChange={(e) =>
                            handleEditChange("birth_date", e.target.value)
                          }
                        />
                      </div>

                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="termination_date" className={labelCls}>Fecha de bajada</Label>
                        <Input
                          id="termination_date"
                          type="date"
                          className={inputCls}
                          value={editForm.termination_date ?? ""}
                          onChange={(e) =>
                            handleEditChange("termination_date", e.target.value)
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
                    className={btnOutlineCls}
                    onClick={() => setEditOpen(false)}
                    disabled={saving}
                  >
                    Cancelar
                  </Button>
                  <Button type="button" className="bg-[#0174bd] hover:bg-[#0174bd]/90 text-white" onClick={handleSave} disabled={saving}>
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
              <DialogContent className="max-w-xl bg-slate-800 border-slate-700 text-slate-100">
                <DialogHeader>
                  <DialogTitle className="text-slate-100">Eliminar empleado</DialogTitle>
                  <DialogDescription className="text-slate-400">
                    Esta acción eliminará a <span className="font-semibold text-slate-200">{employee.name}</span> y
                    todos los registros relacionados que dependan de este empleado.
                    Esta acción no se puede deshacer.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
                    ¿Estás seguro de que deseas eliminar permanentemente a este empleado?
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="delete-confirm-input" className={labelCls}>
                      Para confirmar, escribe <span className="font-semibold text-slate-200">ELIMINAR</span>
                    </Label>
                    <Input
                      id="delete-confirm-input"
                      className={inputCls}
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
                    className={btnOutlineCls}
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
          <DialogContent className="max-w-2xl bg-slate-800 border-slate-700 text-slate-100">
            <DialogHeader>
              <DialogTitle className="text-slate-100">Modificar roles</DialogTitle>
              <DialogDescription className="text-slate-400">
                Agrega o elimina roles. Los roles seleccionados no aparecerán
                en el dropdown.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label className={labelCls}>Agregar rol</Label>
                <Select value={rolePickerValue} onValueChange={(v) => addRole(v)}>
                  <SelectTrigger className={selectTriggerCls}>
                    <SelectValue placeholder="Selecciona un rol..." />
                  </SelectTrigger>
                  <SelectContent className={selectContentCls}>
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
                <Label className={labelCls}>Roles seleccionados</Label>

                {selectedRoleChips.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    Aún no hay roles seleccionados.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {selectedRoleChips.map((r) => (
                      <span
                        key={r.id}
                        className="inline-flex items-center justify-between rounded-full border border-slate-600 bg-slate-700/60 px-3 py-1 text-xs text-slate-300"
                      >
                        <span className="truncate">{r.name}</span>
                        <button
                          type="button"
                          className="ml-2 rounded-full p-1 hover:bg-slate-600 flex-shrink-0"
                          onClick={() => removeRole(r.id)}
                          aria-label={`Quitar rol ${r.name}`}
                        >
                          <span className="text-slate-400 leading-none">×</span>
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
                className={btnOutlineCls}
                onClick={() => setRolesDialogOpen(false)}
                disabled={rolesSaving}
              >
                Cancelar
              </Button>
              <Button type="button" className="bg-[#0174bd] hover:bg-[#0174bd]/90 text-white" onClick={saveRoles} disabled={rolesSaving}>
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
          <DialogContent className="lg:!w-[calc(100vw-4rem)] lg:!max-w-6xl w-[calc(100vw-1.5rem)] sm:w-[calc(100vw-2rem)] max-w-6xl p-0 overflow-hidden bg-slate-800 border-slate-700 text-slate-100">
            <div className="flex flex-col max-h-[85vh]">
              <div className="sticky top-0 z-10 bg-slate-800 px-6 pt-6 pb-4 border-b border-slate-700">
                <DialogHeader>
                  <DialogTitle className="text-slate-100">Historial salarial</DialogTitle>
                  <DialogDescription className="text-slate-400">
                    Consulta los cambios históricos de sueldo real, bonificación, hora extra y viáticos.
                  </DialogDescription>
                </DialogHeader>
              </div>

              <div className="px-6 py-5 overflow-y-auto">
                {salaryHistoryLoading ? (
                  <p className="text-sm text-slate-400">Cargando historial...</p>
                ) : salaryHistoryError ? (
                  <p className="text-sm text-red-400">{salaryHistoryError}</p>
                ) : salaryHistoryRows.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    No hay registros de historial salarial.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1000px] text-sm">
                      <thead>
                        <tr className="border-b border-slate-700 text-left">
                          <th className="py-3 pr-4 font-semibold text-slate-300">Vigencia</th>
                          <th className="py-3 pr-4 font-semibold text-slate-300">Sueldo real</th>
                          <th className="py-3 pr-4 font-semibold text-slate-300">Bonificación</th>
                          <th className="py-3 pr-4 font-semibold text-slate-300">Hora extra</th>
                          <th className="py-3 pr-4 font-semibold text-slate-300">Viáticos</th>
                          <th className="py-3 pr-4 font-semibold text-slate-300">Modificado por</th>
                          <th className="py-3 pr-0 font-semibold text-slate-300">Motivo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {salaryHistoryRows.map((row) => (
                          <tr key={row.id} className="border-b border-slate-700/60 align-top hover:bg-slate-700/30 transition-colors">
                            <td className="py-3 pr-4 text-slate-400">
                              {formatHistoryRange(row.valid_from, row.valid_to)}
                            </td>
                            <td className="py-3 pr-4 font-medium text-slate-100">
                              {formatMoneyMXN(row.real_salary)}
                            </td>
                            <td className="py-3 pr-4 font-medium text-slate-100">
                              {formatMoneyMXN(row.bonus_amount)}
                            </td>
                            <td className="py-3 pr-4 font-medium text-slate-100">
                              {formatMoneyMXN(row.overtime_hour_cost)}
                            </td>
                            <td className="py-3 pr-4 font-medium text-slate-100">
                              {formatMoneyMXN(row.viatics_amount)}
                            </td>
                            <td className="py-3 pr-4 text-slate-400">
                              {row.changed_by_name || "No registrado"}
                            </td>
                            <td className="py-3 pr-0 text-slate-400">
                              {row.change_reason || "Sin motivo"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="sticky bottom-0 z-10 bg-slate-800 px-6 py-4 border-t border-slate-700">
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    className={btnOutlineCls}
                    onClick={() => setSalaryHistoryOpen(false)}
                  >
                    Cerrar
                  </Button>
                </DialogFooter>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={bankingOpen}
          onOpenChange={async (open) => {
            setBankingOpen(open)
            if (open) {
              await loadBanking()
            }
          }}
        >
          <DialogContent className="max-w-xl bg-slate-800 border-slate-700 text-slate-100">
            <DialogHeader>
              <DialogTitle className="text-slate-100">Editar datos bancarios</DialogTitle>
              <DialogDescription className="text-slate-400">
                Actualiza banco, número de cuenta y clave interbancaria del empleado.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="bank_name" className={labelCls}>Banco</Label>
                <Input
                  id="bank_name"
                  className={inputCls}
                  value={bankingForm.bank_name}
                  onChange={(e) =>
                    setBankingForm((prev) => ({ ...prev, bank_name: e.target.value }))
                  }
                  placeholder="Ej. BBVA"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="account_number" className={labelCls}>Número de Cuenta</Label>
                <Input
                  id="account_number"
                  className={inputCls}
                  value={bankingForm.account_number}
                  onChange={(e) =>
                    setBankingForm((prev) => ({
                      ...prev,
                      account_number: e.target.value.replace(/[^\d]/g, ""),
                    }))
                  }
                  placeholder="Solo números"
                  inputMode="numeric"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="interbank_clabe" className={labelCls}>Clave Interbancaria</Label>
                <Input
                  id="interbank_clabe"
                  className={inputCls}
                  value={bankingForm.interbank_clabe}
                  onChange={(e) =>
                    setBankingForm((prev) => ({
                      ...prev,
                      interbank_clabe: e.target.value.replace(/[^\d]/g, ""),
                    }))
                  }
                  placeholder="18 dígitos"
                  inputMode="numeric"
                  maxLength={18}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className={btnOutlineCls}
                onClick={() => setBankingOpen(false)}
                disabled={bankingSaving || bankingLoading}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className="bg-[#0174bd] hover:bg-[#0174bd]/90 text-white"
                onClick={handleSaveBanking}
                disabled={bankingSaving || bankingLoading}
              >
                {bankingSaving ? "Guardando..." : "Guardar datos"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 ">
          <div
            className="rounded-xl border border-slate-700/60 p-6"
            style={{ background: "linear-gradient(145deg, #1e293b 0%, #172030 60%, #1a2535 100%)" }}
          >
              <div className="flex flex-col items-center text-center space-y-4">
                <button
                  type="button"
                  onClick={() => {
                    if (profilePhotoUrl) setImagePreviewOpen(true)
                  }}
                  className={`
                    w-24 h-24 rounded-full bg-[#0174bd]/15 overflow-hidden flex items-center justify-center
                    transition hover:scale-105
                    ${profilePhotoUrl ? "cursor-zoom-in" : "cursor-default"}
                  `}
                  aria-label="Ver foto de perfil en grande"
                >
                  {profilePhotoUrl ? (
                    <img
                      src={profilePhotoUrl}
                      alt="Foto de perfil"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-3xl font-bold text-[#4da8e8]">
                      {employee.avatar}
                    </span>
                  )}
                </button>

                <div className="space-y-1 w-full">
                  <h3 className="font-semibold text-slate-100 text-xl">
                    {employee.name}
                  </h3>
                  <Badge className={getStatusColor(employee.statusUi)}>
                    {employee.statusUi}
                  </Badge>

                  <div className="mt-3 text-left">
                    {sortedRoles.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center">
                        Sin roles asignados
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {sortedRoles.map((r) => (
                          <span
                            key={r.id}
                            className="
                              inline-flex items-center justify-between
                              rounded-full border border-slate-600 bg-slate-700/60
                              px-3 py-1 text-xs text-slate-300
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
                          text-xs text-slate-400
                          underline-offset-4
                          hover:text-[#4da8e8] hover:underline
                          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-600 focus-visible:ring-offset-2
                        "
                      >
                        <Edit className="w-3.5 h-3.5" />
                        Modificar roles
                      </button>
                    </div>
                  </div>
                </div>

                <div className="w-full space-y-3 pt-4 border-t border-slate-700/60 text-left">
                  <div className="flex items-center gap-3 text-sm">
                    <Calendar className="w-4 h-4 text-slate-500 flex-shrink-0" />
                    <span className="text-slate-400">
                      Edad: {employeeAge !== null ? `${employeeAge} años` : "No especificada"}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="w-4 h-4 text-slate-500 flex-shrink-0" />
                    <span className="text-slate-400">
                      {employee.phone ?? "Sin teléfono"}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-sm">
                    <Calendar className="w-4 h-4 text-slate-500 flex-shrink-0" />
                    <span className="text-slate-400">
                      Fecha de contratación: {formatDate(employee.joinDate)}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-sm">
                    <Clock className="w-4 h-4 text-slate-500 flex-shrink-0" />
                    <span className="text-slate-400">
                      Tiempo contratado: {calculateTenure(employee.joinDate)}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-sm">
                    <Calendar className="w-4 h-4 text-slate-500 flex-shrink-0" />
                    <span className="text-slate-400">
                      Fecha de bajada: {formatDate(employee.terminationDate)}
                    </span>
                  </div>
                </div>
              </div>
          </div>

          <div className="lg:col-span-2">
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="space-y-6"
            >
              {/* ── Tab nav con pill deslizante ── */}
              <div
                ref={navRef}
                role="tablist"
                className="
                  relative flex items-center gap-0 h-auto p-1.5
                  bg-slate-900/70 border border-slate-700/50
                  rounded-2xl overflow-x-auto
                  backdrop-blur-sm
                  [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]
                "
              >
                {/* ── Pill viajero ── */}
                <div
                  data-nav-pill=""
                  aria-hidden="true"
                  className="absolute inset-y-1.5 rounded-xl pointer-events-none z-0"
                  style={{
                    background: "linear-gradient(135deg, #0174bd 0%, #015fa3 100%)",
                    boxShadow: "0 4px 14px rgba(1,116,189,0.35), inset 0 1px 0 rgba(255,255,255,0.12)",
                    left: 0,
                    width: 0,
                  }}
                />

                {/* ── Botones ── */}
                {employeeTabs.map(({ value, label, Icon }) => {
                  const isActive = activeTab === value
                  return (
                    <button
                      key={value}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      data-tab-btn={value}
                      onClick={() => setActiveTab(value)}
                      className={`
                        group relative z-10 flex-1 flex items-center justify-center gap-2
                        px-3 py-2.5 text-xs sm:text-sm font-medium rounded-xl
                        whitespace-nowrap min-w-fit
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0174bd]/50
                        transition-colors duration-150
                        ${isActive
                          ? "text-white"
                          : "text-slate-500 hover:text-slate-300"
                        }
                      `}
                    >
                      <Icon
                        className={`
                          w-3.5 h-3.5 shrink-0
                          transition-all duration-200
                          ${isActive
                            ? "scale-110 drop-shadow-[0_0_8px_rgba(77,168,232,0.7)]"
                            : "group-hover:scale-105"
                          }
                        `}
                      />
                      <span>{label}</span>

                      {/* Punto glow debajo del tab activo */}
                      <span
                        className={`
                          absolute -bottom-px left-1/2 -translate-x-1/2
                          w-1 h-1 rounded-full bg-[#4da8e8]
                          transition-all duration-300
                          ${isActive ? "opacity-100 scale-100" : "opacity-0 scale-0"}
                        `}
                      />
                    </button>
                  )
                })}
              </div>

              <TabsContent value="overview">
                <div className="grid grid-cols-1 gap-6">
                  <div
                    className="rounded-xl border border-slate-700/60"
                    style={{ background: "linear-gradient(145deg, #1e293b 0%, #172030 60%, #1a2535 100%)" }}
                  >
                    <div className="flex flex-row items-center justify-between p-6 pb-4">
                      <h3 className="text-lg font-semibold text-slate-100">Salarios</h3>

                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          className="bg-slate-700 hover:bg-slate-600 text-slate-200"
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
                            <Button variant="outline" size="sm" className={btnOutlineCls}>
                              <Edit className="w-4 h-4 mr-2" />
                              Editar
                            </Button>
                          </DialogTrigger>

                          <DialogContent className="max-w-xl bg-slate-800 border-slate-700 text-slate-100">
                            <DialogHeader>
                              <DialogTitle className="text-slate-100">Editar salarios</DialogTitle>
                              <DialogDescription className="text-slate-400">
                                Actualiza sueldo real, bonificación, hora extra y viáticos.
                              </DialogDescription>
                            </DialogHeader>

                            {editForm && (
                              <div className="space-y-4 py-2">
                                <div className="space-y-2">
                                  <Label htmlFor="real_salary" className={labelCls}>
                                    Sueldo real (MXN)
                                  </Label>
                                  <Input
                                    id="real_salary"
                                    type="number"
                                    step="0.01"
                                    className={inputCls}
                                    value={editForm.real_salary}
                                    onChange={(e) =>
                                      handleEditChange("real_salary", e.target.value)
                                    }
                                  />
                                </div>

                                <div className="space-y-2">
                                  <Label htmlFor="bonus_amount" className={labelCls}>
                                    Bonificación (MXN)
                                  </Label>
                                  <Input
                                    id="bonus_amount"
                                    type="number"
                                    step="0.01"
                                    className={inputCls}
                                    value={editForm.bonus_amount}
                                    onChange={(e) =>
                                      handleEditChange("bonus_amount", e.target.value)
                                    }
                                  />
                                </div>

                                <div className="space-y-2">
                                  <Label htmlFor="overtime_hour_cost" className={labelCls}>
                                    Hora extra (MXN)
                                  </Label>
                                  <Input
                                    id="overtime_hour_cost"
                                    type="number"
                                    step="0.01"
                                    className={inputCls}
                                    value={editForm.overtime_hour_cost}
                                    onChange={(e) =>
                                      handleEditChange(
                                        "overtime_hour_cost",
                                        e.target.value,
                                      )
                                    }
                                  />
                                </div>

                                <div className="space-y-2">
                                  <Label htmlFor="viatics_amount" className={labelCls}>
                                    Viáticos (MXN)
                                  </Label>
                                  <Input
                                    id="viatics_amount"
                                    type="number"
                                    step="0.01"
                                    className={inputCls}
                                    value={editForm.viatics_amount}
                                    onChange={(e) =>
                                      handleEditChange("viatics_amount", e.target.value)
                                    }
                                  />
                                </div>
                              </div>
                            )}

                            <DialogFooter>
                              <Button
                                type="button"
                                variant="outline"
                                className={btnOutlineCls}
                                onClick={() => setPayrollOpen(false)}
                                disabled={saving}
                              >
                                Cancelar
                              </Button>
                              <Button
                                type="button"
                                className="bg-[#0174bd] hover:bg-[#0174bd]/90 text-white"
                                onClick={handleSavePayroll}
                                disabled={saving}
                              >
                                {saving ? "Guardando..." : "Guardar cambios"}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>

                    <div className="px-6 pb-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div className="space-y-1">
                          <p className="text-slate-400">Sueldo real</p>
                          <p className="font-medium text-slate-100 text-2xl">
                            {formatMoneyMXN(employee.real_salary)}
                          </p>
                        </div>

                        <div className="space-y-1">
                          <p className="text-slate-400">Bonificación</p>
                          <p className="font-medium text-slate-100 text-xl">
                            {formatMoneyMXN(employee.bonus_amount)}
                          </p>
                        </div>

                        <div className="space-y-1">
                          <p className="text-slate-400">Hora extra</p>
                          <p className="font-medium text-slate-100 text-xl">
                            {formatMoneyMXN(employee.overtime_hour_cost)}
                          </p>
                        </div>

                        <div className="space-y-1">
                          <p className="text-slate-400">Viáticos</p>
                          <p className="font-medium text-slate-100 text-xl">
                            {formatMoneyMXN(employee.viatics_amount)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    className="rounded-xl border border-slate-700/60"
                    style={{ background: "linear-gradient(145deg, #1e293b 0%, #172030 60%, #1a2535 100%)" }}
                  >
                    <div className="flex flex-row items-center justify-between p-6 pb-4">
                      <h3 className="text-lg font-semibold text-slate-100">Información laboral</h3>

                      <Dialog
                        open={laborOpen}
                        onOpenChange={(open) => {
                          setLaborOpen(open)
                          if (open) initEditFormFromEmployee()
                        }}
                      >
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" className={btnOutlineCls}>
                            <Edit className="w-4 h-4 mr-2" />
                            Editar
                          </Button>
                        </DialogTrigger>

                        <DialogContent className="max-w-xl bg-slate-800 border-slate-700 text-slate-100">
                          <DialogHeader>
                            <DialogTitle className="text-slate-100">Editar información laboral</DialogTitle>
                            <DialogDescription className="text-slate-400">
                              Actualiza los datos laborales y de contacto del empleado.
                            </DialogDescription>
                          </DialogHeader>

                          {editForm && (
                            <div className="space-y-4 py-2">
                              <div className="space-y-2">
                                <Label htmlFor="imss_number" className={labelCls}>Número IMSS</Label>
                                <Input
                                  id="imss_number"
                                  className={inputCls}
                                  value={editForm.imss_number}
                                  onChange={(e) =>
                                    handleEditChange("imss_number", e.target.value)
                                  }
                                />
                              </div>

                              <div className="space-y-2">
                                <Label htmlFor="rfc" className={labelCls}>RFC</Label>
                                <Input
                                  id="rfc"
                                  className={inputCls}
                                  value={editForm.rfc}
                                  onChange={(e) =>
                                    handleEditChange("rfc", e.target.value)
                                  }
                                />
                              </div>

                              <div className="space-y-2">
                                <Label htmlFor="emergency_contact" className={labelCls}>
                                  Contacto de emergencia
                                </Label>
                                <Input
                                  id="emergency_contact"
                                  className={inputCls}
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
                              className={btnOutlineCls}
                              onClick={() => setLaborOpen(false)}
                              disabled={saving}
                            >
                              Cancelar
                            </Button>
                            <Button
                              type="button"
                              className="bg-[#0174bd] hover:bg-[#0174bd]/90 text-white"
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
                    </div>

                    <div className="px-6 pb-6">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="space-y-1">
                          <p className="text-slate-400">Número IMSS</p>
                          <p className="font-medium text-slate-100">
                            {employee.imss_number ?? "No registrado"}
                          </p>
                        </div>

                        <div className="space-y-1">
                          <p className="text-slate-400">RFC</p>
                          <p className="font-medium text-slate-100">
                            {employee.rfc ?? "No registrado"}
                          </p>
                        </div>

                        <div className="space-y-1">
                          <p className="text-slate-400">Contacto de emergencia</p>
                          <p className="font-medium text-slate-100">
                            {employee.emergency_contact ?? "No especificado"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="banking">
                <div
                  className="rounded-xl border border-slate-700/60"
                  style={{ background: "linear-gradient(145deg, #1e293b 0%, #172030 60%, #1a2535 100%)" }}
                >
                  <div className="flex flex-row items-center justify-between p-6 pb-4">
                    <h3 className="text-lg font-semibold text-slate-100">Datos bancarios</h3>

                    <Button
                      variant="outline"
                      size="sm"
                      className={btnOutlineCls}
                      onClick={async () => {
                        setBankingOpen(true)
                        await loadBanking()
                      }}
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Editar
                    </Button>
                  </div>

                  <div className="px-6 pb-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div className="border border-slate-700/60 rounded-lg p-4 space-y-2 bg-slate-900/40">
                        <div className="flex items-center gap-2 text-slate-400">
                          <Landmark className="w-4 h-4" />
                          <span>Banco</span>
                        </div>
                        <p className="font-medium text-slate-100">
                          {employee.bank_name ?? "No registrado"}
                        </p>
                      </div>

                      <div className="border border-slate-700/60 rounded-lg p-4 space-y-2 bg-slate-900/40">
                        <div className="flex items-center gap-2 text-slate-400">
                          <CreditCard className="w-4 h-4" />
                          <span>Número de Cuenta</span>
                        </div>
                        <p className="font-medium text-slate-100 break-all">
                          {employee.account_number ?? "No registrado"}
                        </p>
                      </div>

                      <div className="border border-slate-700/60 rounded-lg p-4 space-y-2 bg-slate-900/40">
                        <div className="flex items-center gap-2 text-slate-400">
                          <Wallet className="w-4 h-4" />
                          <span>Clave Interbancaria</span>
                        </div>
                        <p className="font-medium text-slate-100 break-all">
                          {employee.interbank_clabe ?? "No registrado"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="documents">
                <div
                  className="rounded-xl border border-slate-700/60"
                  style={{ background: "linear-gradient(145deg, #1e293b 0%, #172030 60%, #1a2535 100%)" }}
                >
                  <div className="flex flex-row items-center justify-between p-6 pb-4">
                    <h3 className="text-lg font-semibold text-slate-100">Documentos del empleado</h3>

                    <Dialog open={docsDialogOpen} onOpenChange={setDocsDialogOpen}>
                      <DialogTrigger asChild>
                        <Button className="cursor-pointer bg-[#0174bd] hover:bg-[#0174bd]/85 text-white border-0 transition-all duration-150">
                          <Edit className="w-4 h-4 mr-2" />
                          Editar
                        </Button>
                      </DialogTrigger>

                      <DialogContent className="lg:!w-[calc(100vw-4rem)] lg:!max-w-6xl w-[calc(100vw-1.5rem)] sm:w-[calc(100vw-2rem)] max-w-6xl p-0 overflow-hidden bg-slate-800 border-slate-700 text-slate-100">
                        <div className="flex flex-col max-h-[85vh]">
                          <div className="sticky top-0 z-10 bg-slate-800 px-6 pt-6 pb-4 border-b border-slate-700">
                            <DialogHeader>
                              <DialogTitle className="text-slate-100">Editar documentos</DialogTitle>
                              <DialogDescription className="text-slate-400">
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
                                      className="border border-slate-700/60 rounded-lg p-4 space-y-3 bg-slate-900/40"
                                    >
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="space-y-1">
                                          <p className="text-sm font-medium text-slate-200">
                                            {DOC_LABELS[docType]}
                                          </p>
                                          <p className="text-xs text-slate-400">
                                            {existing ? (
                                              <>
                                                Subido:{" "}
                                                <span className="font-medium text-slate-300">
                                                  {existing.file_name ?? "Archivo"}
                                                </span>
                                              </>
                                            ) : (
                                              "No subido"
                                            )}
                                          </p>
                                        </div>

                                        {existing ? (
                                          <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                                            Listo
                                          </Badge>
                                        ) : (
                                          <Badge className="bg-slate-500/15 text-slate-400 border border-slate-500/25">
                                            Pendiente
                                          </Badge>
                                        )}
                                      </div>

                                      <div className="space-y-2">
                                        <Label className={labelCls}>Seleccionar archivo</Label>
                                        <div className={fileWrapCls}>
                                          <Input
                                            type="file"
                                            accept=".pdf,image/*"
                                            className={fileInputCls}
                                            onChange={(e) => {
                                              const file = e.target.files?.[0] ?? null
                                              handleChangeDocFile(docType, file)
                                            }}
                                          />
                                        </div>
                                        {docFiles[docType] ? (
                                          <p className="text-xs text-slate-300 truncate">
                                            Nuevo: {docFiles[docType]?.name}
                                          </p>
                                        ) : (
                                          <p className="text-xs text-slate-500">
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

                              <div className="border border-slate-700/60 rounded-lg p-4 space-y-3 bg-slate-900/40">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="space-y-1">
                                    <p className="text-sm font-medium text-slate-200">
                                      Foto de perfil
                                    </p>
                                    <p className="text-xs text-slate-400">
                                      {profilePhotoUrl ? "Subida" : "No subida"}
                                    </p>
                                  </div>

                                  {profilePhotoUrl ? (
                                    <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                                      Listo
                                    </Badge>
                                  ) : (
                                    <Badge className="bg-slate-500/15 text-slate-400 border border-slate-500/25">
                                      Pendiente
                                    </Badge>
                                  )}
                                </div>

                                <div className="space-y-2">
                                  <Label className={labelCls}>Seleccionar imagen</Label>
                                  <div className={fileWrapCls}>
                                    <Input
                                      type="file"
                                      accept="image/*"
                                      className={fileInputCls}
                                      onChange={(e) => {
                                        const file = e.target.files?.[0] ?? null
                                        handleChangeDocFile("profile_photo", file)
                                      }}
                                    />
                                  </div>
                                  {docFiles.profile_photo ? (
                                    <p className="text-xs text-slate-300 truncate">
                                      Nuevo: {docFiles.profile_photo.name}
                                    </p>
                                  ) : (
                                    <p className="text-xs text-slate-500">
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

                          <div className="sticky bottom-0 z-10 bg-slate-800 px-6 py-4 border-t border-slate-700">
                            <DialogFooter className="gap-2 sm:gap-3">
                              <Button
                                type="button"
                                variant="outline"
                                className={btnOutlineCls}
                                onClick={() => setDocsDialogOpen(false)}
                                disabled={docsSaving}
                              >
                                Cancelar
                              </Button>
                              <Button
                                type="button"
                                className="bg-[#0174bd] hover:bg-[#0174bd]/90 text-white"
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
                  </div>

                  <div className="px-6 pb-6">
                    {docsLoading ? (
                      <p className="text-sm text-slate-400">
                        Cargando documentos...
                      </p>
                    ) : docsError ? (
                      <p className="text-sm text-red-400">{docsError}</p>
                    ) : (
                      <div className="space-y-3">
                        {REQUIRED_DOCS.map((docType) => {
                          const doc = docsMap.get(docType)
                          const signedUrl = docSignedUrls[docType]
                          const isReady = !!doc
                          const isPdf = normalizeMimeIsPdf(doc?.mime_type ?? null)

                          return (
                            <div
                              key={docType}
                              className="flex items-center justify-between p-4 border border-slate-700/60 rounded-lg bg-slate-900/30 hover:bg-slate-700/20 transition-colors"
                            >
                              <div className="flex items-start gap-3 flex-1">
                                <FileText className="w-5 h-5 text-slate-400 mt-0.5" />
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-medium text-slate-200">
                                      {DOC_LABELS[docType]}
                                    </h4>
                                    {isReady ? (
                                      <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                                        Subido
                                      </Badge>
                                    ) : (
                                      <Badge className="bg-slate-500/15 text-slate-400 border border-slate-500/25">
                                        Pendiente
                                      </Badge>
                                    )}
                                  </div>

                                  <p className="text-xs text-slate-500 mt-1">
                                    {doc ? (
                                      <>
                                        Archivo:{" "}
                                        <span className="font-medium text-slate-400">
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
                                  className={`cursor-pointer ${btnOutlineCls}`}
                                  disabled={!isReady || !signedUrl}
                                  onClick={() => {
                                    if (!signedUrl) return
                                    setFileViewer({ url: signedUrl, name: doc?.file_name || "documento", isPdf })
                                  }}
                                >
                                  <Eye className="w-4 h-4 mr-2" />
                                  Abrir
                                </Button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="dc3">
                <div className="grid grid-cols-1 gap-6">
                  <div
                    className="rounded-xl border border-slate-700/60"
                    style={{ background: "linear-gradient(145deg, #1e293b 0%, #172030 60%, #1a2535 100%)" }}
                  >
                    <div className="flex flex-row items-center justify-between p-6 pb-4">
                      <div className="flex items-center gap-2">
                        <FolderOpen className="w-5 h-5 text-slate-400" />
                        <h3 className="text-lg font-semibold text-slate-100">Carpeta DC3</h3>
                      </div>

                      <Dialog open={dc3DialogOpen} onOpenChange={setDc3DialogOpen}>
                        <DialogTrigger asChild>
                          <Button variant="outline" className={`cursor-pointer ${btnOutlineCls}`}>
                            <Plus className="w-4 h-4 mr-2" />
                            Agregar archivos
                          </Button>
                        </DialogTrigger>

                        <DialogContent className="max-w-2xl bg-slate-800 border-slate-700 text-slate-100">
                          <DialogHeader>
                            <DialogTitle className="text-slate-100">
                              Agregar documentos a Carpeta DC3
                            </DialogTitle>
                            <DialogDescription className="text-slate-400">
                              Sube permisos, licencias u otros documentos adicionales del empleado.
                            </DialogDescription>
                          </DialogHeader>

                          <div className="space-y-4 py-2">
                            <div className="space-y-2">
                              <Label className={labelCls}>Seleccionar archivos</Label>
                              <div className={fileWrapCls}>
                                <Input
                                  type="file"
                                  multiple
                                  accept=".pdf,image/*"
                                  className={fileInputCls}
                                  onChange={(e) =>
                                    handleChangeWorkFiles("dc3", e.target.files)
                                  }
                                />
                              </div>
                            </div>

                            {dc3Files.length > 0 ? (
                              <div className="space-y-2">
                                <p className="text-sm font-medium text-slate-300">
                                  Archivos seleccionados
                                </p>
                                <div className="space-y-2 max-h-48 overflow-y-auto border border-slate-700 rounded-md p-3 bg-slate-900/40">
                                  {dc3Files.map((file, index) => (
                                    <div
                                      key={`${file.name}-${index}`}
                                      className="flex items-center justify-between text-sm text-slate-300"
                                    >
                                      <span className="truncate">{file.name}</span>
                                      <span className="text-xs text-slate-500 ml-3">
                                        {Math.round(file.size / 1024)} KB
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <p className="text-sm text-slate-400">
                                No hay archivos seleccionados.
                              </p>
                            )}
                          </div>

                          <DialogFooter>
                            <Button
                              type="button"
                              variant="outline"
                              className={`cursor-pointer ${btnOutlineCls}`}
                              onClick={() => setDc3DialogOpen(false)}
                              disabled={dc3Saving}
                            >
                              Cancelar
                            </Button>
                            <Button
                              type="button"
                              className="cursor-pointer bg-[#0174bd] hover:bg-[#0174bd]/90 text-white"
                              onClick={() => handleSaveWorkDocuments("dc3")}
                              disabled={dc3Saving}
                            >
                              {dc3Saving ? "Guardando..." : "Guardar archivos"}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>

                    <div className="px-6 pb-6">
                      {dc3Loading ? (
                        <p className="text-sm text-slate-400">
                          Cargando carpeta DC3...
                        </p>
                      ) : dc3Error ? (
                        <p className="text-sm text-red-400">{dc3Error}</p>
                      ) : dc3Documents.length === 0 ? (
                        <p className="text-sm text-slate-400">
                          Esta carpeta aún no tiene documentos cargados.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {dc3Documents.map((doc) => {
                            const signedUrl = dc3SignedUrls[doc.id]
                            const isPdf = normalizeMimeIsPdf(doc.mime_type)

                            return (
                              <div
                                key={doc.id}
                                className="flex items-center justify-between p-4 border border-slate-700/60 rounded-lg bg-slate-900/30 hover:bg-slate-700/20 transition-colors"
                              >
                                <div className="flex items-start gap-3 flex-1">
                                  <FileText className="w-5 h-5 text-slate-400 mt-0.5" />
                                  <div className="flex-1">
                                    <h4 className="font-medium text-slate-200">
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

                                <div className="flex items-center gap-1.5">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="cursor-pointer border-slate-700 text-slate-400 hover:bg-slate-700/60 hover:text-slate-200 transition-all duration-150"
                                    disabled={!signedUrl}
                                    onClick={() => {
                                      if (!signedUrl) return
                                      setFileViewer({ url: signedUrl, name: doc.file_name || "documento-dc3", isPdf })
                                    }}
                                  >
                                    <Eye className="w-4 h-4 mr-1.5" />
                                    {isPdf ? "Ver" : "Abrir"}
                                  </Button>

                                  {/* Eliminar — solo ícono, hover dinámico */}
                                  <button
                                    type="button"
                                    title={`Eliminar ${doc.file_name ?? "archivo"}`}
                                    className="
                                      cursor-pointer
                                      group relative flex items-center justify-center
                                      w-8 h-8 rounded-lg
                                      text-red-400 border border-red-500/40
                                      hover:border-transparent hover:bg-red-500/15 hover:text-red-300
                                      transition-all duration-200
                                      hover:scale-110
                                      active:scale-95
                                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40
                                    "
                                    onClick={async () => {
                                      const ok = confirm(`¿Eliminar "${doc.file_name ?? "este archivo"}"?`)
                                      if (!ok) return
                                      try {
                                        await deleteWorkDocumentByFolder("dc3", doc.id)
                                      } catch (e: any) {
                                        console.error(e)
                                        alert(e?.message || "No se pudo eliminar el archivo.")
                                      }
                                    }}
                                  >
                                    <Trash2 className="w-4 h-4 transition-all duration-200 group-hover:rotate-[-8deg] group-active:drop-shadow-[0_0_12px_rgba(239,68,68,1)] group-active:scale-110" />
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  <div
                    className="rounded-xl border border-slate-700/60"
                    style={{ background: "linear-gradient(145deg, #1e293b 0%, #172030 60%, #1a2535 100%)" }}
                  >
                    <div className="flex flex-row items-center justify-between p-6 pb-4">
                      <div className="flex items-center gap-2">
                        <FolderOpen className="w-5 h-5 text-slate-400" />
                        <h3 className="text-lg font-semibold text-slate-100">Carpeta de Reportes Médicos</h3>
                      </div>

                      <Dialog open={medicalDialogOpen} onOpenChange={setMedicalDialogOpen}>
                        <DialogTrigger asChild>
                          <Button variant="outline" className={`cursor-pointer ${btnOutlineCls}`}>
                            <Plus className="w-4 h-4 mr-2" />
                            Agregar archivos
                          </Button>
                        </DialogTrigger>

                        <DialogContent className="max-w-2xl bg-slate-800 border-slate-700 text-slate-100">
                          <DialogHeader>
                            <DialogTitle className="text-slate-100">
                              Agregar documentos a Carpeta de Reportes Médicos
                            </DialogTitle>
                            <DialogDescription className="text-slate-400">
                              Sube incapacidades, estudios, reportes u otros documentos médicos del empleado.
                            </DialogDescription>
                          </DialogHeader>

                          <div className="space-y-4 py-2">
                            <div className="space-y-2">
                              <Label className={labelCls}>Seleccionar archivos</Label>
                              <div className={fileWrapCls}>
                                <Input
                                  type="file"
                                  multiple
                                  accept=".pdf,image/*"
                                  className={fileInputCls}
                                  onChange={(e) =>
                                    handleChangeWorkFiles("medical_reports", e.target.files)
                                  }
                                />
                              </div>
                            </div>

                            {medicalFiles.length > 0 ? (
                              <div className="space-y-2">
                                <p className="text-sm font-medium text-slate-300">
                                  Archivos seleccionados
                                </p>
                                <div className="space-y-2 max-h-48 overflow-y-auto border border-slate-700 rounded-md p-3 bg-slate-900/40">
                                  {medicalFiles.map((file, index) => (
                                    <div
                                      key={`${file.name}-${index}`}
                                      className="flex items-center justify-between text-sm text-slate-300"
                                    >
                                      <span className="truncate">{file.name}</span>
                                      <span className="text-xs text-slate-500 ml-3">
                                        {Math.round(file.size / 1024)} KB
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <p className="text-sm text-slate-400">
                                No hay archivos seleccionados.
                              </p>
                            )}
                          </div>

                          <DialogFooter>
                            <Button
                              type="button"
                              variant="outline"
                              className={`cursor-pointer ${btnOutlineCls}`}
                              onClick={() => setMedicalDialogOpen(false)}
                              disabled={medicalSaving}
                            >
                              Cancelar
                            </Button>
                            <Button
                              type="button"
                              className="cursor-pointer bg-[#0174bd] hover:bg-[#0174bd]/90 text-white"
                              onClick={() => handleSaveWorkDocuments("medical_reports")}
                              disabled={medicalSaving}
                            >
                              {medicalSaving ? "Guardando..." : "Guardar archivos"}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>

                    <div className="px-6 pb-6">
                      {medicalLoading ? (
                        <p className="text-sm text-slate-400">
                          Cargando carpeta de reportes médicos...
                        </p>
                      ) : medicalError ? (
                        <p className="text-sm text-red-400">{medicalError}</p>
                      ) : medicalDocuments.length === 0 ? (
                        <p className="text-sm text-slate-400">
                          Esta carpeta aún no tiene documentos cargados.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {medicalDocuments.map((doc) => {
                            const signedUrl = medicalSignedUrls[doc.id]
                            const isPdf = normalizeMimeIsPdf(doc.mime_type)

                            return (
                              <div
                                key={doc.id}
                                className="flex items-center justify-between p-4 border border-slate-700/60 rounded-lg bg-slate-900/30 hover:bg-slate-700/20 transition-colors"
                              >
                                <div className="flex items-start gap-3 flex-1">
                                  <FileText className="w-5 h-5 text-slate-400 mt-0.5" />
                                  <div className="flex-1">
                                    <h4 className="font-medium text-slate-200">
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

                                <div className="flex items-center gap-1.5">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="cursor-pointer border-slate-700 text-slate-400 hover:bg-slate-700/60 hover:text-slate-200 transition-all duration-150"
                                    disabled={!signedUrl}
                                    onClick={() => {
                                      if (!signedUrl) return
                                      setFileViewer({ url: signedUrl, name: doc.file_name || "documento-reporte-medico", isPdf })
                                    }}
                                  >
                                    <Eye className="w-4 h-4 mr-1.5" />
                                    {isPdf ? "Ver" : "Abrir"}
                                  </Button>

                                  {/* Eliminar — solo ícono, hover dinámico */}
                                  <button
                                    type="button"
                                    title={`Eliminar ${doc.file_name ?? "archivo"}`}
                                    className="
                                      cursor-pointer
                                      group relative flex items-center justify-center
                                      w-8 h-8 rounded-lg
                                      text-red-400 border border-red-500/40
                                      hover:border-transparent hover:bg-red-500/15 hover:text-red-300
                                      transition-all duration-200
                                      hover:scale-110
                                      active:scale-95
                                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40
                                    "
                                    onClick={async () => {
                                      const ok = confirm(`¿Eliminar "${doc.file_name ?? "este archivo"}"?`)
                                      if (!ok) return
                                      try {
                                        await deleteWorkDocumentByFolder("medical_reports", doc.id)
                                      } catch (e: any) {
                                        console.error(e)
                                        alert(e?.message || "No se pudo eliminar el archivo.")
                                      }
                                    }}
                                  >
                                    <Trash2 className="w-4 h-4 transition-all duration-200 group-hover:rotate-[-8deg] group-active:drop-shadow-[0_0_12px_rgba(239,68,68,1)] group-active:scale-110" />
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="projects">
                <div
                  className="rounded-xl border border-slate-700/60"
                  style={{ background: "linear-gradient(145deg, #1e293b 0%, #172030 60%, #1a2535 100%)" }}
                >
                  <div className="p-6 pb-4">
                    <h3 className="text-lg font-semibold text-slate-100">Obras asignadas</h3>
                  </div>
                  <div className="px-6 pb-6">
                    {projects.length === 0 ? (
                      <p className="text-sm text-slate-400">
                        Este empleado no tiene obras activas asignadas.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {projects.map((project) => (
                          <div
                            key={project.obraId}
                            className="flex items-center justify-between p-4 border border-slate-700/60 rounded-lg bg-slate-900/30 hover:border-[#0174bd]/40 transition-colors"
                          >
                            <div className="flex items-start gap-3 flex-1">
                              <Building2 className="w-5 h-5 text-[#4da8e8] mt-1" />
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-medium text-slate-200">
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
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* ── File Viewer Modal ── */}
        {fileViewer && (
          <div
            className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setFileViewer(null)}
          >
            <div
              className="relative flex flex-col w-full max-w-4xl rounded-2xl overflow-hidden border border-slate-700 shadow-2xl"
              style={{ background: "linear-gradient(145deg, #1e293b 0%, #172030 60%, #1a2535 100%)", maxHeight: "90vh" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-700/60 shrink-0">
                <p className="text-sm font-medium text-slate-200 truncate max-w-[70%]">{fileViewer.name}</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    title="Descargar"
                    className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 border border-slate-600 hover:bg-[#0174bd]/20 hover:border-[#0174bd]/60 hover:text-[#4da8e8] transition-all duration-150"
                    onClick={async () => {
                      try {
                        await forceDownloadFile(fileViewer.url, fileViewer.name)
                      } catch (e: any) {
                        alert(e?.message || "No se pudo descargar el archivo.")
                      }
                    }}
                  >
                    <Download className="w-3.5 h-3.5" />
                    Descargar
                  </button>
                  <button
                    type="button"
                    title="Cerrar"
                    className="cursor-pointer flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 border border-slate-600 hover:bg-slate-700 hover:text-slate-200 transition-all duration-150"
                    onClick={() => setFileViewer(null)}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-auto min-h-0 bg-slate-950/40">
                {fileViewer.isPdf ? (
                  <iframe
                    src={fileViewer.url}
                    className="w-full h-full min-h-[70vh]"
                    title={fileViewer.name}
                  />
                ) : (
                  <div className="flex items-center justify-center p-6 min-h-[50vh]">
                    <img
                      src={fileViewer.url}
                      alt={fileViewer.name}
                      className="max-h-[70vh] w-auto max-w-full rounded-xl object-contain shadow-xl"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {imagePreviewOpen && profilePhotoUrl && (
          <div
            className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setImagePreviewOpen(false)}
          >
            <div
              className="relative max-w-3xl w-full flex items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setImagePreviewOpen(false)}
                className="absolute -top-3 right-3 z-10 rounded-full bg-slate-800 shadow-md p-2 text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition cursor-pointer border border-slate-600"
                aria-label="Cerrar vista previa"
              >
                <X className="w-5 h-5 hover:w-6 hover:h-6 transition-all" />
              </button>

              <img
                src={profilePhotoUrl}
                alt={`Foto ampliada de ${employee.name}`}
                className="max-h-[85vh] w-auto max-w-full rounded-2xl object-contain shadow-2xl bg-slate-900"
              />
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
    </RoleGuard>
  )
}
