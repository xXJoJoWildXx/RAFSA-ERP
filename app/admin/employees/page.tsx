"use client"

import { useState } from "react"
import { AdminLayout } from "@/components/admin-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, Plus, Mail, Phone, MapPin, Briefcase } from "lucide-react"
import Link from "next/link"

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

export default function AdminEmployeesPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [departmentFilter, setDepartmentFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  const employees: Employee[] = [
    {
      id: "1",
      name: "John Smith",
      email: "john.smith@construction.com",
      phone: "+1 (555) 123-4567",
      position: "Project Manager",
      department: "Management",
      location: "New York, NY",
      status: "Active",
      projects: 3,
      joinDate: "2022-01-15",
      avatar: "JS",
    },
    {
      id: "2",
      name: "Sarah Johnson",
      email: "sarah.johnson@construction.com",
      phone: "+1 (555) 234-5678",
      position: "Senior Engineer",
      department: "Engineering",
      location: "New York, NY",
      status: "Active",
      projects: 4,
      joinDate: "2021-03-20",
      avatar: "SJ",
    },
    {
      id: "3",
      name: "Mike Chen",
      email: "mike.chen@construction.com",
      phone: "+1 (555) 345-6789",
      position: "Site Supervisor",
      department: "Operations",
      location: "San Francisco, CA",
      status: "Active",
      projects: 2,
      joinDate: "2022-06-10",
      avatar: "MC",
    },
    {
      id: "4",
      name: "Emily Davis",
      email: "emily.davis@construction.com",
      phone: "+1 (555) 456-7890",
      position: "Safety Officer",
      department: "Safety",
      location: "Portland, OR",
      status: "Active",
      projects: 5,
      joinDate: "2020-09-05",
      avatar: "ED",
    },
    {
      id: "5",
      name: "James Wilson",
      email: "james.wilson@construction.com",
      phone: "+1 (555) 567-8901",
      position: "Quality Control Specialist",
      department: "Quality Assurance",
      location: "Boston, MA",
      status: "On Leave",
      projects: 1,
      joinDate: "2023-02-14",
      avatar: "JW",
    },
    {
      id: "6",
      name: "Lisa Anderson",
      email: "lisa.anderson@construction.com",
      phone: "+1 (555) 678-9012",
      position: "Structural Engineer",
      department: "Engineering",
      location: "New York, NY",
      status: "Active",
      projects: 3,
      joinDate: "2021-11-30",
      avatar: "LA",
    },
    {
      id: "7",
      name: "David Martinez",
      email: "david.martinez@construction.com",
      phone: "+1 (555) 789-0123",
      position: "Architect",
      department: "Design",
      location: "Austin, TX",
      status: "Active",
      projects: 2,
      joinDate: "2022-04-18",
      avatar: "DM",
    },
    {
      id: "8",
      name: "Jennifer Lee",
      email: "jennifer.lee@construction.com",
      phone: "+1 (555) 890-1234",
      position: "HR Manager",
      department: "Human Resources",
      location: "New York, NY",
      status: "Active",
      projects: 0,
      joinDate: "2020-07-22",
      avatar: "JL",
    },
  ]

  const filteredEmployees = employees.filter((employee) => {
    const matchesSearch =
      employee.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      employee.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      employee.position.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesDepartment = departmentFilter === "all" || employee.department === departmentFilter
    const matchesStatus = statusFilter === "all" || employee.status.toLowerCase().replace(" ", "-") === statusFilter
    return matchesSearch && matchesDepartment && matchesStatus
  })

  const getStatusColor = (status: string) => {
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

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Employee Directory</h1>
            <p className="text-slate-600 mt-1">Manage and view all company employees</p>
          </div>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Add Employee
          </Button>
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
          <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
            <SelectTrigger className="w-full md:w-48">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              <SelectItem value="Management">Management</SelectItem>
              <SelectItem value="Engineering">Engineering</SelectItem>
              <SelectItem value="Operations">Operations</SelectItem>
              <SelectItem value="Safety">Safety</SelectItem>
              <SelectItem value="Quality Assurance">Quality Assurance</SelectItem>
              <SelectItem value="Design">Design</SelectItem>
              <SelectItem value="Human Resources">Human Resources</SelectItem>
            </SelectContent>
          </Select>
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredEmployees.map((employee) => (
            <Link key={employee.id} href={`/admin/employees/${employee.id}`}>
              <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                <CardContent className="p-6">
                  <div className="flex flex-col items-center text-center space-y-4">
                    <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center">
                      <span className="text-2xl font-bold text-blue-600">{employee.avatar}</span>
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
                        <span className="text-slate-600">Active Projects</span>
                        <span className="font-semibold text-slate-900">{employee.projects}</span>
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
            <p className="text-slate-600">No employees found matching your criteria.</p>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
