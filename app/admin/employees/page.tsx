"use client"

import { useState, useEffect, useMemo } from "react"
import { AdminLayout } from "@/components/admin-layout"
import { RoleGuard } from "@/lib/role-guard"
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

import { Search, Plus, Phone, X, FileDown, Calendar, Clock, User } from "lucide-react"
import Link from "next/link"
import { supabase } from "@/lib/supabaseClient"
import { generateEmployeesPdf, type EmployeePdfData, type SalaryPdfData } from "@/lib/generateEmployeesPdf"

// ----- Tipos que reflejan la DB real -----

type EmployeeRow = {
  id: string
  full_name: string
  phone: string | null
  status: string
  hire_date: string | null
  birth_date: string | null
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

type ObraAssignmentWithObra = {
  employee_id: string
  obra_id: string
  obras:
    | { status: string | null }
    | { status: string | null }[]
    | null
}

type Employee = {
  id: string
  name: string
  phone: string
  position: string
  status: "Activo" | "De permiso" | "Inactivo"
  projects: number
  joinDate: string
  birth_date: string | null
  avatar: string
  photo_url: string | null
  signedPhotoUrl?: string | null
  roles: {
    id: string
    code: string
    name: string
  }[]
}

type NewEmployeeForm = {
  full_name: string
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

function calculateAge(birthDate: string | null): number | null {
  if (!birthDate) return null
  const parts = birthDate.split("T")[0]?.split("-")
  if (!parts || parts.length !== 3) return null
  const [year, month, day] = parts.map(Number)
  const birth = new Date(year, month - 1, day)
  if (Number.isNaN(birth.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
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

function mapEmployeeRowToEmployee(
  row: EmployeeRow,
  roles: Employee["roles"] = [],
  projects: number = 0,
): Employee {
  const uiStatus = mapDbStatusToUi(row.status)

  const sortedRoles = [...roles].sort((a, b) => {
    const aIsDirector = a.code === "director_obra"
    const bIsDirector = b.code === "director_obra"
    if (aIsDirector && !bIsDirector) return -1
    if (!aIsDirector && bIsDirector) return 1
    return a.name.localeCompare(b.name, "es")
  })

  return {
    id: row.id,
    name: row.full_name,
    phone: row.phone ?? "Sin teléfono",
    position: sortedRoles[0]?.name ?? "Sin rol",
    status: uiStatus,
    projects,
    joinDate: row.hire_date ?? "",
    birth_date: row.birth_date ?? null,
    avatar: makeAvatarInitials(row.full_name),
    photo_url: row.photo_url ?? null,
    signedPhotoUrl: null,
    roles: sortedRoles,
  }
}

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

const EMPLOYEE_DOCS_BUCKET = "employee-documents"

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

async function uploadEmployeeFileDirect(args: {
  employeeId: string
  docType: EmployeeDocType
  file: File
}) {
  const { employeeId, docType, file } = args

  const path = buildEmployeeDocPath(employeeId, docType, file)

  const { error } = await supabase.storage
    .from(EMPLOYEE_DOCS_BUCKET)
    .upload(path, file, {
      upsert: false,
      contentType: file.type || "application/octet-stream",
    })

  if (error) {
    console.error("Error subiendo archivo directo a Storage:", stringifyAnyError(error))
    throw new Error(error.message || "Error subiendo archivo a Storage")
  }

  return {
    bucket: EMPLOYEE_DOCS_BUCKET,
    path,
    fileName: file.name,
    mimeType: file.type || null,
    fileSize: file.size ?? null,
  }
}

// ----- Página principal -----

export default function AdminEmployeesPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [roleFilter, setRoleFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  const [employees, setEmployees] = useState<Employee[]>([])
  const [rolesCatalog, setRolesCatalog] = useState<RoleCatalogRow[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showDocsPopup, setShowDocsPopup] = useState(false)
  const [creating, setCreating] = useState(false)

  const [newEmployee, setNewEmployee] = useState<NewEmployeeForm>({
    full_name: "",
    phone: "",
    status: "active",
    hire_date: "",
  })

  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([])
  const [rolePickerValue, setRolePickerValue] = useState("")

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
            phone,
            status,
            hire_date,
            birth_date,
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

        const { data: rolesJoinData, error: rolesJoinError } = await supabase
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

        if (rolesJoinError) {
          console.error("Error fetching employee_roles:", stringifyAnyError(rolesJoinError))
        }

        const rolesMap: Record<string, Employee["roles"]> = {}

        ;((rolesJoinData || []) as EmployeeRoleJoinRow[]).forEach((row) => {
          const raw = row.employee_roles_catalog
          const role = Array.isArray(raw) ? raw[0] : raw
          if (!role || role.is_active === false) return

          if (!rolesMap[row.employee_id]) rolesMap[row.employee_id] = []

          rolesMap[row.employee_id].push({
            id: role.id,
            code: role.code,
            name: role.name,
          })
        })

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

        const mapped: Employee[] = rows.map((row) =>
          mapEmployeeRowToEmployee(row, rolesMap[row.id] || [], projectsMap[row.id] || 0),
        )

        setEmployees(mapped)

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

  const availableRolesForPicker = useMemo(() => {
    const selected = new Set(selectedRoleIds)
    return rolesCatalog.filter((r) => !selected.has(r.id))
  }, [rolesCatalog, selectedRoleIds])

  const selectedRoleChips = useMemo(() => {
    const map = new Map(rolesCatalog.map((r) => [r.id, r]))
    return selectedRoleIds
      .map((rid) => map.get(rid))
      .filter((r): r is RoleCatalogRow => !!r)
  }, [selectedRoleIds, rolesCatalog])

  const filteredEmployees = useMemo(() => {
    return employees.filter((employee) => {
      const matchesSearch =
        employee.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        employee.position.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesRole =
        roleFilter === "all"
          ? true
          : employee.roles.some((r) => r.id === roleFilter)

      const normalizedStatus = employee.status.toLowerCase().replace(" ", "-")
      const matchesStatus = statusFilter === "all" ? true : normalizedStatus === statusFilter

      return matchesSearch && matchesRole && matchesStatus
    })
  }, [employees, searchQuery, roleFilter, statusFilter])

  const handleChangeNewEmployee = (field: keyof NewEmployeeForm, value: string) => {
    setNewEmployee((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleChangeNewEmployeeFile = (docType: EmployeeDocType, file: File | null) => {
    setNewEmployeeFiles((prev) => ({ ...prev, [docType]: file }))
  }

  const addRole = (roleId: string) => {
    if (!roleId) return
    setSelectedRoleIds((prev) => (prev.includes(roleId) ? prev : [...prev, roleId]))
    setRolePickerValue("")
  }

  const removeRole = (roleId: string) => {
    setSelectedRoleIds((prev) => prev.filter((id) => id !== roleId))
  }

  const resetCreateForm = () => {
    setNewEmployee({
      full_name: "",
      phone: "",
      status: "active",
      hire_date: "",
    })
    setSelectedRoleIds([])
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
    setShowCreateForm(false)
    setShowDocsPopup(false)
  }

  const handleCreateEmployee = async () => {
    if (!newEmployee.full_name.trim()) {
      alert("El nombre completo es obligatorio.")
      return
    }

    if (selectedRoleIds.length === 0) {
      alert("Selecciona al menos un rol.")
      return
    }

    setCreating(true)

    const payload = {
      full_name: newEmployee.full_name.trim(),
      phone: newEmployee.phone.trim() || null,
      status: newEmployee.status,
      hire_date: newEmployee.hire_date || null,
    }

    try {
      const { data, error } = await supabase
        .from("employees")
        .insert([payload])
        .select(
          `
            id,
            full_name,
            phone,
            status,
            hire_date,
            birth_date,
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

      const rolePayload = selectedRoleIds.map((roleId) => ({
        employee_id: employeeId,
        role_id: roleId,
      }))

      const { error: roleErr } = await supabase.from("employee_roles").insert(rolePayload)

      if (roleErr) {
        console.error("Error insertando employee_roles:", stringifyAnyError(roleErr))
        alert("Empleado creado, pero hubo un error guardando los roles.")
      }

      const entries = Object.entries(newEmployeeFiles) as Array<[EmployeeDocType, File | null]>
      const selectedDocs = entries.filter(([, f]) => !!f) as Array<[EmployeeDocType, File]>

      for (const [, file] of selectedDocs) {
        const maxMb = 25
        if (file.size > maxMb * 1024 * 1024) {
          alert(`El archivo "${file.name}" excede el límite de ${maxMb} MB.`)
          setCreating(false)
          return
        }
      }

      const uploaded = await Promise.all(
        selectedDocs.map(async ([docType, file]) => {
          const up = await uploadEmployeeFileDirect({ employeeId, docType, file })

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

      if (uploaded.length > 0) {
        const { error: docsErr } = await supabase.from("employee_documents").insert(uploaded)

        if (docsErr) {
          console.error("Error insertando employee_documents:", stringifyAnyError(docsErr))
          alert("Empleado creado, pero hubo un error guardando algunos documentos.")
        }
      }

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

      const createdRoles = rolesCatalog
        .filter((r) => selectedRoleIds.includes(r.id))
        .map((r) => ({
          id: r.id,
          code: r.code,
          name: r.name,
        }))

      const uiEmployee = mapEmployeeRowToEmployee(createdRow, createdRoles, 0)

      if (uiEmployee.photo_url) {
        try {
          uiEmployee.signedPhotoUrl = await getSignedPhotoUrl(uiEmployee.photo_url)
        } catch {}
      }

      setEmployees((prev) => [uiEmployee, ...prev])
      resetCreateForm()
    } catch (e) {
      console.error("Error inesperado creando empleado:", stringifyAnyError(e))
      alert("Ocurrió un error inesperado al crear el empleado.")
    } finally {
      setCreating(false)
    }
  }

  // ── PDF Export ────────────────────────────────────────────────────────────
  const [generatingPdf, setGeneratingPdf] = useState(false)

  async function handleExportPdf() {
    setGeneratingPdf(true)
    try {
      const ids = employees.map((e) => e.id)

      // Fetch termination_date for all employees
      const { data: empExtra } = await supabase
        .from("employees")
        .select("id, termination_date")
        .in("id", ids)

      const terminationMap: Record<string, string | null> = {}
      ;(empExtra || []).forEach((e: any) => {
        terminationMap[e.id] = e.termination_date ?? null
      })

      // Fetch latest salary record per employee (most recent valid_from)
      const { data: salaryData } = await supabase
        .from("employee_salary_history")
        .select("employee_id, real_salary, payroll_salary, bonus_amount, overtime_hour_cost, viatics_amount, valid_from, valid_to")
        .in("employee_id", ids)
        .order("valid_from", { ascending: false })

      const salaryMap: Record<string, SalaryPdfData> = {}
      ;(salaryData || []).forEach((row: any) => {
        // Keep only the first (most recent) record per employee
        if (!salaryMap[row.employee_id]) {
          salaryMap[row.employee_id] = {
            real_salary: row.real_salary,
            payroll_salary: row.payroll_salary,
            bonus_amount: row.bonus_amount,
            overtime_hour_cost: row.overtime_hour_cost,
            viatics_amount: row.viatics_amount,
          }
        }
      })

      const pdfData: EmployeePdfData[] = employees.map((emp) => ({
        id: emp.id,
        full_name: emp.name,
        status: emp.status === "Activo" ? "active" : "inactive",
        hire_date: emp.joinDate || null,
        termination_date: terminationMap[emp.id] ?? null,
        tenure: calculateTenure(emp.joinDate || null),
        roles: emp.roles.map((r) => ({ name: r.name })),
        signedPhotoUrl: emp.signedPhotoUrl ?? null,
        salary: salaryMap[emp.id] ?? null,
      }))

      const activeCount = employees.filter((e) => e.status === "Activo").length
      const inactiveCount = employees.filter((e) => e.status !== "Activo").length
      await generateEmployeesPdf(pdfData, activeCount, inactiveCount)
    } catch (e) {
      console.error("Error generando PDF:", e)
    } finally {
      setGeneratingPdf(false)
    }
  }

  return (
    <RoleGuard allowed={["admin"]}>
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Directorio de empleados</h1>
            <p className="text-slate-600 mt-1">
              Administra y visualiza a todos los empleados de la empresa
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleExportPdf}
              disabled={generatingPdf || employees.length === 0}
              className="cursor-pointer"
            >
              <FileDown className={`w-4 h-4 mr-2 ${generatingPdf ? "animate-pulse" : ""}`} />
              {generatingPdf ? "Generando PDF..." : "Exportar PDF"}
            </Button>

          <Dialog
            open={showCreateForm}
            onOpenChange={(open) => {
              setShowCreateForm(open)
              if (!open) {
                setShowDocsPopup(false)
              }
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Agregar empleado
              </Button>
            </DialogTrigger>

            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Agregar empleado</DialogTitle>
                <DialogDescription>
                  Registra un nuevo empleado en el directorio.
                </DialogDescription>
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
                    <Label>Roles</Label>
                    <Select value={rolePickerValue} onValueChange={(v) => addRole(v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona uno o más roles" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableRolesForPicker.length === 0 ? (
                          <SelectItem value="__empty__" disabled>
                            No hay más roles disponibles
                          </SelectItem>
                        ) : (
                          availableRolesForPicker.map((role) => (
                            <SelectItem key={role.id} value={role.id}>
                              {role.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>

                    {selectedRoleChips.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        Selecciona uno o más roles.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {selectedRoleChips.map((role) => (
                          <span
                            key={role.id}
                            className="inline-flex items-center justify-between rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700"
                          >
                            <span className="truncate">{role.name}</span>
                            <button
                              type="button"
                              className="ml-2 rounded-full p-1 hover:bg-slate-100 flex-shrink-0"
                              onClick={() => removeRole(role.id)}
                              aria-label={`Quitar rol ${role.name}`}
                            >
                              <X className="w-3 h-3 text-slate-500" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
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

                  <div className="md:col-span-2 flex items-center justify-between gap-3 border-t pt-4">
                    <div>
                      <p className="text-sm font-medium text-slate-900">Documentos del empleado</p>
                      <p className="text-xs text-slate-500">
                        Súbelos ahora o después, en el perfil del empleado.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowDocsPopup(true)}
                    >
                      Agregar documentos +
                    </Button>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetCreateForm}
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
          </div>{/* end flex gap-2 */}
        </div>

        <Dialog open={showDocsPopup} onOpenChange={setShowDocsPopup}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Documentos del empleado</DialogTitle>
              <DialogDescription>
                Selecciona los archivos que deseas subir para este empleado.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
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
                <div key={docType} className="space-y-1 px-2 border border-slate-200 rounded-lg p-3">
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
              <Button type="button" variant="outline" onClick={() => setShowDocsPopup(false)}>
                Cerrar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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

        {loading && (
          <div className="text-center py-12 text-sm text-slate-500">Cargando empleados...</div>
        )}

        {!loading && error && (
          <div className="text-center py-12 text-sm text-red-500">{error}</div>
        )}

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
                            <p className="text-sm text-slate-600">{employee.position}</p>
                            <Badge className={getStatusColor(employee.status)}>{employee.status}</Badge>
                          </div>

                          <div className="w-full space-y-2 pt-4 border-t">
                            {/* Edad */}
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                              <User className="w-4 h-4 flex-shrink-0" />
                              <span className="text-slate-400 mr-1">Edad</span>
                              <span className="truncate">
                                {calculateAge(employee.birth_date) !== null
                                  ? `${calculateAge(employee.birth_date)} años`
                                  : "No registrada"}
                              </span>
                            </div>
                            {/* Teléfono */}
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                              <Phone className="w-4 h-4 flex-shrink-0" />
                              <span className="text-slate-400 mr-1">Teléfono</span>
                              <span className="truncate">{employee.phone}</span>
                            </div>
                            {/* Separador Contratación */}
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide pt-1">Contratación</p>
                            {/* Fecha */}
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                              <Calendar className="w-4 h-4 flex-shrink-0" />
                              <span className="truncate">
                                {employee.joinDate
                                  ? new Date(employee.joinDate + "T12:00:00").toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })
                                  : "Sin fecha"}
                              </span>
                            </div>
                            {/* Tiempo */}
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                              <Clock className="w-4 h-4 flex-shrink-0" />
                              <span className="truncate">{calculateTenure(employee.joinDate)}</span>
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
                <p className="text-slate-600">
                  No se encontraron empleados con los filtros actuales.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
    </RoleGuard>
  )
}