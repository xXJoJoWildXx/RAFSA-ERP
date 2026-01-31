"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"

import { AdminLayout } from "@/components/admin-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  Upload,
} from "lucide-react"
import { supabase } from "@/lib/supabaseClient"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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

// -------------------- Tipos reales de la DB --------------------

type EmployeeRow = {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  position_title: string | null
  status: string // 'active' | 'inactive'
  hire_date: string | null
  photo_url: string | null
  imss_number: string | null
  rfc: string | null
  birth_date: string | null
  base_salary: number | string
  overtime_hour_cost: number | string
  emergency_contact: string | null
  created_at: string
}

// Fila de obra (lo mínimo que necesitamos)
type ObraRow = {
  id: string
  name: string | null
  status: string | null
}

// Asignación de obra + relación
type ObraAssignmentWithObra = {
  employee_id: string
  obra_id: string
  obras: ObraRow | ObraRow[] | null
}

// Tipo que usaremos en la UI
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
  position: string | null
  statusUi: "Activo" | "Inactivo" | "De permiso"
  statusRaw: string
  joinDate: string | null
  avatar: string
  imss_number: string | null
  rfc: string | null
  birth_date: string | null
  base_salary: number
  overtime_hour_cost: number
  emergency_contact: string | null
  created_at: string
  photo_url: string | null
}

type EditEmployeeForm = {
  full_name: string
  email: string
  phone: string
  position_title: string
  status: "active" | "inactive"
  hire_date: string
  imss_number: string
  rfc: string
  birth_date: string
  base_salary: string
  overtime_hour_cost: string
  emergency_contact: string
}

// -------------------- Documentos --------------------

type EmployeeDocType =
  | "tax_certificate" // Constancia de Situación Fiscal
  | "birth_certificate" // Acta de Nacimiento
  | "imss" // IMSS (documento)
  | "curp" // CURP
  | "ine" // INE
  | "address_proof" // Comprobante de domicilio
  | "profile_photo" // Foto de perfil

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

// Respuesta esperada del API route (ajústalo si tu API responde distinto)
type EmployeeDocumentsApiResponse = {
  documents: EmployeeDocumentRow[]
  // opcional: urls firmadas por doc_type (recomendado)
  signed_urls?: Partial<Record<EmployeeDocType, string>>
  // opcional: url firmada para foto
  profile_photo_url?: string | null
}

// -------------------- Helpers --------------------

function mapDbStatusToUi(status: string): EmployeeDetail["statusUi"] {
  const normalized = status?.toLowerCase()
  if (normalized === "active") return "Activo"
  if (normalized === "inactive") return "Inactivo"
  if (normalized === "on_leave" || normalized === "on-leave") return "De permiso"
  return "Inactivo"
}

function mapUiStatusToDb(statusUi: EmployeeDetail["statusUi"]): "active" | "inactive" {
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

function formatMoneyMXN(value: number) {
  return `$${value.toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} MXN`
}

function mapRowToDetail(row: EmployeeRow): EmployeeDetail {
  const statusUi = mapDbStatusToUi(row.status)
  const baseSalary =
    row.base_salary !== null && row.base_salary !== undefined ? Number(row.base_salary) : 0
  const overtime =
    row.overtime_hour_cost !== null && row.overtime_hour_cost !== undefined
      ? Number(row.overtime_hour_cost)
      : 0

  return {
    id: row.id,
    name: row.full_name,
    email: row.email,
    phone: row.phone,
    position: row.position_title,
    statusUi,
    statusRaw: row.status,
    joinDate: row.hire_date,
    avatar: makeAvatarInitials(row.full_name),
    imss_number: row.imss_number,
    rfc: row.rfc,
    birth_date: row.birth_date,
    base_salary: baseSalary,
    overtime_hour_cost: overtime,
    emergency_contact: row.emergency_contact,
    created_at: row.created_at,
    photo_url: row.photo_url ?? null,
  }
}

// Colores para status de obras (planned, in_progress, paused, closed)
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

// -------------------- Page --------------------

export default function EmployeeDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params?.id

  const [employee, setEmployee] = useState<EmployeeDetail | null>(null)
  const [projects, setProjects] = useState<AssignedObra[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Foto (url firmada) para renderizar en círculo
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null)

  // Documentos (DB)
  const [documents, setDocuments] = useState<EmployeeDocumentRow[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [docsError, setDocsError] = useState<string | null>(null)

  // Edit empleado (perfil) popup state
  const [editOpen, setEditOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editForm, setEditForm] = useState<EditEmployeeForm | null>(null)

  // Popup para documentos
  const [docsDialogOpen, setDocsDialogOpen] = useState(false)
  const [docsSaving, setDocsSaving] = useState(false)
  const [docFiles, setDocFiles] = useState<Partial<Record<EmployeeDocType, File | null>>>({
    tax_certificate: null,
    birth_certificate: null,
    imss: null,
    curp: null,
    ine: null,
    address_proof: null,
    profile_photo: null,
  })

  // URLs firmadas para ver/descargar (por doc_type)
  const [docSignedUrls, setDocSignedUrls] = useState<Partial<Record<EmployeeDocType, string>>>({})

  // -------- Carga inicial: empleado + obras --------
  useEffect(() => {
    if (!id) return

    const fetchData = async () => {
      setLoading(true)
      setError(null)

      try {
        // 1) Empleado
        const { data: empData, error: empError } = await supabase
          .from("employees")
          .select(
            `
            id,
            full_name,
            email,
            phone,
            position_title,
            status,
            hire_date,
            photo_url,
            imss_number,
            rfc,
            birth_date,
            base_salary,
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
        setEmployee(mapped)

        // 2) Asignaciones de obras + join con tabla obras
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

              // Filtrar cerradas
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

  // -------- Carga de documentos + foto firmada (API) --------
  const fetchDocuments = async () => {
    if (!id) return
    setDocsLoading(true)
    setDocsError(null)

    try {
      const res = await fetch(`/api/employee-docs?employeeId=${encodeURIComponent(id)}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      })

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
    if (!id) return
    fetchDocuments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Mapa rápido doc_type -> row
  const docsMap = useMemo(() => {
    const map = new Map<EmployeeDocType, EmployeeDocumentRow>()
    for (const d of documents) map.set(d.doc_type, d)
    return map
  }, [documents])

  // -------- Edit empleado: inicializar form al abrir --------
  const handleOpenChange = (open: boolean) => {
    setEditOpen(open)
    if (open && employee) {
      setEditForm({
        full_name: employee.name ?? "",
        email: employee.email ?? "",
        phone: employee.phone ?? "",
        position_title: employee.position ?? "",
        status: mapUiStatusToDb(employee.statusUi),
        hire_date: employee.joinDate ?? "",
        imss_number: employee.imss_number ?? "",
        rfc: employee.rfc ?? "",
        birth_date: employee.birth_date ?? "",
        base_salary: employee.base_salary?.toString() ?? "0",
        overtime_hour_cost: employee.overtime_hour_cost?.toString() ?? "0",
        emergency_contact: employee.emergency_contact ?? "",
      })
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
      position_title: editForm.position_title.trim() || null,
      status: editForm.status,
      hire_date: editForm.hire_date || null,
      imss_number: editForm.imss_number.trim() || null,
      rfc: editForm.rfc.trim() || null,
      birth_date: editForm.birth_date || null,
      base_salary: Number(editForm.base_salary) || 0,
      overtime_hour_cost: Number(editForm.overtime_hour_cost) || 0,
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
          position_title,
          status,
          hire_date,
          photo_url,
          imss_number,
          rfc,
          birth_date,
          base_salary,
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
      setEmployee(mapRowToDetail(updatedRow))
      setEditOpen(false)
    } catch (e) {
      console.error(e)
      alert("Ocurrió un error inesperado al actualizar el empleado.")
    } finally {
      setSaving(false)
    }
  }

  // -------- Documentos: handlers --------

  const handleChangeDocFile = (docType: EmployeeDocType, file: File | null) => {
    setDocFiles((prev) => ({ ...prev, [docType]: file }))
  }

  async function uploadOrReplaceDoc(docType: EmployeeDocType, file: File) {
    if (!id) return
    // Usamos el mismo endpoint; tu API puede decidir si reemplaza o crea.
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
      // 1) Subir archivos seleccionados
      const entries = Object.entries(docFiles) as Array<[EmployeeDocType, File | null]>
      const selected = entries.filter(([, f]) => !!f) as Array<[EmployeeDocType, File]>

      for (const [docType, file] of selected) {
        await uploadOrReplaceDoc(docType, file)
      }

      // 2) Refrescar lista
      await fetchDocuments()

      // 3) Limpiar selección
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
          <h1 className="text-xl font-semibold text-slate-900">Error al cargar el empleado</h1>
          <p className="text-sm text-slate-600">{error ?? "Empleado no encontrado."}</p>
          <Button className="mt-4" onClick={() => router.push("/admin/employees")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver a empleados
          </Button>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin/employees">
              <Button variant="ghost" size="icon" aria-label="Volver">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">{employee.name}</h1>
              <p className="text-slate-600 mt-1">{employee.position ?? "Puesto no especificado"}</p>
            </div>
          </div>

          {/* Edit profile popup */}
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
                <DialogDescription>Actualiza la información personal y de nómina del empleado.</DialogDescription>
              </DialogHeader>

              {editForm && (
                <div className="space-y-6 py-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="full_name">Nombre completo</Label>
                      <Input
                        id="full_name"
                        value={editForm.full_name}
                        onChange={(e) => handleEditChange("full_name", e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="position_title">Puesto / Rol</Label>
                      <Input
                        id="position_title"
                        value={editForm.position_title}
                        onChange={(e) => handleEditChange("position_title", e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email">Correo</Label>
                      <Input
                        id="email"
                        type="email"
                        value={editForm.email}
                        onChange={(e) => handleEditChange("email", e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="phone">Teléfono</Label>
                      <Input
                        id="phone"
                        value={editForm.phone}
                        onChange={(e) => handleEditChange("phone", e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="hire_date">Fecha de contratación</Label>
                      <Input
                        id="hire_date"
                        type="date"
                        value={editForm.hire_date ?? ""}
                        onChange={(e) => handleEditChange("hire_date", e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Estatus</Label>
                      <Select
                        value={editForm.status}
                        onValueChange={(value) =>
                          handleEditChange("status", value as EditEmployeeForm["status"])
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
                      <Label htmlFor="imss_number">Número IMSS</Label>
                      <Input
                        id="imss_number"
                        value={editForm.imss_number}
                        onChange={(e) => handleEditChange("imss_number", e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="rfc">RFC</Label>
                      <Input
                        id="rfc"
                        value={editForm.rfc}
                        onChange={(e) => handleEditChange("rfc", e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="birth_date">Fecha de nacimiento</Label>
                      <Input
                        id="birth_date"
                        type="date"
                        value={editForm.birth_date ?? ""}
                        onChange={(e) => handleEditChange("birth_date", e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="base_salary">Sueldo base (MXN)</Label>
                      <Input
                        id="base_salary"
                        type="number"
                        step="0.01"
                        value={editForm.base_salary}
                        onChange={(e) => handleEditChange("base_salary", e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="overtime_hour_cost">Costo hora extra (MXN)</Label>
                      <Input
                        id="overtime_hour_cost"
                        type="number"
                        step="0.01"
                        value={editForm.overtime_hour_cost}
                        onChange={(e) => handleEditChange("overtime_hour_cost", e.target.value)}
                      />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="emergency_contact">Contacto de emergencia</Label>
                      <Input
                        id="emergency_contact"
                        value={editForm.emergency_contact}
                        onChange={(e) => handleEditChange("emergency_contact", e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>
                  Cancelar
                </Button>
                <Button type="button" onClick={handleSave} disabled={saving}>
                  {saving ? "Guardando..." : "Guardar cambios"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT: resumen */}
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col items-center text-center space-y-4">
                {/* Foto de perfil */}
                <div className="w-24 h-24 rounded-full bg-blue-100 overflow-hidden flex items-center justify-center">
                  {profilePhotoUrl ? (
                    <img
                      src={profilePhotoUrl}
                      alt="Foto de perfil"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-3xl font-bold text-blue-600">{employee.avatar}</span>
                  )}
                </div>

                <div className="space-y-1">
                  <h3 className="font-semibold text-slate-900 text-xl">{employee.name}</h3>
                  <p className="text-sm text-slate-600">{employee.position ?? "Puesto no especificado"}</p>
                  <Badge className={getStatusColor(employee.statusUi)}>{employee.statusUi}</Badge>
                </div>

                <div className="w-full space-y-3 pt-4 border-t text-left">
                  <div className="flex items-center gap-3 text-sm">
                    <Briefcase className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="text-slate-600">Departamento no especificado</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="text-slate-600 break-all">{employee.email ?? "Sin correo"}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="text-slate-600">{employee.phone ?? "Sin teléfono"}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="text-slate-600">Ubicación no especificada</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="text-slate-600">Contratado: {formatDate(employee.joinDate)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* RIGHT: tabs */}
          <div className="lg:col-span-2">
            <Tabs defaultValue="overview" className="space-y-6">
              <TabsList>
                <TabsTrigger value="overview">Resumen</TabsTrigger>
                <TabsTrigger value="documents">Documentos</TabsTrigger>
                <TabsTrigger value="projects">Obras</TabsTrigger>
              </TabsList>

              {/* OVERVIEW */}
              <TabsContent value="overview">
                <Card>
                  <CardHeader>
                    <CardTitle>Información laboral y nómina</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div className="space-y-1">
                        <p className="text-slate-500">Número IMSS</p>
                        <p className="font-medium text-slate-900">
                          {employee.imss_number ?? "No registrado"}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-slate-500">RFC</p>
                        <p className="font-medium text-slate-900">{employee.rfc ?? "No registrado"}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-slate-500">Fecha de nacimiento</p>
                        <p className="font-medium text-slate-900">{formatDate(employee.birth_date)}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-slate-500">Sueldo base</p>
                        <p className="font-medium text-slate-900">{formatMoneyMXN(employee.base_salary)}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-slate-500">Costo hora extra</p>
                        <p className="font-medium text-slate-900">
                          {formatMoneyMXN(employee.overtime_hour_cost)}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-slate-500">Contacto de emergencia</p>
                        <p className="font-medium text-slate-900">
                          {employee.emergency_contact ?? "No especificado"}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-slate-500">Estatus (DB)</p>
                        <p className="font-medium text-slate-900">{employee.statusRaw}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-slate-500">Registro creado</p>
                        <p className="font-medium text-slate-900">{formatDate(employee.created_at)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* DOCUMENTOS */}
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

                      <DialogContent
                        className="lg:!w-[calc(100vw-4rem)] lg:!max-w-6xl w-[calc(100vw-1.5rem)] sm:w-[calc(100vw-2rem)] max-w-6xl p-0 overflow-hidden ">
                        <div className="flex flex-col max-h-[85vh]">
                          {/* HEADER (sticky) */}
                          <div className="sticky top-0 z-10 bg-white px-6 pt-6 pb-4 border-b">
                            <DialogHeader>
                              <DialogTitle>Editar documentos</DialogTitle>
                              <DialogDescription>
                                Sube, reemplaza o elimina documentos del empleado. Los cambios se guardan en Storage y en la DB.
                              </DialogDescription>
                            </DialogHeader>
                          </div>

                          {/* BODY (scroll) */}
                          <div className="px-6 py-5 overflow-y-auto">
                            <div className="space-y-6">
                              {/* 6 docs requeridos */}
                              <div
                                className="
                                  grid grid-cols-1
                                  md:grid-cols-2
                                  xl:grid-cols-3
                                  gap-4
                                "
                              >
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
                                          <Badge className="bg-green-100 text-green-700">Listo</Badge>
                                        ) : (
                                          <Badge className="bg-slate-100 text-slate-700">Pendiente</Badge>
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
                                          <p className="text-xs text-slate-400">Sin cambios</p>
                                        )}
                                      </div>

                                      <div className="flex items-center justify-end gap-2">
                                        <Button
                                          type="button"
                                          variant="destructive"
                                          disabled={!existing || docsSaving}
                                          onClick={async () => {
                                            const ok = confirm(`¿Eliminar "${DOC_LABELS[docType]}"?`)
                                            if (!ok) return
                                            try {
                                              setDocsSaving(true)
                                              await deleteDoc(docType)
                                              await fetchDocuments()
                                            } catch (err: any) {
                                              console.error(err)
                                              alert(err?.message || "No se pudo eliminar el documento.")
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

                              {/* Foto de perfil */}
                              <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="space-y-1">
                                    <p className="text-sm font-medium text-slate-900">Foto de perfil</p>
                                    <p className="text-xs text-slate-500">
                                      {profilePhotoUrl ? "Subida" : "No subida"}
                                    </p>
                                  </div>

                                  {profilePhotoUrl ? (
                                    <Badge className="bg-green-100 text-green-700">Listo</Badge>
                                  ) : (
                                    <Badge className="bg-slate-100 text-slate-700">Pendiente</Badge>
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
                                    <p className="text-xs text-slate-400">Sin cambios</p>
                                  )}
                                </div>

                                <div className="flex items-center justify-end">
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    disabled={!profilePhotoUrl || docsSaving}
                                    onClick={async () => {
                                      const ok = confirm("¿Eliminar la foto de perfil?")
                                      if (!ok) return
                                      try {
                                        setDocsSaving(true)
                                        await deleteDoc("profile_photo")
                                        await fetchDocuments()
                                      } catch (err: any) {
                                        console.error(err)
                                        alert(err?.message || "No se pudo eliminar la foto.")
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

                          {/* FOOTER (sticky) */}
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
                              <Button type="button" onClick={handleSaveDocuments} disabled={docsSaving}>
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
                      <p className="text-sm text-slate-600">Cargando documentos...</p>
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
                                    <h4 className="font-medium text-slate-900">{DOC_LABELS[docType]}</h4>
                                    {isReady ? (
                                      <Badge className="bg-green-100 text-green-700">Subido</Badge>
                                    ) : (
                                      <Badge className="bg-slate-100 text-slate-700">Pendiente</Badge>
                                    )}
                                  </div>

                                  <p className="text-xs text-slate-500 mt-1">
                                    {doc ? (
                                      <>
                                        Archivo: <span className="font-medium">{doc.file_name ?? "Archivo"}</span>
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
                                  onClick={() => {
                                    if (!signedUrl) return
                                    window.open(signedUrl, "_blank", "noopener,noreferrer")
                                  }}
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

              {/* PROJECTS */}
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
                                  <h4 className="font-medium text-slate-900">{project.name}</h4>
                                  {project.status && (
                                    <Badge className={getObraStatusColor(project.status)}>
                                      {formatObraStatus(project.status)}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-slate-500 mt-1">ID: {project.obraId}</p>
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
