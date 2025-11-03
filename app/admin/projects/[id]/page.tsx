"use client"

import { AdminLayout } from "@/components/admin-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MapPin, DollarSign, Users, Clock, ArrowLeft, Edit, CheckCircle2, AlertCircle } from "lucide-react"
import Link from "next/link"

export default function ProjectDetailPage({ params }: { params: { id: string } }) {
  // Mock project data
  const project = {
    id: params.id,
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
    description:
      "A comprehensive mixed-use development project featuring retail spaces, office buildings, and public amenities in the heart of downtown.",
  }

  const milestones = [
    { id: 1, name: "Site Preparation", status: "completed", date: "2024-02-15", progress: 100 },
    { id: 2, name: "Foundation Work", status: "completed", date: "2024-04-30", progress: 100 },
    { id: 3, name: "Structural Framework", status: "in-progress", date: "2024-08-15", progress: 75 },
    { id: 4, name: "Interior Construction", status: "pending", date: "2024-10-30", progress: 0 },
    { id: 5, name: "Final Inspection", status: "pending", date: "2024-12-20", progress: 0 },
  ]

  const teamMembers = [
    { id: 1, name: "John Smith", role: "Project Manager", avatar: "JS" },
    { id: 2, name: "Sarah Johnson", role: "Lead Engineer", avatar: "SJ" },
    { id: 3, name: "Mike Chen", role: "Site Supervisor", avatar: "MC" },
    { id: 4, name: "Emily Davis", role: "Safety Officer", avatar: "ED" },
    { id: 5, name: "James Wilson", role: "Quality Control", avatar: "JW" },
  ]

  const recentActivities = [
    { id: 1, action: "Milestone completed", detail: "Foundation Work finished ahead of schedule", time: "2 days ago" },
    { id: 2, action: "Document uploaded", detail: "Updated structural plans v2.1", time: "5 days ago" },
    { id: 3, action: "Team member added", detail: "Emily Davis joined as Safety Officer", time: "1 week ago" },
    { id: 4, action: "Budget updated", detail: "Additional $200,000 allocated for materials", time: "2 weeks ago" },
  ]

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
          <div className="flex items-center gap-4">
            <Link href="/admin/projects">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">{project.name}</h1>
              <div className="flex items-center gap-2 mt-1">
                <MapPin className="w-4 h-4 text-slate-500" />
                <span className="text-slate-600">{project.location}</span>
              </div>
            </div>
          </div>
          <Button>
            <Edit className="w-4 h-4 mr-2" />
            Edit Project
          </Button>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Status</p>
                  <Badge className={`${getStatusColor(project.status)} mt-2`}>{project.status}</Badge>
                </div>
                <div className="p-3 bg-blue-50 rounded-lg">
                  <Clock className="w-5 h-5 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Progress</p>
                  <p className="text-2xl font-bold text-slate-900 mt-2">{project.progress}%</p>
                </div>
                <div className="p-3 bg-green-50 rounded-lg">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Budget</p>
                  <p className="text-2xl font-bold text-slate-900 mt-2">{project.budget}</p>
                  <p className="text-xs text-slate-500 mt-1">Spent: {project.spent}</p>
                </div>
                <div className="p-3 bg-purple-50 rounded-lg">
                  <DollarSign className="w-5 h-5 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Team Size</p>
                  <p className="text-2xl font-bold text-slate-900 mt-2">{project.teamSize}</p>
                  <p className="text-xs text-slate-500 mt-1">Active members</p>
                </div>
                <div className="p-3 bg-orange-50 rounded-lg">
                  <Users className="w-5 h-5 text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="milestones">Milestones</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Project Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-slate-600">Description</p>
                  <p className="text-sm text-slate-900 mt-1">{project.description}</p>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div>
                    <p className="text-sm font-medium text-slate-600">Start Date</p>
                    <p className="text-sm text-slate-900 mt-1">{project.startDate}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-600">End Date</p>
                    <p className="text-sm text-slate-900 mt-1">{project.endDate}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-600">Project Manager</p>
                    <p className="text-sm text-slate-900 mt-1">{project.manager}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-600">Location</p>
                    <p className="text-sm text-slate-900 mt-1">{project.location}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Budget Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-600">Total Spent</span>
                      <span className="text-sm font-bold text-slate-900">65%</span>
                    </div>
                    <Progress value={65} className="h-2" />
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                    <div>
                      <p className="text-sm text-slate-600">Total Budget</p>
                      <p className="text-lg font-bold text-slate-900">{project.budget}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-600">Remaining</p>
                      <p className="text-lg font-bold text-green-600">$1,820,000</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="milestones">
            <Card>
              <CardHeader>
                <CardTitle>Project Milestones</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {milestones.map((milestone) => (
                    <div key={milestone.id} className="flex items-start gap-4 pb-4 border-b last:border-0">
                      <div className="mt-1">
                        {milestone.status === "completed" ? (
                          <CheckCircle2 className="w-5 h-5 text-green-600" />
                        ) : milestone.status === "in-progress" ? (
                          <Clock className="w-5 h-5 text-blue-600" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-slate-400" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium text-slate-900">{milestone.name}</h4>
                          <span className="text-sm text-slate-600">{milestone.date}</span>
                        </div>
                        <Progress value={milestone.progress} className="h-2" />
                        <p className="text-xs text-slate-500 mt-1">{milestone.progress}% complete</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="team">
            <Card>
              <CardHeader>
                <CardTitle>Team Members</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {teamMembers.map((member) => (
                    <div key={member.id} className="flex items-center gap-3 p-4 border border-slate-200 rounded-lg">
                      <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                        <span className="text-sm font-bold text-blue-600">{member.avatar}</span>
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{member.name}</p>
                        <p className="text-sm text-slate-600">{member.role}</p>
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
                  {recentActivities.map((activity) => (
                    <div key={activity.id} className="flex items-start gap-4 pb-4 border-b last:border-0">
                      <div className="w-2 h-2 bg-blue-600 rounded-full mt-2" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-900">{activity.action}</p>
                        <p className="text-sm text-slate-600 mt-1">{activity.detail}</p>
                        <p className="text-xs text-slate-500 mt-1">{activity.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  )
}
