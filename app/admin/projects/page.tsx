"use client"

import { useState } from "react"
import { AdminLayout } from "@/components/admin-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, Plus, Eye, MapPin, Calendar } from "lucide-react"
import Link from "next/link"

type Project = {
  id: string
  name: string
  location: string
  status: "Planning" | "In Progress" | "Completed" | "On Hold"
  progress: number
  startDate: string
  endDate: string
  budget: string
  spent: string
  manager: string
  teamSize: number
}

export default function AdminProjectsPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  const projects: Project[] = [
    {
      id: "1",
      name: "Downtown Plaza",
      location: "New York, NY",
      status: "In Progress",
      progress: 65,
      startDate: "2024-01-15",
      endDate: "2024-12-31",
      budget: "$5,200,000",
      spent: "$3,380,000",
      manager: "John Smith",
      teamSize: 24,
    },
    {
      id: "2",
      name: "Harbor Bridge",
      location: "San Francisco, CA",
      status: "Planning",
      progress: 25,
      startDate: "2024-06-01",
      endDate: "2025-03-15",
      budget: "$12,500,000",
      spent: "$3,125,000",
      manager: "Sarah Johnson",
      teamSize: 18,
    },
    {
      id: "3",
      name: "Riverside Apartments",
      location: "Portland, OR",
      status: "In Progress",
      progress: 80,
      startDate: "2023-09-01",
      endDate: "2024-11-20",
      budget: "$8,900,000",
      spent: "$7,120,000",
      manager: "Mike Chen",
      teamSize: 32,
    },
    {
      id: "4",
      name: "Tech Campus Expansion",
      location: "Austin, TX",
      status: "Completed",
      progress: 100,
      startDate: "2023-03-01",
      endDate: "2024-08-30",
      budget: "$15,000,000",
      spent: "$14,750,000",
      manager: "Emily Davis",
      teamSize: 45,
    },
    {
      id: "5",
      name: "Metro Station Renovation",
      location: "Boston, MA",
      status: "On Hold",
      progress: 40,
      startDate: "2024-02-01",
      endDate: "2024-10-15",
      budget: "$6,800,000",
      spent: "$2,720,000",
      manager: "James Wilson",
      teamSize: 15,
    },
  ]

  const filteredProjects = projects.filter((project) => {
    const matchesSearch =
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.location.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === "all" || project.status.toLowerCase().replace(" ", "-") === statusFilter
    return matchesSearch && matchesStatus
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case "In Progress":
        return "bg-blue-100 text-blue-700"
      case "Planning":
        return "bg-yellow-100 text-yellow-700"
      case "Completed":
        return "bg-green-100 text-green-700"
      case "On Hold":
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
            <h1 className="text-3xl font-bold text-slate-900">Project Management</h1>
            <p className="text-slate-600 mt-1">Manage and track all construction projects</p>
          </div>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            New Project
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
              <CardTitle>All Projects</CardTitle>
              <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                <div className="relative flex-1 md:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Search projects..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-40">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="in-progress">In Progress</SelectItem>
                    <SelectItem value="planning">Planning</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="on-hold">On Hold</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project Name</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Budget</TableHead>
                    <TableHead>Manager</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProjects.map((project) => (
                    <TableRow key={project.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-slate-900">{project.name}</p>
                          <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                            <Calendar className="w-3 h-3" />
                            {project.startDate} - {project.endDate}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-slate-600">
                          <MapPin className="w-4 h-4" />
                          {project.location}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(project.status)}>{project.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-600">{project.progress}%</span>
                          </div>
                          <div className="w-24 bg-slate-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full transition-all"
                              style={{ width: `${project.progress}%` }}
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium text-slate-900">{project.budget}</p>
                          <p className="text-xs text-slate-500">Spent: {project.spent}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-600">{project.manager}</TableCell>
                      <TableCell className="text-right">
                        <Link href={`/admin/projects/${project.id}`}>
                          <Button variant="ghost" size="icon">
                            <Eye className="w-4 h-4" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  )
}
