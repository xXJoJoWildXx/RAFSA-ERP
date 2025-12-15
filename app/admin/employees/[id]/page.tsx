"use client"

import { useEffect, useState } from "react"
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

// ----- Tipos reales de la DB -----

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
  statusUi: "Active" | "Inactive" | "On Leave"
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

// ----- Helpers -----

function mapDbStatusToUi(status: string): EmployeeDetail["statusUi"] {
  const normalized = status?.toLowerCase()
  if (normalized === "active") return "Active"
  if (normalized === "inactive") return "Inactive"
  if (normalized === "on_leave" || normalized === "on-leave") return "On Leave"
  return "Inactive"
}

function getStatusColor(statusUi: EmployeeDetail["statusUi"]) {
  switch (statusUi) {
    case "Active":
      return "bg-green-100 text-green-700"
    case "On Leave":
      return "bg-yellow-100 text-yellow-700"
    case "Inactive":
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
  if (!dateString) return "Not specified"
  const d = new Date(dateString)
  if (Number.isNaN(d.getTime())) return dateString
  return d.toLocaleDateString("es-MX", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  })
}

function mapRowToDetail(row: EmployeeRow): EmployeeDetail {
  const statusUi = mapDbStatusToUi(row.status)
  const baseSalary =
    row.base_salary !== null && row.base_salary !== undefined
      ? Number(row.base_salary)
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
      return "bg-emerald-100 text-emerald-700" // casi no se verá porque la filtramos, pero por si acaso
    default:
      return "bg-slate-100 text-slate-700"
  }
}

function formatObraStatus(status: string | null) {
  const normalized = status?.toLowerCase() || ""

  switch (normalized) {
    case "planned":
      return "Planned"
    case "in_progress":
      return "In progress"
    case "paused":
      return "Paused"
    case "closed":
      return "Closed"
    default:
      return status ?? "Unknown"
  }
}

// ----- Page -----

export default function EmployeeDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params?.id

  const [employee, setEmployee] = useState<EmployeeDetail | null>(null)
  const [projects, setProjects] = useState<AssignedObra[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Edit popup state
  const [editOpen, setEditOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editForm, setEditForm] = useState<EditEmployeeForm | null>(null)

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

          // Mapear a tipo de UI y filtrar solo obras "activas":
          const mappedProjects: AssignedObra[] = rows
            .map((row) => {
              const raw = row.obras
              let obra: ObraRow | null = null

              // Supabase a veces manda objeto y a veces arreglo
              if (Array.isArray(raw)) {
                obra = raw[0] ?? null
              } else {
                obra = raw
              }

              if (!obra) return null

              const status = obra.status ?? null
              const normalized = status?.toLowerCase() || ""

              // Filtrar fuera las cerradas
              if (normalized === "closed") {
                return null
              }

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

  // Inicializar form al abrir el popup
  const handleOpenChange = (open: boolean) => {
    setEditOpen(open)
    if (open && employee) {
      setEditForm({
        full_name: employee.name ?? "",
        email: employee.email ?? "",
        phone: employee.phone ?? "",
        position_title: employee.position ?? "",
        status: employee.statusRaw === "inactive" ? "inactive" : "active",
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
      alert("Full name is required")
      return
    }

    setSaving(true)

    const payload = {
      full_name: editForm.full_name.trim(),
      email: editForm.email.trim() || null,
      phone: editForm.phone.trim() || null,
      position_title: editForm.position_title.trim() || null,
      status: editForm.status, // "active" | "inactive"
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
        alert("Could not update the employee.")
        return
      }

      const updatedRow = data as EmployeeRow
      const mapped = mapRowToDetail(updatedRow)
      setEmployee(mapped)
      setEditOpen(false)
    } catch (e) {
      console.error(e)
      alert("Unexpected error updating employee.")
    } finally {
      setSaving(false)
    }
  }

  // ----- UI states -----

  if (!id) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-[60vh] text-sm text-slate-500">
          Invalid employee id.
        </div>
      </AdminLayout>
    )
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-[60vh] text-sm text-slate-500">
          Loading employee...
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
            Error loading employee
          </h1>
          <p className="text-sm text-slate-600">
            {error ?? "Employee not found."}
          </p>
          <Button className="mt-4" onClick={() => router.push("/admin/employees")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to employees
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
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">
                {employee.name}
              </h1>
              <p className="text-slate-600 mt-1">
                {employee.position ?? "Position not specified"}
              </p>
            </div>
          </div>

          {/* Edit popup */}
          <Dialog open={editOpen} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
              <Button>
                <Edit className="w-4 h-4 mr-2" />
                Edit Profile
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Edit Employee</DialogTitle>
                <DialogDescription>
                  Update the employee&apos;s personal and payroll information.
                </DialogDescription>
              </DialogHeader>

              {editForm && (
                <div className="space-y-6 py-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="full_name">Full Name</Label>
                      <Input
                        id="full_name"
                        value={editForm.full_name}
                        onChange={(e) =>
                          handleEditChange("full_name", e.target.value)
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="position_title">Position / Role</Label>
                      <Input
                        id="position_title"
                        value={editForm.position_title}
                        onChange={(e) =>
                          handleEditChange("position_title", e.target.value)
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
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
                      <Label htmlFor="phone">Phone</Label>
                      <Input
                        id="phone"
                        value={editForm.phone}
                        onChange={(e) =>
                          handleEditChange("phone", e.target.value)
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="hire_date">Hire Date</Label>
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
                      <Label>Status</Label>
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
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="imss_number">IMSS Number</Label>
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
                      <Label htmlFor="birth_date">Birth Date</Label>
                      <Input
                        id="birth_date"
                        type="date"
                        value={editForm.birth_date ?? ""}
                        onChange={(e) =>
                          handleEditChange("birth_date", e.target.value)
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="base_salary">Base Salary (MXN)</Label>
                      <Input
                        id="base_salary"
                        type="number"
                        step="0.01"
                        value={editForm.base_salary}
                        onChange={(e) =>
                          handleEditChange("base_salary", e.target.value)
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="overtime_hour_cost">
                        Overtime Hour Cost (MXN)
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

                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="emergency_contact">
                        Emergency Contact
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
                </div>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button type="button" onClick={handleSave} disabled={saving}>
                  {saving ? "Saving..." : "Save changes"}
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
                <div className="w-24 h-24 rounded-full bg-blue-100 flex items-center justify-center">
                  <span className="text-3xl font-bold text-blue-600">
                    {employee.avatar}
                  </span>
                </div>

                <div className="space-y-1">
                  <h3 className="font-semibold text-slate-900 text-xl">
                    {employee.name}
                  </h3>
                  <p className="text-sm text-slate-600">
                    {employee.position ?? "Position not specified"}
                  </p>
                  <Badge className={getStatusColor(employee.statusUi)}>
                    {employee.statusUi}
                  </Badge>
                </div>

                <div className="w-full space-y-3 pt-4 border-t text-left">
                  <div className="flex items-center gap-3 text-sm">
                    <Briefcase className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="text-slate-600">
                      {/* department aún no existe en la tabla */}
                      Department not specified
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="text-slate-600 break-all">
                      {employee.email ?? "No email"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="text-slate-600">
                      {employee.phone ?? "No phone"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="text-slate-600">
                      {/* location aún no existe en la tabla */}
                      Location not specified
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="text-slate-600">
                      Hired {formatDate(employee.joinDate)}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* RIGHT: tabs */}
          <div className="lg:col-span-2">
            <Tabs defaultValue="overview" className="space-y-6">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="projects">Projects</TabsTrigger>
              </TabsList>

              {/* OVERVIEW */}
              <TabsContent value="overview">
                <Card>
                  <CardHeader>
                    <CardTitle>Employment & Payroll Info</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div className="space-y-1">
                        <p className="text-slate-500">IMSS Number</p>
                        <p className="font-medium text-slate-900">
                          {employee.imss_number ?? "Not registered"}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-slate-500">RFC</p>
                        <p className="font-medium text-slate-900">
                          {employee.rfc ?? "Not registered"}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-slate-500">Birth Date</p>
                        <p className="font-medium text-slate-900">
                          {formatDate(employee.birth_date)}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-slate-500">Base Salary</p>
                        <p className="font-medium text-slate-900">
                          {`$${employee.base_salary.toLocaleString("es-MX", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })} MXN`}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-slate-500">Overtime Hour Cost</p>
                        <p className="font-medium text-slate-900">
                          {`$${employee.overtime_hour_cost.toLocaleString(
                            "es-MX",
                            {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            },
                          )} MXN`}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-slate-500">Emergency Contact</p>
                        <p className="font-medium text-slate-900">
                          {employee.emergency_contact ?? "Not specified"}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-slate-500">Status (raw DB)</p>
                        <p className="font-medium text-slate-900">
                          {employee.statusRaw}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-slate-500">Record created at</p>
                        <p className="font-medium text-slate-900">
                          {formatDate(employee.created_at)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* PROJECTS */}
              <TabsContent value="projects">
                <Card>
                  <CardHeader>
                    <CardTitle>Assigned Works (Obras)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {projects.length === 0 ? (
                      <p className="text-sm text-slate-600">
                        This employee has no active works assigned.
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
                                    <Badge className={getObraStatusColor(project.status)}>
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
