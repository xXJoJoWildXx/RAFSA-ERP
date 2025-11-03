"use client"

import { AdminLayout } from "@/components/admin-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Mail, Phone, MapPin, Briefcase, Calendar, ArrowLeft, Edit, Building2 } from "lucide-react"
import Link from "next/link"

export default function EmployeeDetailPage({ params }: { params: { id: string } }) {
  const employee = {
    id: params.id,
    name: "Sarah Johnson",
    email: "sarah.johnson@construction.com",
    phone: "+1 (555) 234-5678",
    position: "Senior Engineer",
    department: "Engineering",
    location: "New York, NY",
    status: "Active",
    joinDate: "2021-03-20",
    avatar: "SJ",
    bio: "Experienced structural engineer with over 10 years in commercial construction. Specializes in high-rise buildings and complex infrastructure projects.",
  }

  const projects = [
    {
      id: "1",
      name: "Downtown Plaza",
      role: "Lead Engineer",
      status: "In Progress",
      progress: 65,
    },
    {
      id: "2",
      name: "Harbor Bridge",
      role: "Structural Consultant",
      status: "Planning",
      progress: 25,
    },
    {
      id: "3",
      name: "Riverside Apartments",
      role: "Senior Engineer",
      status: "In Progress",
      progress: 80,
    },
    {
      id: "4",
      name: "Tech Campus Expansion",
      role: "Lead Engineer",
      status: "Completed",
      progress: 100,
    },
  ]

  const activities = [
    {
      id: 1,
      action: "Completed safety inspection",
      project: "Downtown Plaza",
      date: "2024-10-25",
    },
    {
      id: 2,
      action: "Uploaded structural plans",
      project: "Harbor Bridge",
      date: "2024-10-23",
    },
    {
      id: 3,
      action: "Attended project meeting",
      project: "Riverside Apartments",
      date: "2024-10-20",
    },
    {
      id: 4,
      action: "Submitted progress report",
      project: "Downtown Plaza",
      date: "2024-10-18",
    },
  ]

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

  const getProjectStatusColor = (status: string) => {
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
          <div className="flex items-center gap-4">
            <Link href="/admin/employees">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">{employee.name}</h1>
              <p className="text-slate-600 mt-1">{employee.position}</p>
            </div>
          </div>
          <Button>
            <Edit className="w-4 h-4 mr-2" />
            Edit Profile
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-24 h-24 rounded-full bg-blue-100 flex items-center justify-center">
                  <span className="text-3xl font-bold text-blue-600">{employee.avatar}</span>
                </div>

                <div className="space-y-1">
                  <h3 className="font-semibold text-slate-900 text-xl">{employee.name}</h3>
                  <p className="text-sm text-slate-600">{employee.position}</p>
                  <Badge className={getStatusColor(employee.status)}>{employee.status}</Badge>
                </div>

                <div className="w-full space-y-3 pt-4 border-t text-left">
                  <div className="flex items-center gap-3 text-sm">
                    <Briefcase className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="text-slate-600">{employee.department}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="text-slate-600 break-all">{employee.email}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="text-slate-600">{employee.phone}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="text-slate-600">{employee.location}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="text-slate-600">Joined {employee.joinDate}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="lg:col-span-2">
            <Tabs defaultValue="overview" className="space-y-6">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="projects">Projects</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
              </TabsList>

              <TabsContent value="overview">
                <Card>
                  <CardHeader>
                    <CardTitle>About</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-slate-600">{employee.bio}</p>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="projects">
                <Card>
                  <CardHeader>
                    <CardTitle>Assigned Projects</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {projects.map((project) => (
                        <div
                          key={project.id}
                          className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:border-blue-300 transition-colors"
                        >
                          <div className="flex items-start gap-3 flex-1">
                            <Building2 className="w-5 h-5 text-blue-600 mt-1" />
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-medium text-slate-900">{project.name}</h4>
                                <Badge className={getProjectStatusColor(project.status)}>{project.status}</Badge>
                              </div>
                              <p className="text-sm text-slate-600 mb-2">{project.role}</p>
                              <div className="flex items-center gap-2">
                                <div className="flex-1 bg-slate-200 rounded-full h-2 max-w-xs">
                                  <div
                                    className="bg-blue-600 h-2 rounded-full transition-all"
                                    style={{ width: `${project.progress}%` }}
                                  />
                                </div>
                                <span className="text-xs text-slate-600">{project.progress}%</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="activity">
                <Card>
                  <CardHeader>
                    <CardTitle>Recent Activity</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {activities.map((activity) => (
                        <div key={activity.id} className="flex items-start gap-4 pb-4 border-b last:border-0">
                          <div className="w-2 h-2 bg-blue-600 rounded-full mt-2" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-slate-900">{activity.action}</p>
                            <p className="text-sm text-slate-600 mt-1">Project: {activity.project}</p>
                            <p className="text-xs text-slate-500 mt-1">{activity.date}</p>
                          </div>
                        </div>
                      ))}
                    </div>
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
