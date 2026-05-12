"use client"

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { ProjectCarpetaSuaTab } from "@/components/projectCarpetaSuaTab"
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
  FolderOpen,
  Pencil,
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
      return { label: "Pendiente", className: "bg-slate-500/15 text-slate-400 border border-slate-500/25" }
    case "uploaded":
      return { label: "Subido", className: "bg-[#0174bd]/15 text-[#4da8e8] border border-[#0174bd]/25" }
    case "processing":
      return { label: "Procesando", className: "bg-amber-500/15 text-amber-300 border border-amber-500/25" }
    case "approved":
      return { label: "Aprobado", className: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25" }
    case "rejected":
      return { label: "Rechazado", className: "bg-red-500/15 text-red-400 border border-red-500/25" }
    default:
      return { label: status, className: "bg-slate-500/15 text-slate-400 border border-slate-500/25" }
  }
}

function docTypeLabel(t: DocType) {
  if (t === "contract") return "Contrato"
  if (t === "quote") return "Cotización"
  return "Anexo"
}

function docTypeIcon(t: DocType) {
  if (t === "contract") return <FileCheck2 className="w-5 h-5 text-[#4da8e8]" />
  if (t === "quote") return <FileText className="w-5 h-5 text-violet-400" />
  return <FileText className="w-5 h-5 text-slate-400" />
}

function docStatusIcon(status: DocStatus) {
  if (status === "approved") return <ShieldCheck className="w-4 h-4 text-emerald-400" />
  if (status === "processing") return <Loader2 className="w-4 h-4 text-amber-300 animate-spin" />
  if (status === "rejected") return <FileWarning className="w-4 h-4 text-red-400" />
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

// Shared dark-mode class strings
const inputCls = "bg-slate-900 border-slate-700 text-slate-200 focus:border-[#0174bd]/60 placeholder:text-slate-500"
const selectTriggerCls = "bg-slate-900 border-slate-700 text-slate-200"
const selectContentCls = "bg-slate-800 border-slate-700 text-slate-200"
const btnOutlineCls = "border-slate-700 text-slate-400 hover:bg-slate-700/60 hover:text-slate-200"

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

  // Preview dialog
  const [previewOpen, setPreviewOpen]       = useState(false)
  const [previewDoc,  setPreviewDoc]        = useState<UiObraDocument | null>(null)
  const [previewUrl,  setPreviewUrl]        = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  function openUploadModal(prefillType?: DocType, prefillVersion?: number) {
    setUploadError(null)
    setSelectedFile(null)
    setUploadForm((f) => ({
      doc_type: prefillType ?? f.doc_type,
      title: "",
      version: String(prefillVersion ?? 1),
      notes: "",
    }))
    setUploadOpen(true)
  }

  async function openDocPreview(doc: UiObraDocument) {
    setPreviewDoc(doc)
    setPreviewUrl(null)
    setPreviewLoading(true)
    setPreviewOpen(true)
    try {
      const url = await getSignedUrl(doc.bucket, doc.object_path, 600)
      setPreviewUrl(url)
    } catch {
      setPreviewUrl(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  function handleCardDrop(e: DragEvent<HTMLDivElement>, docType: DocType) {
    e.preventDefault()
    e.stopPropagation()
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    openUploadModal(docType)
    setFile(file)
  }

  function handleEditVersion() {
    if (!previewDoc) return
    setPreviewOpen(false)
    openUploadModal(previewDoc.doc_type, previewDoc.version + 1)
  }

  async function handleDownloadPreview() {
    if (!previewDoc) return
    try {
      const { data, error } = await supabase.storage
        .from(previewDoc.bucket)
        .createSignedUrl(previewDoc.object_path, 180, { download: previewDoc.file_name })
      if (error || !data?.signedUrl) throw new Error()
      const a = document.createElement("a")
      a.href = data.signedUrl
      a.download = previewDoc.file_name
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch {
      alert("No se pudo descargar el archivo.")
    }
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
        await supabase.storage.from(DOCS_BUCKET).remove([objectPath])
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

  const currentContract = useMemo(() =>
    docs.find((d) => d.doc_type === "contract" && d.is_current) ?? null, [docs])

  const currentQuote = useMemo(() =>
    docs.find((d) => d.doc_type === "quote" && d.is_current) ?? null, [docs])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-100">Documentos de la obra</h2>
          <p className="text-sm text-slate-400">Administra el contrato, la cotización y anexos.</p>
        </div>
      </div>

      {/* Contrato + Cotización */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ── CONTRATO ── */}
        <div
          className="rounded-2xl border border-slate-700/60 overflow-hidden"
          style={{
            background: "linear-gradient(145deg, #1e293b 0%, #172030 60%, #1a2535 100%)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
          }}
        >
          <div className="p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-100">Contrato</p>
                <p className="text-xs text-slate-500">PDF firmado o contrato de obra</p>
              </div>
              <Badge className={statusBadge(contractStatus).className}>{statusBadge(contractStatus).label}</Badge>
            </div>

            {currentContract ? (
              <div
                className="rounded-lg border border-slate-700/60 bg-slate-900/60 p-3 cursor-pointer hover:bg-[#0174bd]/5 hover:border-[#0174bd]/40 transition-all duration-150 group"
                onClick={() => openDocPreview(currentContract)}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-slate-800 border border-slate-700 group-hover:border-[#0174bd]/40 transition-colors shrink-0">
                    {docTypeIcon("contract")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-100 truncate">{currentContract.title}</p>
                    <p className="text-xs text-slate-500 truncate">{currentContract.file_name}</p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      v{currentContract.version} · {new Date(currentContract.uploaded_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <Eye className="w-4 h-4 text-slate-600 group-hover:text-[#4da8e8] transition-colors shrink-0" />
                </div>
              </div>
            ) : (
              <div
                className="rounded-lg border border-dashed border-slate-700 bg-slate-900/40 p-4 cursor-pointer hover:bg-[#0174bd]/5 hover:border-[#0174bd]/40 transition-all duration-150 group"
                onClick={() => openUploadModal("contract")}
                onDrop={(e) => handleCardDrop(e, "contract")}
                onDragOver={handleDragOver}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-slate-800 border border-slate-700 group-hover:border-[#0174bd]/40 transition-colors">
                    {docTypeIcon("contract")}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-slate-400 group-hover:text-slate-200 transition-colors">
                      Arrastra el contrato aquí o <span className="text-[#4da8e8] font-medium">selecciónalo</span>
                    </p>
                    <p className="text-xs text-slate-600 mt-1">PDF recomendado. Máx. 25MB.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── COTIZACIÓN ── */}
        <div
          className="rounded-2xl border border-slate-700/60 overflow-hidden"
          style={{
            background: "linear-gradient(145deg, #1e293b 0%, #172030 60%, #1a2535 100%)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
          }}
        >
          <div className="p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-100">Cotización</p>
                <p className="text-xs text-slate-500">Cotización oficial aprobada por el cliente</p>
              </div>
              <Badge className={statusBadge(quoteStatus).className}>{statusBadge(quoteStatus).label}</Badge>
            </div>

            {currentQuote ? (
              <div
                className="rounded-lg border border-slate-700/60 bg-slate-900/60 p-3 cursor-pointer hover:bg-violet-500/5 hover:border-violet-400/30 transition-all duration-150 group"
                onClick={() => openDocPreview(currentQuote)}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-slate-800 border border-slate-700 group-hover:border-violet-400/30 transition-colors shrink-0">
                    {docTypeIcon("quote")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-100 truncate">{currentQuote.title}</p>
                    <p className="text-xs text-slate-500 truncate">{currentQuote.file_name}</p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      v{currentQuote.version} · {new Date(currentQuote.uploaded_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <Eye className="w-4 h-4 text-slate-600 group-hover:text-violet-400 transition-colors shrink-0" />
                </div>
              </div>
            ) : (
              <div
                className="rounded-lg border border-dashed border-slate-700 bg-slate-900/40 p-4 cursor-pointer hover:bg-violet-500/5 hover:border-violet-400/30 transition-all duration-150 group"
                onClick={() => openUploadModal("quote")}
                onDrop={(e) => handleCardDrop(e, "quote")}
                onDragOver={handleDragOver}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-slate-800 border border-slate-700 group-hover:border-violet-400/30 transition-colors">
                    {docTypeIcon("quote")}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-slate-400 group-hover:text-slate-200 transition-colors">
                      Arrastra la cotización aquí o <span className="text-violet-400 font-medium">selecciónala</span>
                    </p>
                    <p className="text-xs text-slate-600 mt-1">PDF/Excel recomendado. Máx. 25MB.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Carpeta SUA */}
      <ProjectCarpetaSuaTab obraId={obraId} compact />

      {/* Lista */}
      <div
        className="rounded-2xl border border-slate-700/60 overflow-hidden"
        style={{
          background: "linear-gradient(145deg, #1e293b 0%, #172030 60%, #1a2535 100%)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        {/* Card header with filters */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-5 border-b border-slate-700/60">
          <h3 className="text-base font-semibold text-slate-100">Historial de Contratos y Cotizaciones</h3>

          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
            <Input
              placeholder="Buscar por nombre..."
              value={docSearch}
              onChange={(e) => setDocSearch(e.target.value)}
              className={`sm:w-64 ${inputCls}`}
            />

            <Select value={docTypeFilter} onValueChange={(v) => setDocTypeFilter(v as any)}>
              <SelectTrigger className={`w-full sm:w-48 ${selectTriggerCls}`}>
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent className={selectContentCls}>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="contract">Contrato</SelectItem>
                <SelectItem value="quote">Cotización</SelectItem>
                <SelectItem value="other">Anexo</SelectItem>
              </SelectContent>
            </Select>

            <Select value={docStatusFilter} onValueChange={(v) => setDocStatusFilter(v as any)}>
              <SelectTrigger className={`w-full sm:w-48 ${selectTriggerCls}`}>
                <SelectValue placeholder="Estatus" />
              </SelectTrigger>
              <SelectContent className={selectContentCls}>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="uploaded">Subido</SelectItem>
                <SelectItem value="processing">Procesando</SelectItem>
                <SelectItem value="approved">Aprobado</SelectItem>
                <SelectItem value="rejected">Rechazado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="p-5">
          {docsError && (
            <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {docsError}
            </div>
          )}

          {docsLoading ? (
            <div className="py-10 text-center text-slate-500 text-sm">Cargando documentos...</div>
          ) : filteredDocs.length === 0 ? (
            <div className="py-10 text-center text-slate-500 text-sm">
              Aún no hay documentos registrados para esta obra.
              <div className="mt-2 text-slate-600">
                Sube el <span className="font-semibold text-slate-400">Contrato</span> y la <span className="font-semibold text-slate-400">Cotización</span> para comenzar.
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-slate-700/60 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700/60 hover:bg-slate-800/40">
                    <TableHead className="text-slate-400">Tipo</TableHead>
                    <TableHead className="text-slate-400">Archivo</TableHead>
                    <TableHead className="text-slate-400">Versión</TableHead>
                    <TableHead className="text-slate-400">Estatus</TableHead>
                    <TableHead className="text-slate-400">Fecha</TableHead>
                    <TableHead className="text-slate-400">Tamaño</TableHead>
                    <TableHead className="text-right text-slate-400">Acciones</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {filteredDocs.map((d) => {
                    const st = statusBadge(d.status)
                    return (
                      <TableRow key={d.id} className="border-slate-700/40 hover:bg-slate-800/40">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {docTypeIcon(d.doc_type)}
                            <span className="font-medium text-slate-200">{docTypeLabel(d.doc_type)}</span>
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="space-y-0.5">
                            <p className="font-medium text-slate-200">{d.title}</p>
                            <p className="text-xs text-slate-500">{d.file_name}</p>
                          </div>
                        </TableCell>

                        <TableCell>
                          <span className="font-mono text-xs text-slate-400">v{d.version}</span>
                        </TableCell>

                        <TableCell>
                          <div className="flex items-center gap-2">
                            {docStatusIcon(d.status)}
                            <Badge className={st.className}>{st.label}</Badge>
                          </div>
                        </TableCell>

                        <TableCell className="text-sm text-slate-400">{new Date(d.created_at).toISOString().slice(0, 10)}</TableCell>
                        <TableCell className="text-sm text-slate-400">{formatBytes(d.size_bytes)}</TableCell>

                        <TableCell className="text-right">
                          <div className="inline-flex gap-2">
                            <Button variant="outline" size="icon" onClick={() => handlePreview(d)} className={btnOutlineCls}>
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button variant="outline" size="icon" onClick={() => handleDownload(d)} className={btnOutlineCls}>
                              <Download className="w-4 h-4" />
                            </Button>
                            <Button variant="outline" size="icon" onClick={() => handleCopyLink(d)} className={btnOutlineCls}>
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
        </div>
      </div>

      {/* Panel "próximo" */}
      <div
        className="rounded-2xl border border-slate-700/60 overflow-hidden"
        style={{
          background: "linear-gradient(145deg, #1e293b 0%, #172030 60%, #1a2535 100%)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        <div className="p-5 border-b border-slate-700/60">
          <h3 className="text-base font-semibold text-slate-100">Automatización (próximo)</h3>
        </div>
        <div className="p-5 text-sm text-slate-500 space-y-2">
          <p>Esta sección la conectaremos después a OCR/AI + validaciones.</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Detectar montos, fechas, vigencia, proveedor/cliente.</li>
            <li>Comparar cotización vs contrato (discrepancias).</li>
            <li>Generar resumen y "checklist de firma".</li>
          </ul>
        </div>
      </div>

      {/* Input file oculto */}
      <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />

      {/* ── Preview Dialog ── */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl w-full p-0 overflow-hidden bg-slate-800 border-slate-700">
          {/* Header */}
          <DialogHeader className="flex flex-row items-center gap-3 px-5 pt-5 pb-3 border-b border-slate-700">
            <div className="p-2 rounded-md bg-slate-700 shrink-0">
              {previewDoc ? docTypeIcon(previewDoc.doc_type) : <FileText className="w-5 h-5 text-slate-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base font-semibold text-slate-100 truncate">
                {previewDoc?.title ?? "Documento"}
              </DialogTitle>
              <p className="text-xs text-slate-500 truncate mt-0.5">{previewDoc?.file_name}</p>
            </div>
            {previewDoc && (
              <Badge className="shrink-0 bg-slate-700 text-slate-300 font-mono text-xs border border-slate-600">
                v{previewDoc.version}
              </Badge>
            )}
          </DialogHeader>

          {/* Preview area */}
          <div className="relative bg-slate-900" style={{ height: "60vh" }}>
            {previewLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900">
                <Loader2 className="w-8 h-8 text-slate-500 animate-spin" />
                <p className="text-sm text-slate-500">Cargando previsualización…</p>
              </div>
            )}

            {!previewLoading && previewUrl && previewDoc && (() => {
              const mime = previewDoc.mime_type || ""
              const isPdf  = mime === "application/pdf" || previewDoc.file_name.toLowerCase().endsWith(".pdf")
              const isImg  = mime.startsWith("image/")

              if (isPdf) {
                return (
                  <iframe
                    src={previewUrl}
                    className="w-full h-full border-0"
                    title={previewDoc.title}
                  />
                )
              }
              if (isImg) {
                return (
                  <div className="w-full h-full flex items-center justify-center p-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt={previewDoc.title}
                      className="max-w-full max-h-full object-contain rounded shadow-sm"
                    />
                  </div>
                )
              }
              return (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-slate-500">
                  <FolderOpen className="w-12 h-12 text-slate-600" />
                  <p className="text-sm font-medium">Vista previa no disponible para este tipo de archivo.</p>
                  <p className="text-xs text-slate-600">Descarga el archivo para abrirlo.</p>
                </div>
              )
            })()}

            {!previewLoading && !previewUrl && !previewLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-500">
                <FileWarning className="w-10 h-10 text-slate-600" />
                <p className="text-sm">No se pudo cargar la previsualización.</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <DialogFooter className="flex flex-row items-center justify-between gap-2 px-5 py-3 border-t border-slate-700 bg-slate-800">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadPreview}
              disabled={!previewUrl}
              className={`gap-1.5 ${btnOutlineCls}`}
            >
              <Download className="w-4 h-4" />
              Descargar
            </Button>

            <Button
              size="sm"
              onClick={handleEditVersion}
              className="gap-1.5 bg-[#0174bd] hover:bg-[#0174bd]/90 text-white"
            >
              <Pencil className="w-4 h-4" />
              {previewDoc ? `Subir v${previewDoc.version + 1}` : "Editar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Modal */}
      <Dialog open={uploadOpen} onOpenChange={(v) => (uploadSaving ? null : setUploadOpen(v))}>
        <DialogContent className="max-w-2xl bg-slate-800 border-slate-700 text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Subir documento</DialogTitle>
          </DialogHeader>

          <div
            className="space-y-4 mt-2"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA" && !uploadSaving)
                handleUploadDocument()
            }}
          >
            {/* Dropzone */}
            <div
              className="rounded-lg border border-dashed border-slate-700 bg-slate-900/60 p-4"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-md bg-slate-800 border border-slate-700">
                  <Upload className="w-5 h-5 text-slate-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-slate-300">
                    Arrastra tu archivo aquí o{" "}
                    <button type="button" onClick={onPickFile} className="text-[#4da8e8] font-medium hover:underline">
                      selecciónalo
                    </button>
                  </p>
                  <p className="text-xs text-slate-500 mt-1">PDF/Excel/Word/imagen/zip. Máx. 25MB.</p>

                  {selectedFile && (
                    <div className="mt-3 rounded-md bg-slate-800 border border-slate-700 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium text-slate-200">{selectedFile.name}</p>
                          <p className="text-xs text-slate-500">
                            {selectedFile.type || "application/octet-stream"} • {formatBytes(selectedFile.size)}
                          </p>
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedFile(null)}
                          disabled={uploadSaving}
                          className={btnOutlineCls}
                        >
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
                <label className="text-xs font-medium text-slate-400">Tipo de documento *</label>
                <Select value={uploadForm.doc_type} onValueChange={(v) => setUploadForm((f) => ({ ...f, doc_type: v as DocType }))}>
                  <SelectTrigger className={selectTriggerCls}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className={selectContentCls}>
                    <SelectItem value="contract">Contrato</SelectItem>
                    <SelectItem value="quote">Cotización</SelectItem>
                    <SelectItem value="other">Anexo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-400">Versión *</label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={uploadForm.version}
                  onChange={(e) => setUploadForm((f) => ({ ...f, version: e.target.value }))}
                  placeholder="1"
                  className={inputCls}
                />
              </div>

              <div className="flex flex-col gap-1.5 md:col-span-2">
                <label className="text-xs font-medium text-slate-400">Título *</label>
                <Input
                  value={uploadForm.title}
                  onChange={(e) => setUploadForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Ej. Contrato firmado – Cliente X"
                  className={inputCls}
                />
                <p className="text-[11px] text-slate-500">Tip: usa un nombre claro (cliente / fecha / versión).</p>
              </div>

              <div className="flex flex-col gap-1.5 md:col-span-2">
                <label className="text-xs font-medium text-slate-400">Notas (opcional)</label>
                <Textarea
                  rows={3}
                  value={uploadForm.notes}
                  onChange={(e) => setUploadForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Comentarios internos (ej. pendiente de firma del cliente, etc.)"
                  className={inputCls}
                />
              </div>
            </div>

            {uploadError && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {uploadError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setUploadOpen(false)}
                disabled={uploadSaving}
                className={btnOutlineCls}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleUploadDocument}
                disabled={uploadSaving}
                className="bg-[#0174bd] hover:bg-[#0174bd]/90 text-white"
              >
                {uploadSaving ? "Guardando..." : "Subir documento"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  )
}
