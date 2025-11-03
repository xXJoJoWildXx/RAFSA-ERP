"use client"

import { useState } from "react"
import { EmployeeLayout } from "@/components/employee-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Search, FileText, Download, Eye, CheckCircle, XCircle, Clock } from "lucide-react"

type Document = {
  id: string
  name: string
  type: string
  size: string
  uploadDate: string
  status: "Pending" | "Approved" | "Rejected"
  version: string
  project: string
}

export default function EmployeeDocumentsPage() {
  const [searchQuery, setSearchQuery] = useState("")

  const documents: Document[] = [
    {
      id: "1",
      name: "Building Plans Q4.pdf",
      type: "PDF",
      size: "2.4 MB",
      uploadDate: "2024-10-25",
      status: "Approved",
      version: "v2.1",
      project: "Downtown Plaza",
    },
    {
      id: "3",
      name: "Material Specifications.xlsx",
      type: "XLSX",
      size: "856 KB",
      uploadDate: "2024-10-23",
      status: "Approved",
      version: "v1.3",
      project: "Riverside Apartments",
    },
    {
      id: "5",
      name: "Progress Report October.pdf",
      type: "PDF",
      size: "3.2 MB",
      uploadDate: "2024-10-21",
      status: "Approved",
      version: "v1.0",
      project: "Downtown Plaza",
    },
  ]

  const filteredDocuments = documents.filter(
    (doc) =>
      doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.project.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "Approved":
        return <CheckCircle className="w-4 h-4" />
      case "Rejected":
        return <XCircle className="w-4 h-4" />
      case "Pending":
        return <Clock className="w-4 h-4" />
      default:
        return null
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Approved":
        return "bg-green-100 text-green-700"
      case "Rejected":
        return "bg-red-100 text-red-700"
      case "Pending":
        return "bg-yellow-100 text-yellow-700"
      default:
        return "bg-slate-100 text-slate-700"
    }
  }

  return (
    <EmployeeLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">My Documents</h1>
          <p className="text-slate-600 mt-1">Access and download project documents</p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
              <CardTitle>Available Documents</CardTitle>
              <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search documents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Document Name</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDocuments.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-blue-600" />
                          <div>
                            <p className="font-medium text-slate-900">{doc.name}</p>
                            <p className="text-xs text-slate-500">
                              {doc.type} • {doc.size}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-600">{doc.project}</TableCell>
                      <TableCell className="text-slate-600">{doc.uploadDate}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{doc.version}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(doc.status)}>
                          <span className="flex items-center gap-1">
                            {getStatusIcon(doc.status)}
                            {doc.status}
                          </span>
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon">
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon">
                            <Download className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </EmployeeLayout>
  )
}
