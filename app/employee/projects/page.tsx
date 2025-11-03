"use client"

import { useState } from "react"
import { EmployeeLayout } from "@/components/employee-layout"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Search, MapPin, Calendar, Eye } from "lucide-react"
import Link from "next/link"

type Project = {
  id: string
  name: string
  location: string
  status: "Planning" | "In Progress" | "Completed" | "On Hold"
  progress: number
  role: string
  startDate: string
  endDate: string
}

export default function EmployeeProjectsPage() {
  const [searchQuery, setSearchQuery] = useState("")

  const projects: Project[] = [
    {
      id: "1",
      name: "Downtown Plaza",
      location: "New York, NY",
      status: "In Progress",
      progress: 65,
      role: "Lead Engineer",
      startDate: "2024-01-15",
      endDate: "2024-12-31",
    },
    {
      id: "2",
      name: "Harbor Bridge",
      location: "San Francisco, CA",
      status: "Planning",
      progress: 25,
      role: "Structural Consultant",
      startDate: "2024-06-01",
      endDate: "2025-03-15",
    },
    {
      id: "3",
      name: "Riverside Apartments",
      location: "Portland, OR",
      status: "In Progress",
      progress: 80,
      role: "Site Supervisor",
      startDate: "2023-09-01",
      endDate: "2024-11-20",
    },
  ]

  const filteredProjects = projects.filter(
    (project) =>
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.location.toLowerCase().includes(searchQuery.toLowerCase()),
  )

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
    <EmployeeLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">My Projects</h1>
          <p className="text-slate-600 mt-1">View and track your assigned projects</p>
        </div>

        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project) => (
            <Card key={project.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{project.name}</CardTitle>
                    <div className="flex items-center gap-1 text-sm text-slate-600 mt-2">
                      <MapPin className="w-4 h-4" />
                      {project.location}
                    </div>
                  </div>
                  <Badge className={getStatusColor(project.status)}>{project.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-slate-600 mb-1">Your Role</p>
                  <p className="text-sm text-slate-900">{project.role}</p>
                </div>

                <div>
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-slate-600">Progress</span>
                    <span className="font-medium text-slate-900">{project.progress}%</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all"
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 text-sm text-slate-600 pt-2 border-t">
                  <Calendar className="w-4 h-4" />
                  <span>
                    {project.startDate} - {project.endDate}
                  </span>
                </div>

                <Link href={`/employee/projects/${project.id}`}>
                  <Button variant="outline" className="w-full bg-transparent">
                    <Eye className="w-4 h-4 mr-2" />
                    View Details
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </EmployeeLayout>
  )
}
