"use client"

import { EmployeeLayout } from "@/components/employee-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { MapPin, ArrowLeft, CheckCircle2, Clock, AlertCircle } from "lucide-react"
import Link from "next/link"

export default function EmployeeProjectDetailPage({ params }: { params: { id: string } }) {
  const project = {
    id: params.id,
    name: "Downtown Plaza",
    location: "New York, NY",
    status: "In Progress",
    progress: 65,
    role: "Lead Engineer",
    startDate: "2024-01-15",
    endDate: "2024-12-31",
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
        <div className="flex items-center gap-4">
          <Link href="/employee/projects">
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
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
                  <p className="text-sm font-medium text-slate-600">Your Role</p>
                  <p className="text-sm text-slate-900 mt-1">{project.role}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-600">Status</p>
                  <Badge className={`${getStatusColor(project.status)} mt-1`}>{project.status}</Badge>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-600">Start Date</p>
                  <p className="text-sm text-slate-900 mt-1">{project.startDate}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-600">End Date</p>
                  <p className="text-sm text-slate-900 mt-1">{project.endDate}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="text-center">
                  <p className="text-4xl font-bold text-blue-600">{project.progress}%</p>
                  <p className="text-sm text-slate-600 mt-1">Overall Progress</p>
                </div>
                <Progress value={project.progress} className="h-3" />
              </div>
            </CardContent>
          </Card>
        </div>

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
      </div>
    </EmployeeLayout>
  )
}
