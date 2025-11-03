"use client"

import { useState } from "react"
import { AdminLayout } from "@/components/admin-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Upload, Search, FileText, Download, Eye, CheckCircle, XCircle, Clock, MessageSquare } from "lucide-react"
import { DocumentUpload } from "@/components/document-upload"
import { DocumentAIAssistant } from "@/components/document-ai-assistant"

type Document = {
  id: string
  name: string
  type: string
  size: string
  uploadedBy: string
  uploadDate: string
  status: "Pending" | "Approved" | "Rejected"
  version: string
  project: string
}

export default function AdminDocumentsPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [showAI, setShowAI] = useState(false)

  const documents: Document[] = [
    {
      id: "1",
      name: "Building Plans Q4.pdf",
      type: "PDF",
      size: "2.4 MB",
      uploadedBy: "Sarah Johnson",
      uploadDate: "2024-10-25",
      status: "Approved",
      version: "v2.1",
      project: "Downtown Plaza",
    },
    {
      id: "2",
      name: "Safety Inspection Report.docx",
      type: "DOCX",
      size: "1.2 MB",
      uploadedBy: "Mike Chen",
      uploadDate: "2024-10-24",
      status: "Pending",
      version: "v1.0",
      project: "Harbor Bridge",
    },
    {
      id: "3",
      name: "Material Specifications.xlsx",
      type: "XLSX",
      size: "856 KB",
      uploadedBy: "Emily Davis",
      uploadDate: "2024-10-23",
      status: "Approved",
      version: "v1.3",
      project: "Riverside Apartments",
    },
    {
      id: "4",
      name: "Environmental Impact Study.pdf",
      type: "PDF",
      size: "5.1 MB",
      uploadedBy: "James Wilson",
      uploadDate: "2024-10-22",
      status: "Rejected",
      version: "v1.0",
      project: "Harbor Bridge",
    },
    {
      id: "5",
      name: "Progress Report October.pdf",
      type: "PDF",
      size: "3.2 MB",
      uploadedBy: "Sarah Johnson",
      uploadDate: "2024-10-21",
      status: "Approved",
      version: "v1.0",
      project: "Downtown Plaza",
    },
  ]

  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch =
      doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.project.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === "all" || doc.status.toLowerCase() === statusFilter
    return matchesSearch && matchesStatus
  })

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
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Document Management</h1>
            <p className="text-slate-600 mt-1">Upload, manage, and review project documents</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setShowAI(true)} variant="outline">
              <MessageSquare className="w-4 h-4 mr-2" />
              AI Assistant
            </Button>
            <Button onClick={() => setShowUpload(true)}>
              <Upload className="w-4 h-4 mr-2" />
              Upload Document
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
              <CardTitle>All Documents</CardTitle>
              <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                <div className="relative flex-1 md:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Search documents..."
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
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
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
                    <TableHead>Document Name</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Uploaded By</TableHead>
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
                      <TableCell className="text-slate-600">{doc.uploadedBy}</TableCell>
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
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={() => setSelectedDocument(doc)}>
                                <Eye className="w-4 h-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                              <DialogHeader>
                                <DialogTitle>{doc.name}</DialogTitle>
                                <DialogDescription>Document details and version history</DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <p className="text-sm font-medium text-slate-600">Project</p>
                                    <p className="text-sm text-slate-900 mt-1">{doc.project}</p>
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-slate-600">Status</p>
                                    <Badge className={`${getStatusColor(doc.status)} mt-1`}>{doc.status}</Badge>
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-slate-600">Uploaded By</p>
                                    <p className="text-sm text-slate-900 mt-1">{doc.uploadedBy}</p>
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-slate-600">Upload Date</p>
                                    <p className="text-sm text-slate-900 mt-1">{doc.uploadDate}</p>
                                  </div>
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-slate-600 mb-2">Version History</p>
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-100 rounded-lg">
                                      <div>
                                        <p className="text-sm font-medium text-slate-900">{doc.version} (Current)</p>
                                        <p className="text-xs text-slate-600">{doc.uploadDate}</p>
                                      </div>
                                      <Button size="sm" variant="outline">
                                        <Download className="w-4 h-4 mr-2" />
                                        Download
                                      </Button>
                                    </div>
                                    <div className="flex items-center justify-between p-3 border border-slate-200 rounded-lg">
                                      <div>
                                        <p className="text-sm font-medium text-slate-900">v1.0</p>
                                        <p className="text-xs text-slate-600">2024-10-15</p>
                                      </div>
                                      <Button size="sm" variant="ghost">
                                        <Download className="w-4 h-4 mr-2" />
                                        Download
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>
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

      <DocumentUpload open={showUpload} onOpenChange={setShowUpload} />
      <DocumentAIAssistant open={showAI} onOpenChange={setShowAI} />
    </AdminLayout>
  )
}
