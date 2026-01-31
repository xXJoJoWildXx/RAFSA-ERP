"use client"

import { useState, useEffect, useMemo } from "react"
import { AdminLayout } from "@/components/admin-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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

import { Search, Plus, Mail, Phone, MapPin, Briefcase } from "lucide-react"
import Link from "next/link"
import { supabase } from "@/lib/supabaseClient"

// ----- Tipos que reflejan la DB real -----

type EmployeeRow = {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  position_title: string | null
  status: string // "active" | "inactive"
  hire_date: string | null
  photo_url: string | null
}

// Tipo con relación incluida de status de obra
type ObraAssignmentWithObra = {
  employee_id: string
  obra_id: string
  obras:
    | { status: string | null }
    | { status: string | null }[]
    | null
}

// Tipo usado en la UI
type Employee = {
  id: string
  name: string
  email: string
  phone: string
  position: string
  department: string
  location: string
  status: "Activo" | "De permiso" | "Inactivo"
  projects: number
  joinDate: string
  avatar: string
  photo_url: string | null
  signedPhotoUrl?: string | null
}

// Tipo del formulario de creación
type NewEmployeeForm = {
  full_name: string
  email: string
  phone: string
  position_title: string
  status: "active" | "inactive"
  hire_date: string
}

// ----- Documentos -----

type EmployeeDocType =
  | "tax_certificate" // Constancia de Situación Fiscal
  | "birth_certificate" // Acta de Nacimiento
  | "imss" // IMSS (documento)
  | "curp" // CURP
  | "ine" // INE
  | "address_proof" // Comprobante de domicilio
  | "profile_photo" // Foto de Perfil

type NewEmployeeFiles = Partial<Record<EmployeeDocType, File | null>>

const DOC_LABELS: Record<EmployeeDocType, string> = {
  tax_certificate: "Constancia de Situación Fiscal",
  birth_certificate: "Acta de Nacimiento",
  imss: "IMSS",
  curp: "CURP",
  ine: "INE",
  address_proof: "Comprobante de domicilio",
  profile_photo: "Foto de perfil",
}

// ----- Roles para filtro -----

const ROLE_OPTIONS = [
  "Director de Obra",
  "Pintor de Estructura",
  "Pintor de Muros tilt-up",
  "Pintor de Tablaroca",
  "Oficial Pastero",
  "Ayudante de Obra",
] as const

type RoleFilter = "all" | (typeof ROLE_OPTIONS)[number]

// ----- Helpers -----

function stringifyAnyError(err: unknown) {
  try {
    if (err instanceof Error) {
      return {
        name: err.name,
        message: err.message,
        stack: err.stack,
      }
    }
    const anyErr = err as any
    return {
      message: anyErr?.message,
      details: anyErr?.details,
      hint: anyErr?.hint,
      code: anyErr?.code,
      status: anyErr?.status,
      name: anyErr?.name,
      raw: anyErr,
    }
  } catch {
    return { raw: err }
  }
}

function mapDbStatusToUi(status: string): Employee["status"] {
  const normalized = (status || "").toLowerCase()
  if (normalized === "active") return "Activo"
  if (normalized === "inactive") return "Inactivo"
  if (normalized === "on_leave" || normalized === "on-leave") return "De permiso"
  return "Inactivo"
}

function getStatusColor(status: Employee["status"]) {
  switch (status) {
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

function makeAvatarInitials(name: string): string {
  if (!name) return "??"
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

// Mapeo reutilizable DB → UI
function mapEmployeeRowToEmployee(row: EmployeeRow, projects: number = 0): Employee {
  const uiStatus = mapDbStatusToUi(row.status)
  const department = "Sin departamento asignado"
  const location = "Sin ubicación registrada"

  return {
    id: row.id,
    name: row.full_name,
    email: row.email ?? "Sin correo",
    phone: row.phone ?? "Sin teléfono",
    position: row.position_title ?? "Sin puesto",
    department,
    location,
    status: uiStatus,
    projects,
    joinDate: row.hire_date ?? "",
    avatar: makeAvatarInitials(row.full_name),
    photo_url: row.photo_url ?? null,
    signedPhotoUrl: null,
  }
}

// ✅ Bucket privada => usamos API route para signed url
async function getSignedPhotoUrl(storagePath: string) {
  const res = await fetch(
    `/api/employee-photo?path=${encodeURIComponent(storagePath)}&expiresIn=3600`,
    { method: "GET" },
  )
  const json = await res.json().catch(() => null)

  if (!res.ok) {
    console.error("Error creando signed url:", {
      status: res.status,
      statusText: res.statusText,
      body: json,
    })
    return null
  }

  return (json?.signedUrl as string) || null
}

// Subida via API Route (SERVER) para evitar policies por ahora
async function uploadEmployeeFile(args: {
  employeeId: string
  docType: EmployeeDocType
  file: File
}) {
  const { employeeId, docType, file } = args

  const form = new FormData()
  form.append("employeeId", employeeId)
  form.append("docType", docType)
  form.append("file", file)

  const res = await fetch("/api/employee-docs", {
    method: "POST",
    body: form,
  })

  const json = await res.json().catch(() => null)

  if (!res.ok) {
    console.error("Error subiendo archivo (API):", {
      status: res.status,
      statusText: res.statusText,
      body: json,
    })
    throw new Error(json?.error || "Error subiendo archivo a Storage")
  }

  return json as {
    bucket: string
    path: string
    fileName: string
    mimeType: string | null
    fileSize: number | null
  }
}

// ----- Página principal -----

export default function AdminEmployeesPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  // Estado para popup de creación
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newEmployee, setNewEmployee] = useState<NewEmployeeForm>({
    full_name: "",
    email: "",
    phone: "",
    position_title: "",
    status: "active",
    hire_date: "",
  })

  const [newEmployeeFiles, setNewEmployeeFiles] = useState<NewEmployeeFiles>({
    tax_certificate: null,
    birth_certificate: null,
    imss: null,
    curp: null,
    ine: null,
    address_proof: null,
    profile_photo: null,
  })

  useEffect(() => {
    const fetchEmployees = async () => {
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
            position_title,
            status,
            hire_date,
            photo_url
          `,
          )

        if (empError) {
          console.error("Error fetching employees:", stringifyAnyError(empError))
          setError("No se pudieron cargar los empleados.")
          setEmployees([])
          setLoading(false)
          return
        }

        const rows = (empData || []) as EmployeeRow[]

        if (rows.length === 0) {
          setEmployees([])
          setLoading(false)
          return
        }

        const employeeIds = rows.map((e) => e.id)

        // Contamos proyectos activos por empleado, excluyendo closed
        const { data: assignData, error: assignError } = await supabase
          .from("obra_assignments")
          .select("employee_id, obra_id, obras(status)")
          .in("employee_id", employeeIds)

        if (assignError) {
          console.error("Error fetching obra_assignments:", stringifyAnyError(assignError))
        }

        const assignments = (assignData || []) as ObraAssignmentWithObra[]
        const projectsMap: Record<string, number> = {}

        assignments.forEach((a) => {
          const raw = a.obras
          let status: string | null = null

          if (Array.isArray(raw)) {
            status = raw[0]?.status ?? null
          } else {
            status = raw?.status ?? null
          }

          const normalized = (status || "").toLowerCase()
          if (normalized === "closed") return

          projectsMap[a.employee_id] = (projectsMap[a.employee_id] || 0) + 1
        })

        // 1) Mapeo base
        const mapped: Employee[] = rows.map((row) =>
          mapEmployeeRowToEmployee(row, projectsMap[row.id] || 0),
        )

        setEmployees(mapped)

        // 2) Firmar fotos (bucket privada)
        try {
          const withSigned = await Promise.all(
            mapped.map(async (emp) => {
              if (!emp.photo_url) return emp
              const signed = await getSignedPhotoUrl(emp.photo_url)
              return { ...emp, signedPhotoUrl: signed }
            }),
          )
          setEmployees(withSigned)
        } catch (e) {
          console.error("Error creando signed URLs de fotos:", stringifyAnyError(e))
        }
      } catch (e) {
        console.error("fetchEmployees unexpected:", stringifyAnyError(e))
        setError("Error inesperado al cargar los empleados.")
        setEmployees([])
      } finally {
        setLoading(false)
      }
    }

    fetchEmployees()
  }, [])

  const filteredEmployees = useMemo(() => {
    return employees.filter((employee) => {
      const matchesSearch =
        employee.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        employee.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        employee.position.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesRole = roleFilter === "all" ? true : employee.position === roleFilter

      // statusFilter en español (activo / de-permiso / inactivo)
      const normalizedStatus = employee.status.toLowerCase().replace(" ", "-") // "de-permiso"
      const matchesStatus = statusFilter === "all" ? true : normalizedStatus === statusFilter

      return matchesSearch && matchesRole && matchesStatus
    })
  }, [employees, searchQuery, roleFilter, statusFilter])

  // ----- Handlers para el formulario de creación -----

  const handleChangeNewEmployee = (field: keyof NewEmployeeForm, value: string) => {
    setNewEmployee((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleChangeNewEmployeeFile = (docType: EmployeeDocType, file: File | null) => {
    setNewEmployeeFiles((prev) => ({ ...prev, [docType]: file }))
  }

  const handleCreateEmployee = async () => {
    if (!newEmployee.full_name.trim()) {
      alert("El nombre completo es obligatorio.")
      return
    }

    setCreating(true)

    const payload = {
      full_name: newEmployee.full_name.trim(),
      email: newEmployee.email.trim() || null,
      phone: newEmployee.phone.trim() || null,
      position_title: newEmployee.position_title.trim() || null,
      status: newEmployee.status,
      hire_date: newEmployee.hire_date || null,
    }

    try {
      // 1) Crear empleado
      const { data, error } = await supabase
        .from("employees")
        .insert([payload])
        .select(
          `
            id,
            full_name,
            email,
            phone,
            position_title,
            status,
            hire_date,
            photo_url
          `,
        )

      if (error) {
        console.error("Error creando empleado:", stringifyAnyError(error))
        alert("No se pudo crear el empleado.")
        return
      }

      const insertedRows = (data || []) as EmployeeRow[]
      if (insertedRows.length === 0) {
        alert("No se pudo obtener el empleado creado.")
        return
      }

      const createdRow = insertedRows[0]
      const employeeId = createdRow.id

      // 2) Subir documentos (si fueron seleccionados)
      const entries = Object.entries(newEmployeeFiles) as Array<[EmployeeDocType, File | null]>
      const selectedDocs = entries.filter(([, f]) => !!f) as Array<[EmployeeDocType, File]>

      const uploaded = await Promise.all(
        selectedDocs.map(async ([docType, file]) => {
          const up = await uploadEmployeeFile({ employeeId, docType, file })

          return {
            employee_id: employeeId,
            doc_type: docType,
            storage_bucket: up.bucket,
            storage_path: up.path,
            file_name: up.fileName,
            mime_type: up.mimeType,
            file_size: up.fileSize,
          }
        }),
      )

      // 3) Insertar registros en employee_documents
      if (uploaded.length > 0) {
        const { error: docsErr } = await supabase.from("employee_documents").insert(uploaded)

        if (docsErr) {
          console.error("Error insertando employee_documents:", stringifyAnyError(docsErr))
          alert("Empleado creado, pero hubo un error guardando algunos documentos.")
        }
      }

      // 4) Actualizar employees.photo_url si se subió profile_photo
      const profileDoc = uploaded.find((d) => d.doc_type === "profile_photo")
      if (profileDoc) {
        const { error: photoErr } = await supabase
          .from("employees")
          .update({ photo_url: profileDoc.storage_path })
          .eq("id", employeeId)

        if (photoErr) {
          console.error("Error actualizando employees.photo_url:", stringifyAnyError(photoErr))
        } else {
          createdRow.photo_url = profileDoc.storage_path
        }
      }

      // 5) Refrescar UI: agregamos el empleado al inicio (y si hay foto, firmarla)
      const uiEmployee = mapEmployeeRowToEmployee(createdRow, 0)

      if (uiEmployee.photo_url) {
        try {
          uiEmployee.signedPhotoUrl = await getSignedPhotoUrl(uiEmployee.photo_url)
        } catch {}
      }

      setEmployees((prev) => [uiEmployee, ...prev])

      // 6) Reset y cerrar popup
      setNewEmployee({
        full_name: "",
        email: "",
        phone: "",
        position_title: "",
        status: "active",
        hire_date: "",
      })
      setNewEmployeeFiles({
        tax_certificate: null,
        birth_certificate: null,
        imss: null,
        curp: null,
        ine: null,
        address_proof: null,
        profile_photo: null,
      })
      setShowCreateForm(false)
    } catch (e) {
      console.error("Error inesperado creando empleado:", stringifyAnyError(e))
      alert("Ocurrió un error inesperado al crear el empleado.")
    } finally {
      setCreating(false)
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Directorio de empleados</h1>
            <p className="text-slate-600 mt-1">Administra y visualiza a todos los empleados de la empresa</p>
          </div>

          {/* Botón + Popup */}
          <Dialog open={showCreateForm} onOpenChange={setShowCreateForm}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Agregar empleado
              </Button>
            </DialogTrigger>

            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Agregar empleado</DialogTitle>
                <DialogDescription>Registra un nuevo empleado en el directorio.</DialogDescription>
              </DialogHeader>

              <div className="space-y-6 py-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="full_name">Nombre completo</Label>
                    <Input
                      id="full_name"
                      value={newEmployee.full_name}
                      onChange={(e) => handleChangeNewEmployee("full_name", e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="position_title">Puesto / Rol</Label>
                    <Input
                      id="position_title"
                      value={newEmployee.position_title}
                      onChange={(e) => handleChangeNewEmployee("position_title", e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Correo</Label>
                    <Input
                      id="email"
                      type="email"
                      value={newEmployee.email}
                      onChange={(e) => handleChangeNewEmployee("email", e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Teléfono</Label>
                    <Input
                      id="phone"
                      value={newEmployee.phone}
                      onChange={(e) => handleChangeNewEmployee("phone", e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="hire_date">Fecha de contratación</Label>
                    <Input
                      id="hire_date"
                      type="date"
                      value={newEmployee.hire_date}
                      onChange={(e) => handleChangeNewEmployee("hire_date", e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Estatus</Label>
                    <Select
                      value={newEmployee.status}
                      onValueChange={(value) =>
                        handleChangeNewEmployee("status", value as NewEmployeeForm["status"])
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

                  {/* --- Documentos (7) --- */}
                  <div className="space-y-2 md:col-span-2">
                    <p className="text-sm font-medium text-slate-900">Documentos del empleado</p>
                    <p className="text-xs text-slate-500">
                      Puedes subirlos ahora o después. (Se guardan en Storage y se registran en la DB.)
                    </p>
                  </div>

                  {(
                    [
                      "tax_certificate",
                      "birth_certificate",
                      "imss",
                      "curp",
                      "ine",
                      "address_proof",
                      "profile_photo",
                    ] as EmployeeDocType[]
                  ).map((docType) => (
                    <div key={docType} className="space-y-2">
                      <Label>{DOC_LABELS[docType]}</Label>
                      <Input
                        type="file"
                        accept={docType === "profile_photo" ? "image/*" : ".pdf,image/*"}
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null
                          handleChangeNewEmployeeFile(docType, file)
                        }}
                      />
                      {newEmployeeFiles[docType] ? (
                        <p className="text-xs text-slate-500 truncate">
                          Seleccionado: {newEmployeeFiles[docType]?.name}
                        </p>
                      ) : (
                        <p className="text-xs text-slate-400">Sin archivo</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateForm(false)}
                  disabled={creating}
                >
                  Cancelar
                </Button>
                <Button type="button" onClick={handleCreateEmployee} disabled={creating}>
                  {creating ? "Guardando..." : "Crear empleado"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Buscar empleados..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Filtro de rol/puesto */}
          <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as RoleFilter)}>
            <SelectTrigger className="w-full md:w-64">
              <SelectValue placeholder="Rol / Puesto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los roles</SelectItem>
              {ROLE_OPTIONS.map((role) => (
                <SelectItem key={role} value={role}>
                  {role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Filtro de estatus */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full md:w-40">
              <SelectValue placeholder="Estatus" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="activo">Activo</SelectItem>
              <SelectItem value="de-permiso">De permiso</SelectItem>
              <SelectItem value="inactivo">Inactivo</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading && <div className="text-center py-12 text-sm text-slate-500">Cargando empleados...</div>}

        {!loading && error && <div className="text-center py-12 text-sm text-red-500">{error}</div>}

        {!loading && !error && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredEmployees.map((employee) => {
                return (
                  <Link key={employee.id} href={`/admin/employees/${employee.id}`}>
                    <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                      <CardContent className="p-6">
                        <div className="flex flex-col items-center text-center space-y-4">
                          <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center overflow-hidden relative">
                            {/* Fallback SIEMPRE visible */}
                            <span className="text-2xl font-bold text-blue-600 select-none">
                              {employee.avatar}
                            </span>

                            {/* Imagen encima (signed URL) */}
                            {employee.signedPhotoUrl ? (
                              <img
                                src={employee.signedPhotoUrl}
                                alt={`Foto de ${employee.name}`}
                                className="absolute inset-0 w-full h-full object-cover"
                                loading="lazy"
                                onError={(e) => {
                                  // Oculta la imagen fallida y deja ver las iniciales detrás
                                  e.currentTarget.style.display = "none"
                                }}
                              />
                            ) : null}
                          </div>

                          <div className="space-y-1 w-full">
                            <h3 className="font-semibold text-slate-900 text-lg">{employee.name}</h3>
                            <p className="text-sm text-slate-600">{employee.position}</p>
                            <Badge className={getStatusColor(employee.status)}>{employee.status}</Badge>
                          </div>

                          <div className="w-full space-y-2 pt-4 border-t">
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                              <Briefcase className="w-4 h-4 flex-shrink-0" />
                              <span className="truncate">{employee.department}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                              <Mail className="w-4 h-4 flex-shrink-0" />
                              <span className="truncate">{employee.email}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                              <Phone className="w-4 h-4 flex-shrink-0" />
                              <span className="truncate">{employee.phone}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                              <MapPin className="w-4 h-4 flex-shrink-0" />
                              <span className="truncate">{employee.location}</span>
                            </div>
                          </div>

                          <div className="w-full pt-4 border-t">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-slate-600">Obras activas</span>
                              <span className="font-semibold text-slate-900">{employee.projects}</span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                )
              })}
            </div>

            {filteredEmployees.length === 0 && (
              <div className="text-center py-12">
                <p className="text-slate-600">No se encontraron empleados con los filtros actuales.</p>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  )
}
