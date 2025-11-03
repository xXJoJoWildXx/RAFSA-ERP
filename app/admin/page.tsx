"use client"

import { useAuth } from "@/lib/auth-context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Building2, Users, FileText, Activity, TrendingUp, TrendingDown } from "lucide-react"
import { AdminLayout } from "@/components/admin-layout"

export default function AdminDashboard() {
  const { user } = useAuth()

  const stats = [
    {
      title: "Active Projects",
      value: "24",
      change: "+12%",
      trend: "up",
      icon: Building2,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      title: "Total Employees",
      value: "156",
      change: "+8%",
      trend: "up",
      icon: Users,
      color: "text-green-600",
      bgColor: "bg-green-50",
    },
    {
      title: "Pending Documents",
      value: "43",
      change: "-5%",
      trend: "down",
      icon: FileText,
      color: "text-orange-600",
      bgColor: "bg-orange-50",
    },
    {
      title: "Recent Activities",
      value: "89",
      change: "+23%",
      trend: "up",
      icon: Activity,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
    },
  ]

  const recentActivities = [
    {
      id: 1,
      user: "Sarah Johnson",
      action: "uploaded a document",
      target: "Building Plans Q4.pdf",
      time: "5 minutes ago",
    },
    {
      id: 2,
      user: "Mike Chen",
      action: "updated project status",
      target: "Downtown Plaza",
      time: "1 hour ago",
    },
    {
      id: 3,
      user: "Emily Davis",
      action: "completed task",
      target: "Safety Inspection",
      time: "2 hours ago",
    },
    {
      id: 4,
      user: "James Wilson",
      action: "added comment",
      target: "Harbor Bridge Project",
      time: "3 hours ago",
    },
  ]

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Welcome back, {user?.name}</h1>
          <p className="text-slate-600 mt-1">Here's what's happening with your projects today.</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat) => {
            const Icon = stat.icon
            const TrendIcon = stat.trend === "up" ? TrendingUp : TrendingDown

            return (
              <Card key={stat.title}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-600">{stat.title}</p>
                      <p className="text-3xl font-bold text-slate-900 mt-2">{stat.value}</p>
                      <div className="flex items-center gap-1 mt-2">
                        <TrendIcon className={`w-4 h-4 ${stat.trend === "up" ? "text-green-600" : "text-red-600"}`} />
                        <span
                          className={`text-sm font-medium ${stat.trend === "up" ? "text-green-600" : "text-red-600"}`}
                        >
                          {stat.change}
                        </span>
                        <span className="text-sm text-slate-500">vs last month</span>
                      </div>
                    </div>
                    <div className={`${stat.bgColor} ${stat.color} p-3 rounded-lg`}>
                      <Icon className="w-6 h-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Recent Activities */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivities.map((activity) => (
                <div key={activity.id} className="flex items-start gap-4 pb-4 border-b last:border-0 last:pb-0">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-semibold text-blue-600">
                      {activity.user
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-900">
                      <span className="font-semibold">{activity.user}</span> {activity.action}{" "}
                      <span className="font-semibold">{activity.target}</span>
                    </p>
                    <p className="text-xs text-slate-500 mt-1">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  )
}
