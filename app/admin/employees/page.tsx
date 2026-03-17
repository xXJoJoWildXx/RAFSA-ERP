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

import { Search, Plus, Mail, Phone, MapPin, Briefcase, FilePlus, X } from "lucide-react"
import Link from "next/link"
import { supabase } from "@/lib/supabaseClient"

// ----- Tipos DB -----

type EmployeeRow = {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  status: string // "active" | "inactive" | "on_leave"
  hire_date: string | null
  photo_url: string | null
}

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

// Tipo con relación incluida de status de obra
type ObraAssignmentWithObra = {
  employee_id: string
  obra_id: string
  obras:
    | { status: string | null }
    | { status: string | null }[]
    | null
}

// ----- UI types -----

type EmployeeRole = {
  id: string
  code: string
  name: string
}

type Employee = {
  id: string
  name: string
  email: string
  phone: string
  department: string
  location: string
  status: "Activo" | "De permiso" | "Inactivo"
  projects: number
  joinDate: string
  avatar: string
  photo_url: string | null
  signedPhotoUrl?: string | null
  roles: EmployeeRole[]
}

type NewEmployeeForm = {
  full_name: string
  email: string
  phone: string
  status: "active" | "inactive"
  hire_date: string
}

// ----- Documentos -----

type EmployeeDocType =
  | "tax_certificate"
  | "birth_certificate"
  | "imss"
  | "curp"
  | "ine"
  | "address_proof"
  | "profile_photo"

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

const DOC_ORDER: EmployeeDocType[] = [
  "tax_certificate",
  "birth_certificate",
  "imss",
  "curp",
  "ine",
  "address_proof",
  "profile_photo",
]

// ----- Helpers -----

function stringifyAnyError(err: unknown) {
  try {
    if (err instanceof Error) {
      return { name: err.name, message: err.message, stack: err.stack }
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

function mapEmployeeRowToEmployee(row: EmployeeRow, projects: number = 0): Employee {
  const uiStatus = mapDbStatusToUi(row.status)
  const department = "Sin departamento asignado"
  const location = "Sin ubicación registrada"

  return {
    id: row.id,
    name: row.full_name,
    email: row.email ?? "Sin correo",
    phone: row.phone ?? "Sin teléfono",
    department,
    location,
    status: uiStatus,
    projects,
    joinDate: row.hire_date ?? "",
    avatar: makeAvatarInitials(row.full_name),
    photo_url: row.photo_url ?? null,
    signedPhotoUrl: null,
    roles: [],
  }
}

function getPrimaryRoleLabel(roles: EmployeeRole[]) {
  if (!roles || roles.length === 0) return "Sin rol"
  const director = roles.find((r) => r.code === "director_obra")
  return (director ?? roles[0]).name
}

// ✅ Bucket privada => signed url por API
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

// Subida via API Route (SERVER)
async function uploadEmployeeFile(args: { employeeId: string; docType: EmployeeDocType; file: File }) {
  const { employeeId, docType, file } = args

  const form = new FormData()
  form.append("employeeId", employeeId)
  form.append("docType", docType)
  form.append("file", file)

  const res = await fetch("/api/employee-docs", { method: "POST", body: form })
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
  const [roleFilter, setRoleFilter] = useState<string>("all") // role_id o "all"
  const [statusFilter, setStatusFilter] = useState<string>("all")

  const [employees, setEmployees] = useState<Employee[]>([])
  const [rolesCatalog, setRolesCatalog] = useState<RoleCatalogRow[]>([])

  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  // Popup de creación
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [creating, setCreating] = useState(false)

  const [newEmployee, setNewEmployee] = useState<NewEmployeeForm>({
    full_name: "",
    email: "",
    phone: "",
    status: "active",
    hire_date: "",
  })

  // ✅ Multi-rol: lista de role_id
  const [newRoleIds, setNewRoleIds] = useState<string[]>([])

  // Para resetear Select después de elegir (lo dejamos controlado aparte)
  const [rolePickerValue, setRolePickerValue] = useState<string>("")

  // Popup adicional para documentos
  const [docsDialogOpen, setDocsDialogOpen] = useState(false)

  const [newEmployeeFiles, setNewEmployeeFiles] = useState<NewEmployeeFiles>({
    tax_certificate: null,
    birth_certificate: null,
    imss: null,
    curp: null,
    ine: null,
    address_proof: null,
    profile_photo: null,
  })

  // 1) Cargar catálogo roles
  useEffect(() => {
    const fetchRolesCatalog = async () => {
      const { data, error } = await supabase
        .from("employee_roles_catalog")
        .select("id, code, name, is_active")
        .eq("is_active", true)
        .order("name", { ascending: true })

      if (error) {
        console.error("Error fetching employee_roles_catalog:", stringifyAnyError(error))
        return
      }

      setRolesCatalog((data || []) as RoleCatalogRow[])
    }

    fetchRolesCatalog()
  }, [])

  // 2) Cargar empleados + roles + proyectos + firmar fotos
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

        // Proyectos activos
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
          if (Array.isArray(raw)) status = raw[0]?.status ?? null
          else status = raw?.status ?? null

          if ((status || "").toLowerCase() === "closed") return
          projectsMap[a.employee_id] = (projectsMap[a.employee_id] || 0) + 1
        })

        // Roles por empleado (join)
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
          .in("employee_id", employeeIds)

        if (roleJoinErr) {
          console.error("Error fetching employee_roles join:", stringifyAnyError(roleJoinErr))
        }

        const joinRows = (roleJoinData || []) as EmployeeRoleJoinRow[]
        const rolesMap: Record<string, EmployeeRole[]> = {}

        joinRows.forEach((jr) => {
          const raw = jr.employee_roles_catalog
          const cat = Array.isArray(raw) ? raw[0] : raw
          if (!cat) return
          if (cat.is_active === false) return

          const role: EmployeeRole = { id: cat.id, code: cat.code, name: cat.name }
          rolesMap[jr.employee_id] = rolesMap[jr.employee_id] || []
          rolesMap[jr.employee_id].push(role)
        })

        const mapped: Employee[] = rows.map((row) => {
          const emp = mapEmployeeRowToEmployee(row, projectsMap[row.id] || 0)
          emp.roles = rolesMap[row.id] || []
          return emp
        })

        const withSigned = await Promise.all(
          mapped.map(async (emp) => {
            if (!emp.photo_url) return emp
            const signed = await getSignedPhotoUrl(emp.photo_url)
            return { ...emp, signedPhotoUrl: signed }
          }),
        )

        setEmployees(withSigned)
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

  // Roles disponibles para el picker (excluye seleccionados)
  const availableRolesForPicker = useMemo(() => {
    const selected = new Set(newRoleIds)
    return rolesCatalog.filter((r) => !selected.has(r.id))
  }, [rolesCatalog, newRoleIds])

  const selectedRoleChips = useMemo(() => {
    const catalogMap = new Map(rolesCatalog.map((r) => [r.id, r]))
    return newRoleIds
      .map((id) => catalogMap.get(id))
      .filter((r): r is RoleCatalogRow => !!r)
  }, [newRoleIds, rolesCatalog])

  const filteredEmployees = useMemo(() => {
    return employees.filter((employee) => {
      const primaryRoleLabel = getPrimaryRoleLabel(employee.roles)

      const matchesSearch =
        employee.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        employee.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        primaryRoleLabel.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesRole =
        roleFilter === "all"
          ? true
          : employee.roles.some((r) => r.id === roleFilter)

      const normalizedStatus = employee.status.toLowerCase().replace(" ", "-")
      const matchesStatus = statusFilter === "all" ? true : normalizedStatus === statusFilter

      return matchesSearch && matchesRole && matchesStatus
    })
  }, [employees, searchQuery, roleFilter, statusFilter])

  // ----- Handlers -----

  const handleChangeNewEmployee = (field: keyof NewEmployeeForm, value: string) => {
    setNewEmployee((prev) => ({ ...prev, [field]: value }))
  }

  const handleChangeNewEmployeeFile = (docType: EmployeeDocType, file: File | null) => {
    setNewEmployeeFiles((prev) => ({ ...prev, [docType]: file }))
  }

  const addRoleToNewEmployee = (roleId: string) => {
    if (!roleId) return
    setNewRoleIds((prev) => (prev.includes(roleId) ? prev : [...prev, roleId]))
    // resetear picker para que el placeholder vuelva
    setRolePickerValue("")
  }

  const removeRoleFromNewEmployee = (roleId: string) => {
    setNewRoleIds((prev) => prev.filter((id) => id !== roleId))
  }

  const handleCreateEmployee = async () => {
    if (!newEmployee.full_name.trim()) {
      alert("El nombre completo es obligatorio.")
      return
    }
    if (newRoleIds.length === 0) {
      alert("Selecciona al menos un rol para el empleado.")
      return
    }

    setCreating(true)

    const payload = {
      full_name: newEmployee.full_name.trim(),
      email: newEmployee.email.trim() || null,
      phone: newEmployee.phone.trim() || null,
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

      // 2) Insert employee_roles (multi)
      const rolePayload = newRoleIds.map((roleId) => ({
        employee_id: employeeId,
        role_id: roleId,
      }))

      const { error: roleErr } = await supabase.from("employee_roles").insert(rolePayload)

      if (roleErr) {
        console.error("Error insertando employee_roles:", stringifyAnyError(roleErr))
        alert("Empleado creado, pero no se pudieron asignar los roles.")
      }

      // 3) Subir documentos (si hay seleccionados en popup)
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

      // 4) Insert employee_documents
      if (uploaded.length > 0) {
        const { error: docsErr } = await supabase.from("employee_documents").insert(uploaded)
        if (docsErr) {
          console.error("Error insertando employee_documents:", stringifyAnyError(docsErr))
          alert("Empleado creado, pero hubo un error guardando algunos documentos.")
        }
      }

      // 5) Actualizar employees.photo_url si se subió profile_photo
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

      // 6) Refrescar UI: construir objeto UI con roles
      const uiEmployee = mapEmployeeRowToEmployee(createdRow, 0)

      const selectedRoles = rolesCatalog
        .filter((r) => newRoleIds.includes(r.id))
        .map((r) => ({ id: r.id, code: r.code, name: r.name }))

      uiEmployee.roles = selectedRoles

      if (uiEmployee.photo_url) {
        try {
          uiEmployee.signedPhotoUrl = await getSignedPhotoUrl(uiEmployee.photo_url)
        } catch {}
      }

      setEmployees((prev) => [uiEmployee, ...prev])

      // 7) Reset
      setNewEmployee({
        full_name: "",
        email: "",
        phone: "",
        status: "active",
        hire_date: "",
      })
      setNewRoleIds([])
      setRolePickerValue("")
      setNewEmployeeFiles({
        tax_certificate: null,
        birth_certificate: null,
        imss: null,
        curp: null,
        ine: null,
        address_proof: null,
        profile_photo: null,
      })
      setDocsDialogOpen(false)
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
            <p className="text-slate-600 mt-1">
              Administra y visualiza a todos los empleados de la empresa
            </p>
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

                  {/* ✅ Multi-rol: dropdown + chips */}
                  <div className="space-y-2">
                    <Label>Roles / Puestos</Label>

                    <Select
                      value={rolePickerValue}
                      onValueChange={(value) => addRoleToNewEmployee(value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Agregar un rol..." />
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

                    {/* Chips seleccionados */}
                    {selectedRoleChips.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        Selecciona uno o más roles. Se guardan en <span className="font-medium">employee_roles</span>.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {selectedRoleChips.map((r) => (
                          <span
                            key={r.id}
                            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700"
                          >
                            {r.name}
                            <button
                              type="button"
                              className="rounded-full p-1 hover:bg-slate-100"
                              onClick={() => removeRoleFromNewEmployee(r.id)}
                              aria-label={`Quitar rol ${r.name}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
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

                  {/* ✅ Botón para popup adicional de documentos */}
                  <div className="md:col-span-2 flex items-center justify-between gap-3 border-t pt-4">
                    <div>
                      <p className="text-sm font-medium text-slate-900">Documentos del empleado</p>
                      <p className="text-xs text-slate-500">
                        Súbelos ahora o después. Se guardan en Storage y se registran en la DB.
                      </p>
                    </div>

                    <Dialog open={docsDialogOpen} onOpenChange={setDocsDialogOpen}>
                      <DialogTrigger asChild>
                        <Button type="button" variant="outline">
                          <FilePlus className="w-4 h-4 mr-2" />
                          Agregar documentos +
                        </Button>
                      </DialogTrigger>

                      <DialogContent className="max-w-3xl">
                        <DialogHeader>
                          <DialogTitle>Agregar documentos</DialogTitle>
                          <DialogDescription>
                            Selecciona los archivos que deseas subir para este empleado.
                          </DialogDescription>
                        </DialogHeader>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
                          {DOC_ORDER.map((docType) => (
                            <div key={docType} className="space-y-2 border border-slate-200 rounded-lg p-4">
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

                        <DialogFooter>
                          <Button type="button" variant="outline" onClick={() => setDocsDialogOpen(false)}>
                            Listo
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
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

        {/* Filtros */}
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

          {/* Filtro por rol (role_id) */}
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-full md:w-64">
              <SelectValue placeholder="Rol / Puesto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los roles</SelectItem>
              {rolesCatalog.map((role) => (
                <SelectItem key={role.id} value={role.id}>
                  {role.name}
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
                const primaryRoleLabel = getPrimaryRoleLabel(employee.roles)

                return (
                  <Link key={employee.id} href={`/admin/employees/${employee.id}`}>
                    <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                      <CardContent className="p-6">
                        <div className="flex flex-col items-center text-center space-y-4">
                          <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center overflow-hidden relative">
                            <span className="text-2xl font-bold text-blue-600 select-none">
                              {employee.avatar}
                            </span>

                            {employee.signedPhotoUrl ? (
                              <img
                                src={employee.signedPhotoUrl}
                                alt={`Foto de ${employee.name}`}
                                className="absolute inset-0 w-full h-full object-cover"
                                loading="lazy"
                                onError={(e) => {
                                  e.currentTarget.style.display = "none"
                                }}
                              />
                            ) : null}
                          </div>

                          <div className="space-y-1 w-full">
                            <h3 className="font-semibold text-slate-900 text-lg">{employee.name}</h3>
                            <p className="text-sm text-slate-600">{primaryRoleLabel}</p>
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
