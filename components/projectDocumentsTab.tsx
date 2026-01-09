"use client"

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Upload,
  FileText,
  FileCheck2,
  Eye,
  Download,
  Trash2,
  Link2,
  Loader2,
  ShieldCheck,
  FileWarning,
  Plus,
} from "lucide-react"

type DocStatus = "missing" | "uploaded" | "processing" | "approved" | "rejected"
type DocType = "contract" | "quote" | "other"
type AiStatus = "pending" | "processing" | "done" | "error" | "disabled"

type UiObraDocument = {
  id: string
  obra_id: string
  doc_type: DocType
  title: string
  file_name: string
  mime_type: string
  size_bytes: number
  version: number
  status: DocStatus
  created_at: string

  bucket: string
  object_path: string
  is_current: boolean
  ai_status: AiStatus
  uploaded_at: string
}

const DOCS_BUCKET = "obra-docs"

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "-"
  const units = ["B", "KB", "MB", "GB"]
  let i = 0
  let v = bytes
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function statusBadge(status: DocStatus) {
  switch (status) {
    case "missing":
      return { label: "Pendiente", className: "bg-slate-100 text-slate-700" }
    case "uploaded":
      return { label: "Subido", className: "bg-blue-100 text-blue-700" }
    case "processing":
      return { label: "Procesando", className: "bg-yellow-100 text-yellow-700" }
    case "approved":
      return { label: "Aprobado", className: "bg-green-100 text-green-700" }
    case "rejected":
      return { label: "Rechazado", className: "bg-red-100 text-red-700" }
    default:
      return { label: status, className: "bg-slate-100 text-slate-700" }
  }
}

function docTypeLabel(t: DocType) {
  if (t === "contract") return "Contrato"
  if (t === "quote") return "Cotización"
  return "Anexo"
}

function docTypeIcon(t: DocType) {
  if (t === "contract") return <FileCheck2 className="w-5 h-5 text-blue-600" />
  if (t === "quote") return <FileText className="w-5 h-5 text-purple-600" />
  return <FileText className="w-5 h-5 text-slate-700" />
}

function docStatusIcon(status: DocStatus) {
  if (status === "approved") return <ShieldCheck className="w-4 h-4 text-green-600" />
  if (status === "processing") return <Loader2 className="w-4 h-4 text-yellow-600 animate-spin" />
  if (status === "rejected") return <FileWarning className="w-4 h-4 text-red-600" />
  return null
}

function isAllowedDoc(file: File) {
  const allowed = [
    "application/pdf",
    "image/png",
    "image/jpeg",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "application/zip",
    "application/x-zip-compressed",
  ]
  return allowed.includes(file.type) || file.name.toLowerCase().endsWith(".pdf")
}

function mapAiToDocStatus(ai: AiStatus): Exclude<DocStatus, "missing"> {
  if (ai === "processing") return "processing"
  if (ai === "done") return "approved"
  if (ai === "error") return "rejected"
  return "uploaded"
}

export function ProjectDocumentsTab({ obraId }: { obraId: string }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [docs, setDocs] = useState<UiObraDocument[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [docsError, setDocsError] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  const [docSearch, setDocSearch] = useState("")
  const [docTypeFilter, setDocTypeFilter] = useState<"all" | DocType>("all")
  const [docStatusFilter, setDocStatusFilter] = useState<"all" | Exclude<DocStatus, "missing">>("all")

  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadSaving, setUploadSaving] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadForm, setUploadForm] = useState<{
    doc_type: DocType
    title: string
    version: string
    notes: string
  }>({
    doc_type: "contract",
    title: "",
    version: "1",
    notes: "",
  })

  function openUploadModal(prefillType?: DocType) {
    setUploadError(null)
    setSelectedFile(null)
    setUploadForm((f) => ({
      doc_type: prefillType ?? f.doc_type,
      title: "",
      version: "1",
      notes: "",
    }))
    setUploadOpen(true)
  }

  function onPickFile() {
    fileInputRef.current?.click()
  }

  function setFile(file: File | null) {
    if (!file) {
      setSelectedFile(null)
      return
    }
    if (!isAllowedDoc(file)) {
      setUploadError("Tipo de archivo no permitido. Sube PDF/Excel/Word/imagen/zip.")
      setSelectedFile(null)
      return
    }
    if (file.size > 25 * 1024 * 1024) {
      setUploadError("El archivo excede el tamaño máximo (25MB).")
      setSelectedFile(null)
      return
    }

    setUploadError(null)
    setSelectedFile(file)

    setUploadForm((f) => ({
      ...f,
      title: f.title?.trim() ? f.title : file.name.replace(/\.[^/.]+$/, ""),
    }))
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    const file = e.dataTransfer.files?.[0]
    setFile(file ?? null)
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
  }

  async function loadIsAdmin() {
    const { data: authData } = await supabase.auth.getUser()
    const uid = authData?.user?.id
    if (!uid) {
      setIsAdmin(false)
      return
    }

    const { data, error } = await supabase.from("app_users").select("role").eq("id", uid).single()
    if (error) {
      console.error("loadIsAdmin error:", error)
      setIsAdmin(false)
      return
    }
    setIsAdmin(String(data?.role || "").toLowerCase() === "admin")
  }

  
  async function fetchDocuments() {
    setDocsLoading(true)
    setDocsError(null)

    const { data, error } = await supabase
      .from("obra_documents")
      .select(
        `
        id, obra_id, doc_type, title,
        bucket, object_path,
        file_name, mime_type, size_bytes,
        version, is_current,
        ai_status,
        uploaded_at,
        created_at
      `,
      )
      .eq("obra_id", obraId)
      .order("uploaded_at", { ascending: false })

    if (error) {
    console.error("fetchDocuments error (raw):", error)
    console.error("fetchDocuments error fields:", {
        message: (error as any)?.message,
        details: (error as any)?.details,
        hint: (error as any)?.hint,
        code: (error as any)?.code,
        status: (error as any)?.status,
    })
    setDocsError(`No se pudieron cargar los documentos: ${(error as any)?.message ?? "error desconocido"}`)
    setDocs([])
    setDocsLoading(false)
    return
    }

    const uiDocs: UiObraDocument[] = (data || []).map((d: any) => ({
      id: d.id,
      obra_id: d.obra_id,
      doc_type: d.doc_type as DocType,
      title: d.title || d.file_name || "Documento",
      file_name: d.file_name || "archivo",
      mime_type: d.mime_type || "application/octet-stream",
      size_bytes: Number(d.size_bytes || 0),
      version: Number(d.version || 1),
      status: mapAiToDocStatus(d.ai_status as AiStatus),
      created_at: d.created_at,

      bucket: d.bucket || DOCS_BUCKET,
      object_path: d.object_path,
      is_current: Boolean(d.is_current),
      ai_status: d.ai_status as AiStatus,
      uploaded_at: d.uploaded_at,
    }))

    setDocs(uiDocs)
    setDocsLoading(false)
  }

  async function getSignedUrl(bucket: string, objectPath: string, expiresInSeconds = 180) {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(objectPath, expiresInSeconds)
    if (error || !data?.signedUrl) {
      console.error("createSignedUrl error:", error)
      throw new Error("No se pudo generar el link del archivo.")
    }
    return data.signedUrl
  }

  async function handlePreview(doc: UiObraDocument) {
    try {
      const url = await getSignedUrl(doc.bucket, doc.object_path, 180)
      window.open(url, "_blank", "noopener,noreferrer")
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo abrir el archivo.")
    }
  }

  async function handleDownload(doc: UiObraDocument) {
    try {
      const url = await getSignedUrl(doc.bucket, doc.object_path, 180)
      const a = document.createElement("a")
      a.href = url
      a.download = doc.file_name || "documento"
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch {
      alert("No se pudo descargar el archivo.")
    }
  }

  async function handleCopyLink(doc: UiObraDocument) {
    try {
      const url = await getSignedUrl(doc.bucket, doc.object_path, 180)
      await navigator.clipboard.writeText(url)
      alert("Link copiado (temporal).")
    } catch {
      alert("No se pudo copiar el link.")
    }
  }

  async function handleDeleteDoc(doc: UiObraDocument) {
    if (!isAdmin) {
      alert("Solo un admin puede eliminar documentos.")
      return
    }

    const ok = window.confirm("¿Eliminar este documento? Se borrará también del Storage.")
    if (!ok) return

    const { error: storageError } = await supabase.storage.from(doc.bucket).remove([doc.object_path])
    if (storageError) {
      console.error("storage remove error:", storageError)
      alert("No se pudo borrar el archivo del bucket.")
      return
    }

    const { error: rowError } = await supabase.from("obra_documents").delete().eq("id", doc.id)
    if (rowError) {
      console.error("row delete error:", rowError)
      alert("Se borró el archivo, pero no se pudo borrar el registro en DB.")
    }

    await fetchDocuments()
  }

  async function handleUploadDocument() {
    setUploadError(null)

    if (!selectedFile) {
      setUploadError("Selecciona un archivo antes de continuar.")
      return
    }

    const v = Number(uploadForm.version)
    if (!Number.isFinite(v) || v <= 0) {
      setUploadError("La versión debe ser un número válido mayor a 0.")
      return
    }

    if (!uploadForm.title.trim()) {
      setUploadError("El título es obligatorio.")
      return
    }

    setUploadSaving(true)

    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser()
      if (authErr || !authData?.user) {
        setUploadError("Sesión inválida. Vuelve a iniciar sesión.")
        setUploadSaving(false)
        return
      }

      const safeName = selectedFile.name
        .trim()
        .replace(/\s+/g, "_")
        .replace(/[^\w.\-]+/g, "")
        .slice(0, 120)

      const uuid =
        typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now())
      const folder =
        uploadForm.doc_type === "contract" ? "contracts" : uploadForm.doc_type === "quote" ? "quotes" : "other"
      const objectPath = `obras/${obraId}/${folder}/${uuid}_${safeName}`

      // Versionado current solo para contract/quote
      if (uploadForm.doc_type !== "other") {
        const { error: updErr } = await supabase
          .from("obra_documents")
          .update({ is_current: false })
          .eq("obra_id", obraId)
          .eq("doc_type", uploadForm.doc_type)
          .eq("is_current", true)

        if (updErr) {
          console.error("update is_current error:", updErr)
          setUploadError("No se pudo preparar versionado (is_current).")
          setUploadSaving(false)
          return
        }
      }

      // 1) upload Storage
      const { error: upErr } = await supabase.storage.from(DOCS_BUCKET).upload(objectPath, selectedFile, {
        contentType: selectedFile.type || "application/octet-stream",
        upsert: false,
      })

      if (upErr) {
        console.error("upload error:", upErr)
        setUploadError("No se pudo subir el archivo (Storage). Revisa policies.")
        setUploadSaving(false)
        return
      }

      // 2) insert DB
      const payload = {
        obra_id: obraId,
        doc_type: uploadForm.doc_type,
        title: uploadForm.title.trim(),
        bucket: DOCS_BUCKET,
        object_path: objectPath,
        file_name: selectedFile.name,
        mime_type: selectedFile.type || null,
        size_bytes: selectedFile.size,
        uploaded_by: authData.user.id,
        version: v,
        is_current: uploadForm.doc_type === "other" ? false : true,
        ai_status: "pending" as AiStatus,
        ai_model: null,
        ai_extracted_json: null,
        ai_error: null,
      }

      const { error: insErr } = await supabase.from("obra_documents").insert(payload)

      if (insErr) {
        console.error("insert obra_documents error:", insErr)
        await supabase.storage.from(DOCS_BUCKET).remove([objectPath]) // rollback
        setUploadError("No se pudo registrar el documento (DB).")
        setUploadSaving(false)
        return
      }

      setUploadOpen(false)
      setSelectedFile(null)
      setUploadForm({
        doc_type: "contract",
        title: "",
        version: "1",
        notes: "",
      })

      await fetchDocuments()
    } catch (e) {
      console.error(e)
      setUploadError("No se pudo registrar el documento. Intenta de nuevo.")
    } finally {
      setUploadSaving(false)
    }
  }

  useEffect(() => {
    loadIsAdmin()
    fetchDocuments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obraId])

  const filteredDocs = useMemo(() => {
    const q = docSearch.trim().toLowerCase()
    return docs.filter((d) => {
      const matchesSearch =
        !q ||
        d.title.toLowerCase().includes(q) ||
        d.file_name.toLowerCase().includes(q) ||
        docTypeLabel(d.doc_type).toLowerCase().includes(q)

      const matchesType = docTypeFilter === "all" || d.doc_type === docTypeFilter
      const matchesStatus = docStatusFilter === "all" || d.status === docStatusFilter

      return matchesSearch && matchesType && matchesStatus
    })
  }, [docs, docSearch, docTypeFilter, docStatusFilter])

  const contractStatus: DocStatus = useMemo(() => {
    const contractDocs = docs.filter((d) => d.doc_type === "contract")
    if (contractDocs.length === 0) return "missing"
    return contractDocs[0].status
  }, [docs])

  const quoteStatus: DocStatus = useMemo(() => {
    const quoteDocs = docs.filter((d) => d.doc_type === "quote")
    if (quoteDocs.length === 0) return "missing"
    return quoteDocs[0].status
  }, [docs])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Documentos de la obra</h2>
          <p className="text-sm text-slate-600">Administra el contrato, la cotización y anexos.</p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => openUploadModal("other")}>
            <Plus className="w-4 h-4 mr-2" />
            Subir anexo
          </Button>
          <Button onClick={() => openUploadModal()}>
            <Upload className="w-4 h-4 mr-2" />
            Subir documento
          </Button>
        </div>
      </div>

      {/* Quick upload: Contrato + Cotización */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">Contrato</p>
                <p className="text-xs text-slate-500">PDF firmado o contrato de obra</p>
              </div>
              <Badge className={statusBadge(contractStatus).className}>{statusBadge(contractStatus).label}</Badge>
            </div>

            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-white border">{docTypeIcon("contract")}</div>
                <div className="flex-1">
                  <p className="text-sm text-slate-800">
                    Sube el contrato aquí o{" "}
                    <button
                      type="button"
                      onClick={() => openUploadModal("contract")}
                      className="text-blue-600 font-medium hover:underline"
                    >
                      selecciónalo
                    </button>
                  </p>
                  <p className="text-xs text-slate-500 mt-1">PDF recomendado. Máx. 25MB.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">Cotización</p>
                <p className="text-xs text-slate-500">Cotización oficial aprobada por el cliente</p>
              </div>
              <Badge className={statusBadge(quoteStatus).className}>{statusBadge(quoteStatus).label}</Badge>
            </div>

            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-white border">{docTypeIcon("quote")}</div>
                <div className="flex-1">
                  <p className="text-sm text-slate-800">
                    Sube la cotización aquí o{" "}
                    <button
                      type="button"
                      onClick={() => openUploadModal("quote")}
                      className="text-blue-600 font-medium hover:underline"
                    >
                      selecciónala
                    </button>
                  </p>
                  <p className="text-xs text-slate-500 mt-1">PDF/Excel recomendado. Máx. 25MB.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lista */}
      <Card>
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <CardTitle>Historial de documentos</CardTitle>

          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
            <Input
              placeholder="Buscar por nombre..."
              value={docSearch}
              onChange={(e) => setDocSearch(e.target.value)}
              className="sm:w-64"
            />

            <Select value={docTypeFilter} onValueChange={(v) => setDocTypeFilter(v as any)}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="contract">Contrato</SelectItem>
                <SelectItem value="quote">Cotización</SelectItem>
                <SelectItem value="other">Anexo</SelectItem>
              </SelectContent>
            </Select>

            <Select value={docStatusFilter} onValueChange={(v) => setDocStatusFilter(v as any)}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Estatus" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="uploaded">Subido</SelectItem>
                <SelectItem value="processing">Procesando</SelectItem>
                <SelectItem value="approved">Aprobado</SelectItem>
                <SelectItem value="rejected">Rechazado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent>
          {docsError && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {docsError}
            </div>
          )}

          {docsLoading ? (
            <div className="py-10 text-center text-slate-500 text-sm">Cargando documentos...</div>
          ) : filteredDocs.length === 0 ? (
            <div className="py-10 text-center text-slate-500 text-sm">
              Aún no hay documentos registrados para esta obra.
              <div className="mt-2 text-slate-600">
                Sube el <b>Contrato</b> y la <b>Cotización</b> para comenzar.
              </div>
            </div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Archivo</TableHead>
                    <TableHead>Versión</TableHead>
                    <TableHead>Estatus</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tamaño</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {filteredDocs.map((d) => {
                    const st = statusBadge(d.status)
                    return (
                      <TableRow key={d.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {docTypeIcon(d.doc_type)}
                            <span className="font-medium text-slate-900">{docTypeLabel(d.doc_type)}</span>
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="space-y-0.5">
                            <p className="font-medium text-slate-900">{d.title}</p>
                            <p className="text-xs text-slate-500">{d.file_name}</p>
                          </div>
                        </TableCell>

                        <TableCell>
                          <span className="font-mono text-xs">v{d.version}</span>
                        </TableCell>

                        <TableCell>
                          <div className="flex items-center gap-2">
                            {docStatusIcon(d.status)}
                            <Badge className={st.className}>{st.label}</Badge>
                          </div>
                        </TableCell>

                        <TableCell className="text-sm text-slate-600">{new Date(d.created_at).toISOString().slice(0, 10)}</TableCell>
                        <TableCell className="text-sm text-slate-600">{formatBytes(d.size_bytes)}</TableCell>

                        <TableCell className="text-right">
                          <div className="inline-flex gap-2">
                            <Button variant="outline" size="icon" onClick={() => handlePreview(d)}>
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button variant="outline" size="icon" onClick={() => handleDownload(d)}>
                              <Download className="w-4 h-4" />
                            </Button>
                            <Button variant="outline" size="icon" onClick={() => handleCopyLink(d)}>
                              <Link2 className="w-4 h-4" />
                            </Button>

                            {isAdmin && (
                              <Button variant="destructive" size="icon" onClick={() => handleDeleteDoc(d)}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Panel “próximo” */}
      <Card>
        <CardHeader>
          <CardTitle>Automatización (próximo)</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-600 space-y-2">
          <p>Esta sección la conectaremos después a OCR/AI + validaciones.</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Detectar montos, fechas, vigencia, proveedor/cliente.</li>
            <li>Comparar cotización vs contrato (discrepancias).</li>
            <li>Generar resumen y “checklist de firma”.</li>
          </ul>
        </CardContent>
      </Card>

      {/* Input file oculto */}
      <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />

      {/* Modal */}
      <Dialog open={uploadOpen} onOpenChange={(v) => (uploadSaving ? null : setUploadOpen(v))}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Subir documento</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {/* Dropzone */}
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4" onDrop={handleDrop} onDragOver={handleDragOver}>
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-md bg-white border">
                  <Upload className="w-5 h-5 text-slate-700" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-slate-800">
                    Arrastra tu archivo aquí o{" "}
                    <button type="button" onClick={onPickFile} className="text-blue-600 font-medium hover:underline">
                      selecciónalo
                    </button>
                  </p>
                  <p className="text-xs text-slate-500 mt-1">PDF/Excel/Word/imagen/zip. Máx. 25MB.</p>

                  {selectedFile && (
                    <div className="mt-3 rounded-md bg-white border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium text-slate-900">{selectedFile.name}</p>
                          <p className="text-xs text-slate-500">
                            {selectedFile.type || "application/octet-stream"} • {formatBytes(selectedFile.size)}
                          </p>
                        </div>

                        <Button type="button" variant="outline" size="sm" onClick={() => setSelectedFile(null)} disabled={uploadSaving}>
                          Quitar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Form */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">Tipo de documento *</label>
                <Select value={uploadForm.doc_type} onValueChange={(v) => setUploadForm((f) => ({ ...f, doc_type: v as DocType }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contract">Contrato</SelectItem>
                    <SelectItem value="quote">Cotización</SelectItem>
                    <SelectItem value="other">Anexo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">Versión *</label>
                <Input type="number" min={1} step={1} value={uploadForm.version} onChange={(e) => setUploadForm((f) => ({ ...f, version: e.target.value }))} placeholder="1" />
              </div>

              <div className="flex flex-col gap-1.5 md:col-span-2">
                <label className="text-xs font-medium text-slate-600">Título *</label>
                <Input value={uploadForm.title} onChange={(e) => setUploadForm((f) => ({ ...f, title: e.target.value }))} placeholder="Ej. Contrato firmado – Cliente X" />
                <p className="text-[11px] text-slate-500">Tip: usa un nombre claro (cliente / fecha / versión).</p>
              </div>

              <div className="flex flex-col gap-1.5 md:col-span-2">
                <label className="text-xs font-medium text-slate-600">Notas (opcional)</label>
                <Textarea rows={3} value={uploadForm.notes} onChange={(e) => setUploadForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Comentarios internos (ej. pendiente de firma del cliente, etc.)" />
              </div>
            </div>

            {uploadError && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{uploadError}</div>}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setUploadOpen(false)} disabled={uploadSaving}>
                Cancelar
              </Button>
              <Button onClick={handleUploadDocument} disabled={uploadSaving}>
                {uploadSaving ? "Guardando..." : "Subir documento"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
