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
  status: string // "active" | "inactive" (por ahora)
  hire_date: string | null
  photo_url: string | null
}

// Relación con obras (para contar proyectos)
type ObraAssignmentRow = {
  employee_id: string
  obra_id: string
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
  status: "Active" | "On Leave" | "Inactive"
  projects: number
  joinDate: string
  avatar: string
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

// ----- Helpers -----

function mapDbStatusToUi(status: string): Employee["status"] {
  const normalized = status.toLowerCase()
  if (normalized === "active") return "Active"
  if (normalized === "inactive") return "Inactive"
  if (normalized === "on_leave" || normalized === "on-leave") return "On Leave"
  return "Inactive"
}

function getStatusColor(status: Employee["status"]) {
  switch (status) {
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

function makeAvatarInitials(name: string): string {
  if (!name) return "??"
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

// Mapeo reutilizable DB → UI
function mapEmployeeRowToEmployee(
  row: EmployeeRow,
  projects: number = 0,
): Employee {
  const uiStatus = mapDbStatusToUi(row.status)
  const department = "Sin departamento asignado" // aún no existe en la tabla
  const location = "Sin ubicación registrada" // aún no existe en la tabla

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
  }
}

// ----- Página principal -----

export default function AdminEmployeesPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [departmentFilter, setDepartmentFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  const [employees, setEmployees] = useState<Employee[]>([])
  const [departments, setDepartments] = useState<string[]>([])
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

  useEffect(() => {
    const fetchEmployees = async () => {
      setLoading(true)
      setError(null)

      try {
        // 1) Leemos empleados con columnas que SÍ existen
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
          console.error("Error fetching employees:", empError)
          setError("No se pudieron cargar los empleados.")
          setEmployees([])
          setLoading(false)
          return
        }

        const rows = (empData || []) as EmployeeRow[]

        if (rows.length === 0) {
          setEmployees([])
          setDepartments([])
          setLoading(false)
          return
        }

        const employeeIds = rows.map((e) => e.id)

        // 2) Contamos proyectos activos por empleado vía obra_assignments
        const { data: assignData, error: assignError } = await supabase
          .from("obra_assignments")
          .select("employee_id, obra_id, obras(status)")
          .in("employee_id", employeeIds)

        if (assignError) {
          console.error("Error fetching obra_assignments:", assignError)
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

          const normalized = status?.toLowerCase() || ""

          // No contamos obras cerradas
          if (normalized === "closed") return

          projectsMap[a.employee_id] = (projectsMap[a.employee_id] || 0) + 1
        })

        // 3) Mapeamos a tipo Employee para la UI
        const mapped: Employee[] = rows.map((row) =>
          mapEmployeeRowToEmployee(row, projectsMap[row.id] || 0),
        )

        setEmployees(mapped)

        // 4) Departamentos únicos para el filtro (cuando exista ese dato)
        const uniqueDeps = Array.from(
          new Set(
            mapped
              .map((e) => e.department)
              .filter((d) => d && d !== "Sin departamento asignado"),
          ),
        )
        uniqueDeps.sort()
        setDepartments(uniqueDeps)
      } catch (e) {
        console.error(e)
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

      const matchesDepartment =
        departmentFilter === "all" || employee.department === departmentFilter

      const normalizedStatus = employee.status.toLowerCase().replace(" ", "-")
      const matchesStatus =
        statusFilter === "all" || normalizedStatus === statusFilter

      return matchesSearch && matchesDepartment && matchesStatus
    })
  }, [employees, searchQuery, departmentFilter, statusFilter])

  // ----- Handlers para el formulario de creación -----

  const handleChangeNewEmployee = (
    field: keyof NewEmployeeForm,
    value: string,
  ) => {
    setNewEmployee((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleCreateEmployee = async () => {
    if (!newEmployee.full_name.trim()) {
      alert("Full name is required")
      return
    }

    setCreating(true)

    const payload = {
      full_name: newEmployee.full_name.trim(),
      email: newEmployee.email.trim() || null,
      phone: newEmployee.phone.trim() || null,
      position_title: newEmployee.position_title.trim() || null,
      status: newEmployee.status, // "active" | "inactive"
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
            email,
            phone,
            position_title,
            status,
            hire_date,
            photo_url
          `,
        )

      if (error) {
        console.error("Error creating employee:", error)
        alert("Could not create the employee.")
        return
      }

      const insertedRows = (data || []) as EmployeeRow[]
      if (insertedRows.length > 0) {
        const createdRow = insertedRows[0]
        const uiEmployee = mapEmployeeRowToEmployee(createdRow, 0)

        // Lo agregamos al inicio de la lista
        setEmployees((prev) => [uiEmployee, ...prev])
      }

      // Reset form y cerrar popup
      setNewEmployee({
        full_name: "",
        email: "",
        phone: "",
        position_title: "",
        status: "active",
        hire_date: "",
      })
      setShowCreateForm(false)
    } catch (e) {
      console.error(e)
      alert("Unexpected error creating employee.")
    } finally {
      setCreating(false)
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              Employee Directory
            </h1>
            <p className="text-slate-600 mt-1">
              Manage and view all company employees
            </p>
          </div>

          {/* Botón + Popup */}
          <Dialog open={showCreateForm} onOpenChange={setShowCreateForm}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Employee
              </Button>
            </DialogTrigger>

            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add Employee</DialogTitle>
                <DialogDescription>
                  Register a new employee in the company directory.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6 py-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="full_name">Full Name</Label>
                    <Input
                      id="full_name"
                      value={newEmployee.full_name}
                      onChange={(e) =>
                        handleChangeNewEmployee("full_name", e.target.value)
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="position_title">Position / Role</Label>
                    <Input
                      id="position_title"
                      value={newEmployee.position_title}
                      onChange={(e) =>
                        handleChangeNewEmployee(
                          "position_title",
                          e.target.value,
                        )
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={newEmployee.email}
                      onChange={(e) =>
                        handleChangeNewEmployee("email", e.target.value)
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      value={newEmployee.phone}
                      onChange={(e) =>
                        handleChangeNewEmployee("phone", e.target.value)
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="hire_date">Hire Date</Label>
                    <Input
                      id="hire_date"
                      type="date"
                      value={newEmployee.hire_date}
                      onChange={(e) =>
                        handleChangeNewEmployee("hire_date", e.target.value)
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      value={newEmployee.status}
                      onValueChange={(value) =>
                        handleChangeNewEmployee(
                          "status",
                          value as NewEmployeeForm["status"],
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
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateForm(false)}
                  disabled={creating}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleCreateEmployee}
                  disabled={creating}
                >
                  {creating ? "Saving..." : "Create Employee"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search employees..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Filtro de departamento */}
          <Select
            value={departmentFilter}
            onValueChange={setDepartmentFilter}
          >
            <SelectTrigger className="w-full md:w-48">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map((dep) => (
                <SelectItem key={dep} value={dep}>
                  {dep}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Filtro de status */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full md:w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="on-leave">On Leave</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading && (
          <div className="text-center py-12 text-sm text-slate-500">
            Loading employees...
          </div>
        )}

        {!loading && error && (
          <div className="text-center py-12 text-sm text-red-500">
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredEmployees.map((employee) => (
                <Link
                  key={employee.id}
                  href={`/admin/employees/${employee.id}`}
                >
                  <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                    <CardContent className="p-6">
                      <div className="flex flex-col items-center text-center space-y-4">
                        <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center">
                          <span className="text-2xl font-bold text-blue-600">
                            {employee.avatar}
                          </span>
                        </div>

                        <div className="space-y-1 w-full">
                          <h3 className="font-semibold text-slate-900 text-lg">
                            {employee.name}
                          </h3>
                          <p className="text-sm text-slate-600">
                            {employee.position}
                          </p>
                          <Badge className={getStatusColor(employee.status)}>
                            {employee.status}
                          </Badge>
                        </div>

                        <div className="w-full space-y-2 pt-4 border-t">
                          <div className="flex items-center gap-2 text-sm text-slate-600">
                            <Briefcase className="w-4 h-4 flex-shrink-0" />
                            <span className="truncate">
                              {employee.department}
                            </span>
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
                            <span className="truncate">
                              {employee.location}
                            </span>
                          </div>
                        </div>

                        <div className="w-full pt-4 border-t">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-600">
                              Active Projects
                            </span>
                            <span className="font-semibold text-slate-900">
                              {employee.projects}
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>

            {filteredEmployees.length === 0 && (
              <div className="text-center py-12">
                <p className="text-slate-600">
                  No employees found matching your criteria.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  )
}
