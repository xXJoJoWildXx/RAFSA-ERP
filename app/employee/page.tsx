"use client"

import { useAuth } from "@/lib/auth-context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { EmployeeLayout } from "@/components/employee-layout"
import { Calendar, MapPin, Phone, Mail, Briefcase, Clock } from "lucide-react"
import { RoleGuard } from "@/lib/role-guard"

export default function EmployeeDashboard() {
  const { user } = useAuth()

  // Nombre a mostrar: si algún día agregas name, lo priorizas;
  // por ahora usamos el email.
  const displayName = (user as any)?.name ?? user?.email ?? "User"

  // Iniciales seguras
  const initials =
    displayName
      .split("@")[0] // si es email, quita el dominio
      .split(/[.\s_]/)
      .filter(Boolean)
      .map((n) => n[0]?.toUpperCase())
      .join("") || "U"

  const personalInfo = {
    position: "Senior Construction Engineer",
    department: "Engineering",
    phone: "+1 (555) 123-4567",
    email: user?.email || "",
    location: "New York Office",
    joinDate: "January 15, 2022",
  }

  const assignedProjects = [
    {
      id: 1,
      name: "Downtown Plaza",
      status: "In Progress",
      role: "Lead Engineer",
      progress: 65,
      deadline: "Dec 31, 2024",
      statusColor: "bg-blue-100 text-blue-700",
    },
    {
      id: 2,
      name: "Harbor Bridge",
      status: "Planning",
      role: "Structural Consultant",
      progress: 25,
      deadline: "Mar 15, 2025",
      statusColor: "bg-yellow-100 text-yellow-700",
    },
    {
      id: 3,
      name: "Riverside Apartments",
      status: "In Progress",
      role: "Site Supervisor",
      progress: 80,
      deadline: "Nov 20, 2024",
      statusColor: "bg-blue-100 text-blue-700",
    },
  ]

  const recentActivities = [
    {
      id: 1,
      action: "Completed safety inspection",
      project: "Downtown Plaza",
      time: "2 hours ago",
      type: "completion",
    },
    {
      id: 2,
      action: "Uploaded progress report",
      project: "Riverside Apartments",
      time: "5 hours ago",
      type: "upload",
    },
    {
      id: 3,
      action: "Attended team meeting",
      project: "Harbor Bridge",
      time: "1 day ago",
      type: "meeting",
    },
    {
      id: 4,
      action: "Updated project timeline",
      project: "Downtown Plaza",
      time: "2 days ago",
      type: "update",
    },
  ]

  return (
    <RoleGuard allowed={["user"]}>
      <EmployeeLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Welcome back, {displayName}</h1>
            <p className="text-slate-600 mt-1">Here's an overview of your work and projects.</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Personal Information */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>Personal Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
                    <span className="text-xl font-bold text-blue-600">
                      {initials}
                    </span>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{displayName}</p>
                    <p className="text-sm text-slate-600">{personalInfo.position}</p>
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t">
                  <div className="flex items-center gap-3 text-sm">
                    <Briefcase className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-600">{personalInfo.department}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Mail className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-600">{personalInfo.email}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-600">{personalInfo.phone}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <MapPin className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-600">{personalInfo.location}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-600">Joined {personalInfo.joinDate}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Assigned Projects */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Assigned Projects</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {assignedProjects.map((project) => (
                    <div
                      key={project.id}
                      className="p-4 border border-slate-200 rounded-lg hover:border-blue-300 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-semibold text-slate-900">{project.name}</h3>
                          <p className="text-sm text-slate-600 mt-1">{project.role}</p>
                        </div>
                        <Badge className={project.statusColor}>{project.status}</Badge>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-600">Progress</span>
                          <span className="font-medium text-slate-900">{project.progress}%</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full transition-all"
                            style={{ width: `${project.progress}%` }}
                          />
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-600 mt-2">
                          <Clock className="w-4 h-4" />
                          <span>Due: {project.deadline}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Activity Feed */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentActivities.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-4 pb-4 border-b last:border-0 last:pb-0">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-1">
                      <div className="w-2 h-2 bg-blue-600 rounded-full" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-900">
                        <span className="font-semibold">{activity.action}</span> for{" "}
                        <span className="font-semibold">{activity.project}</span>
                      </p>
                      <p className="text-xs text-slate-500 mt-1">{activity.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </EmployeeLayout>
    </RoleGuard>
  )
}
