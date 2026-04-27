"use client"

import { useParams, useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react"
import { AdminLayout } from "@/components/admin-layout"
import { RoleGuard } from "@/lib/role-guard"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  MapPin,
  DollarSign,
  Users,
  Clock,
  ArrowLeft,
  Edit,
  CheckCircle2,
  XCircle,
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
import Link from "next/link"
import { supabase } from "@/lib/supabaseClient"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ProjectDocumentsTab } from "@/components/projectDocumentsTab"
import { ProjectTeamTab } from "@/components/projectTeamTab"

// ---------- Tipos DB basicos ----------

type DbObraStatus = "planned" | "in_progress" | "paused" | "closed"

type ObraRow = {
  id: string
  code: string | null
  name: string
  client_name: string | null
  location_text: string | null
  status: DbObraStatus
  start_date_planned: string | null
  start_date_actual: string | null
  end_date_planned: string | null
  end_date_actual: string | null
  notes: string | null
  iva_included: boolean
}

type ContractRow = {
  id: string
  obra_id: string
  contract_amount: string | number | null
  currency: string
}

type ObraStateAccountRow = {
  id: string
  obra_id: string
  amount: string | number
  concept: "deposit" | "advance" | "retention" | "return"
  method: "transfer" | "cash" | "check" | "other" | null
  date: string
  bank_ref: string | null
  note: string | null
}

type AttachmentRow = {
  id: string
  ref_table: string
  ref_id: string
  file_url: string
  file_name: string | null
  mime_type: string | null
  size_bytes: number | null
  uploaded_by: string | null
  uploaded_at: string
}

type BillingItem = {
  id: string
  obra_id: string
  type: "cotizacion" | "aditivo"
  description: string | null
  amount: number
  date: string
  created_at: string
}

const EVIDENCE_BUCKET = "state-account-evidence"

type SiteReportRow = {
  id: string
  obra_id: string
  report_date: string
  progress_percent: string | number | null
}

type ObraAssignmentRow = {
  id: string
  obra_id: string
  employee_id: string
  role_on_site: string | null
  assigned_to: string | null
  employees: { full_name: string } | { full_name: string }[] | null
}

// ---------- Documentos (conectado a obra_documents + storage) ----------

type DocStatus = "missing" | "uploaded" | "processing" | "approved" | "rejected"

// DB enum: public.obra_document_type ('contract','quote','other')
type DocType = "contract" | "quote" | "other"

// DB enum: public.ai_status ('pending','processing','done','error','disabled')
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
  notes?: string | null

  bucket: string
  object_path: string
  is_current: boolean
  ai_status: AiStatus
  uploaded_at: string
}


const DOCS_BUCKET = "obra-docs"

// ---------- Helpers de mapping / formatos ----------

function mapDbStatusToBadge(status: DbObraStatus) {
  switch (status) {
    case "planned":
      return { label: "Planned", className: "bg-yellow-100 text-yellow-700" }
    case "in_progress":
      return { label: "In Progress", className: "bg-blue-100 text-blue-700" }
    case "paused":
      return { label: "On Hold", className: "bg-slate-100 text-slate-700" }
    case "closed":
      return { label: "Completed", className: "bg-green-100 text-green-700" }
    default:
      return { label: status, className: "bg-slate-100 text-slate-700" }
  }
}

function formatCurrency(value: number, currency: string = "MXN"): string {
  if (!Number.isFinite(value)) return "-"
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value)
}

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
  if (t === "quote") return "Cotizacion"
  return "Anexo" // other
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
  // UI only: PDF, images, excel/word, zip
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

// ---------- Pagina de detalle ----------

export default function ProjectDetailPage() {
  const params = useParams()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [obra, setObra] = useState<ObraRow | null>(null)
  const [progress, setProgress] = useState<number>(0)
  const [budgetTotal, setBudgetTotal] = useState<number>(0)
  const [budgetCurrency, setBudgetCurrency] = useState<string>("MXN")
  const [spentTotal, setSpentTotal] = useState<number>(0)
  const [ivaIncluded, setIvaIncluded] = useState<boolean>(true)

  // Team info
  const [teamSize, setTeamSize] = useState<number>(0)
  const [managerName, setManagerName] = useState<string | null>(null)

  // Editar obra
  const [editOpen, setEditOpen] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [editForm, setEditForm] = useState({
    name: "",
    client_name: "",
    location_text: "",
    status: "planned" as DbObraStatus,
    start_date_planned: "",
    end_date_planned: "",
    notes: "",
  })
  const [activeTab, setActiveTab] = useState("overview")

  // Estado de cuenta
  const [stateAccounts, setStateAccounts] = useState<ObraStateAccountRow[]>([])
  const [newPaymentOpen, setNewPaymentOpen] = useState(false)
  const [newPaymentSaving, setNewPaymentSaving] = useState(false)
  const [editPaymentsOpen, setEditPaymentsOpen] = useState(false)
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<Set<string>>(new Set())
  const [deletingPayments, setDeletingPayments] = useState(false)

  // Evidencias (attachments de obra_state_accounts)
  const [evidenceMap, setEvidenceMap] = useState<Record<string, AttachmentRow>>({})
  const [uploadingEvidenceId, setUploadingEvidenceId] = useState<string | null>(null)
  const [pendingEvidenceAccountId, setPendingEvidenceAccountId] = useState<string | null>(null)
  const [replacingEvidence, setReplacingEvidence] = useState<AttachmentRow | null>(null)
  const evidenceInputRef = useRef<HTMLInputElement | null>(null)

  // Modal de visualizacion de evidencia
  const [evidenceViewOpen, setEvidenceViewOpen] = useState(false)
  const [viewingEvidence, setViewingEvidence] = useState<AttachmentRow | null>(null)
  const [viewingSignedUrl, setViewingSignedUrl] = useState<string | null>(null)
  const [viewingLoading, setViewingLoading] = useState(false)
  const [deletingEvidence, setDeletingEvidence] = useState(false)
  const [newPaymentForm, setNewPaymentForm] = useState({
    concept: "deposit" as ObraStateAccountRow["concept"],
    amount: "",
    method: "transfer" as ObraStateAccountRow["method"],
    date: new Date().toISOString().slice(0, 10),
    bank_ref: "",
    note: "",
  })

  // Cotizacion y Aditivos
  const [billingItems, setBillingItems] = useState<BillingItem[]>([])
  const [billingDialogOpen, setBillingDialogOpen] = useState(false)
  const [editingBillingItem, setEditingBillingItem] = useState<BillingItem | null>(null)
  const [billingForm, setBillingForm] = useState({
    type: "aditivo" as "cotizacion" | "aditivo",
    description: "",
    amount: "",
    date: new Date().toISOString().slice(0, 10),
  })
  const [savingBilling, setSavingBilling] = useState(false)
  const [billingError, setBillingError] = useState<string | null>(null)

  // ------------------ Documentos: UI + Modal (Opcion B) ------------------

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
      setUploadError("El archivo excede el tamano maximo (25MB).")
      setSelectedFile(null)
      return
    }

    setUploadError(null)
    setSelectedFile(file)

    // autollenar titulo si esta vacio
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

  function mapAiToDocStatus(ai: AiStatus): Exclude<DocStatus, "missing"> {
    if (ai === "processing") return "processing"
    if (ai === "done") return "approved"
    if (ai === "error") return "rejected"
    return "uploaded" // pending/disabled
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

  async function fetchDocuments(obraId: string) {
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
      console.error("fetchDocuments error:", error)
      setDocsError("No se pudieron cargar los documentos.")
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
      notes: null,

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

    const ok = window.confirm("Eliminar este documento? Se borrara tambien del Storage.")
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
      alert("Se borro el archivo, pero no se pudo borrar el registro en DB.")
    }

    if (obra) await fetchDocuments(obra.id)
  }

  async function handleUploadDocument() {
    if (!obra) return
    setUploadError(null)

    if (!selectedFile) {
      setUploadError("Selecciona un archivo antes de continuar.")
      return
    }

    const v = Number(uploadForm.version)
    if (!Number.isFinite(v) || v <= 0) {
      setUploadError("La version debe ser un numero valido mayor a 0.")
      return
    }

    if (!uploadForm.title.trim()) {
      setUploadError("El titulo es obligatorio.")
      return
    }

    setUploadSaving(true)

    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser()
      if (authErr || !authData?.user) {
        setUploadError("Sesion invalida. Vuelve a iniciar sesion.")
        setUploadSaving(false)
        return
      }

      const safeName = selectedFile.name
        .trim()
        .replace(/\s+/g, "_")
        .replace(/[^\w.\-]+/g, "")
        .slice(0, 120)

      const uuid = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now())
      const folder = uploadForm.doc_type === "contract" ? "contracts" : uploadForm.doc_type === "quote" ? "quotes" : "other"
      const objectPath = `obras/${obra.id}/${folder}/${uuid}_${safeName}`

      // Versionado "current" solo para contract/quote (conservador)
      if (uploadForm.doc_type !== "other") {
        const { error: updErr } = await supabase
          .from("obra_documents")
          .update({ is_current: false })
          .eq("obra_id", obra.id)
          .eq("doc_type", uploadForm.doc_type)
          .eq("is_current", true)

        if (updErr) {
          console.error("update is_current error:", updErr)
          setUploadError("No se pudo preparar versionado (is_current).")
          setUploadSaving(false)
          return
        }
      }

      // 1) upload a Storage
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

      // 2) insert en obra_documents
      const payload = {
        obra_id: obra.id,
        doc_type: uploadForm.doc_type, // contract | quote | other
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

      await fetchDocuments(obra.id)
    } catch (e) {
      console.error(e)
      setUploadError("No se pudo registrar el documento. Intenta de nuevo.")
    } finally {
      setUploadSaving(false)
    }
  }

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

  // ------------------ Funciones existentes ------------------

  async function handleUpdateObra() {
    if (!obra) return
    setSavingEdit(true)

    const payload = {
      name: editForm.name,
      client_name: editForm.client_name || null,
      location_text: editForm.location_text || null,
      status: editForm.status,
      start_date_planned: editForm.start_date_planned || null,
      end_date_planned: editForm.end_date_planned || null,
      notes: editForm.notes || null,
    }

    const { data, error } = await supabase
      .from("obras")
      .update(payload)
      .eq("id", obra.id)
      .select(
        `
        id,
        code,
        name,
        client_name,
        location_text,
        status,
        start_date_planned,
        start_date_actual,
        end_date_planned,
        end_date_actual,
        notes
      `,
      )
      .single()

    if (error || !data) {
      console.error("Error updating obra:", error)
      setSavingEdit(false)
      return
    }

    setObra(data as ObraRow)
    setEditOpen(false)
    setSavingEdit(false)
  }

  async function handleDeleteObra() {
    if (!obra) return
    const ok = window.confirm("Seguro que deseas eliminar esta obra? Esta accion no se puede deshacer.")
    if (!ok) return

    setDeleteLoading(true)
    const { error } = await supabase.from("obras").delete().eq("id", obra.id)

    if (error) {
      console.error("Error deleting obra:", error)
      setDeleteLoading(false)
      return
    }

    router.push("/admin/projects")
  }

  async function handleUploadEvidence(accountId: string, file: File) {
    if (!obra) return
    setUploadingEvidenceId(accountId)
    try {
      const { data: authData } = await supabase.auth.getUser()
      const userId = authData?.user?.id ?? null

      const safeName = file.name
        .trim()
        .replace(/\s+/g, "_")
        .replace(/[^\w.\-]+/g, "")
        .slice(0, 120)
      const uuid =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : String(Date.now())
      const objectPath = `${obra.id}/${accountId}/${uuid}_${safeName}`

      const { error: upErr } = await supabase.storage
        .from(EVIDENCE_BUCKET)
        .upload(objectPath, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        })

      if (upErr) {
        console.error("evidence upload error:", upErr)
        alert("No se pudo subir el archivo. Revisa permisos del bucket.")
        return
      }

      const { data: attData, error: attErr } = await supabase
        .from("attachments")
        .insert({
          ref_table: "obra_state_accounts",
          ref_id: accountId,
          file_url: objectPath,
          file_name: file.name,
          mime_type: file.type || null,
          size_bytes: file.size,
          uploaded_by: userId,
        })
        .select("id, ref_table, ref_id, file_url, file_name, mime_type, size_bytes, uploaded_by, uploaded_at")
        .single()

      if (attErr || !attData) {
        console.error("attachments insert error:", attErr)
        await supabase.storage.from(EVIDENCE_BUCKET).remove([objectPath])
        alert("No se pudo registrar la evidencia en la base de datos.")
        return
      }

      setEvidenceMap((prev) => ({ ...prev, [accountId]: attData as AttachmentRow }))
    } finally {
      setUploadingEvidenceId(null)
      setPendingEvidenceAccountId(null)
    }
  }

  async function handleViewEvidence(attachment: AttachmentRow) {
    setViewingEvidence(attachment)
    setViewingSignedUrl(null)
    setEvidenceViewOpen(true)
    setViewingLoading(true)
    try {
      const url = await getSignedUrl(EVIDENCE_BUCKET, attachment.file_url, 600)
      setViewingSignedUrl(url)
    } catch {
      alert("No se pudo generar el link del archivo.")
      setEvidenceViewOpen(false)
    } finally {
      setViewingLoading(false)
    }
  }

  async function handleReplaceEvidence(oldAttachment: AttachmentRow, file: File) {
    if (!obra) return
    setUploadingEvidenceId(oldAttachment.ref_id)
    setViewingLoading(true)
    try {
      const { data: authData } = await supabase.auth.getUser()
      const userId = authData?.user?.id ?? null

      const safeName = file.name
        .trim()
        .replace(/\s+/g, "_")
        .replace(/[^\w.\-]+/g, "")
        .slice(0, 120)
      const uuid =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : String(Date.now())
      const objectPath = `${obra.id}/${oldAttachment.ref_id}/${uuid}_${safeName}`

      const { error: upErr } = await supabase.storage
        .from(EVIDENCE_BUCKET)
        .upload(objectPath, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        })
      if (upErr) {
        alert("No se pudo subir el archivo.")
        return
      }

      const { data: attData, error: attErr } = await supabase
        .from("attachments")
        .update({
          file_url: objectPath,
          file_name: file.name,
          mime_type: file.type || null,
          size_bytes: file.size,
          uploaded_by: userId,
        })
        .eq("id", oldAttachment.id)
        .select("id, ref_table, ref_id, file_url, file_name, mime_type, size_bytes, uploaded_by, uploaded_at")
        .single()

      if (attErr || !attData) {
        alert("No se pudo actualizar la evidencia.")
        await supabase.storage.from(EVIDENCE_BUCKET).remove([objectPath])
        return
      }

      // Borrar archivo anterior del bucket
      await supabase.storage.from(EVIDENCE_BUCKET).remove([oldAttachment.file_url])

      const newAtt = attData as AttachmentRow
      setEvidenceMap((prev) => ({ ...prev, [newAtt.ref_id]: newAtt }))
      setViewingEvidence(newAtt)

      const url = await getSignedUrl(EVIDENCE_BUCKET, newAtt.file_url, 600)
      setViewingSignedUrl(url)
    } finally {
      setUploadingEvidenceId(null)
      setReplacingEvidence(null)
      setViewingLoading(false)
    }
  }

  async function handleDeleteEvidence(attachment: AttachmentRow) {
    const ok = window.confirm("Eliminar esta evidencia? Esta accion no se puede deshacer.")
    if (!ok) return
    setDeletingEvidence(true)
    try {
      await supabase.storage.from(EVIDENCE_BUCKET).remove([attachment.file_url])

      const { error: dbErr } = await supabase
        .from("attachments")
        .delete()
        .eq("id", attachment.id)

      if (dbErr) {
        console.error("attachments delete error:", dbErr)
        alert("No se pudo eliminar la evidencia.")
        return
      }

      setEvidenceMap((prev) => {
        const next = { ...prev }
        delete next[attachment.ref_id]
        return next
      })
      setEvidenceViewOpen(false)
      setViewingEvidence(null)
      setViewingSignedUrl(null)
    } finally {
      setDeletingEvidence(false)
    }
  }

  async function handleCreatePayment() {
    if (!obra) return

    const amountNumber = Number(newPaymentForm.amount)
    if (!amountNumber || amountNumber <= 0) {
      alert("Ingresa un monto valido mayor a 0.")
      return
    }

    setNewPaymentSaving(true)

    const payload = {
      obra_id: obra.id,
      concept: newPaymentForm.concept,
      amount: amountNumber,
      method: newPaymentForm.method,
      date: newPaymentForm.date,
      bank_ref: newPaymentForm.bank_ref || null,
      note: newPaymentForm.note || null,
    }

    const { data, error } = await supabase
      .from("obra_state_accounts")
      .insert(payload)
      .select("id, obra_id, amount, concept, method, date, bank_ref, note")
      .single()

    if (error || !data) {
      console.error("Error creating payment:", error)
      alert("No se pudo registrar el movimiento, intenta de nuevo.")
      setNewPaymentSaving(false)
      return
    }

    setStateAccounts((prev) => {
      const next = [...prev, data as ObraStateAccountRow]
      next.sort((a, b) => (a.date > b.date ? -1 : 1))
      const totalSpent = next.reduce((sum, m) => {
        const val = typeof m.amount === "string" ? parseFloat(m.amount) : m.amount
        return sum + (val || 0)
      }, 0)
      setSpentTotal(totalSpent)
      return next
    })

    setNewPaymentForm({
      concept: "deposit",
      amount: "",
      method: "transfer",
      date: new Date().toISOString().slice(0, 10),
      bank_ref: "",
      note: "",
    })
    setNewPaymentOpen(false)
    setNewPaymentSaving(false)
  }

  //  mock (otros tabs)
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

  // Aplica las stats de equipo desde un array ya cargado
  function applyTeamStats(assignments: ObraAssignmentRow[], today: string) {
    const activeAssignments = assignments.filter(
      (a) => !a.assigned_to || a.assigned_to >= today
    )
    setTeamSize(activeAssignments.length)

    const directorAssignment = activeAssignments.find(
      (a) => a.role_on_site === "director_obra"
    )
    let foundManagerName: string | null = null
    if (directorAssignment) {
      const emp = directorAssignment.employees
      if (Array.isArray(emp)) foundManagerName = emp[0]?.full_name ?? null
      else foundManagerName = emp?.full_name ?? null
    }
    setManagerName(foundManagerName)
  }

  // Re-fetcha solo los datos de equipo (para refrescar el card Overview)
  async function fetchTeamStats(obraId: string) {
    const { data, error } = await supabase
      .from("obra_assignments")
      .select("id, obra_id, employee_id, role_on_site, assigned_to, employees(full_name)")
      .eq("obra_id", obraId)
    if (error) { console.error("fetchTeamStats error:", error); return }
    const today = new Date().toISOString().slice(0, 10)
    applyTeamStats((data || []) as ObraAssignmentRow[], today)
  }

  async function loadData() {
      setLoading(true)
      setError(null)

      try {
        const obraId = params.id as string

        await loadIsAdmin()

        const { data: obraData, error: obraError } = await supabase
          .from("obras")
          .select(
            `
            id,
            code,
            name,
            client_name,
            location_text,
            status,
            start_date_planned,
            start_date_actual,
            end_date_planned,
            end_date_actual,
            notes,
            iva_included
          `,
          )
          .eq("id", obraId)
          .single()

        if (obraError || !obraData) {
          console.error("Error fetching obra:", obraError)
          setError("No se encontro la obra o hubo un error al cargarla.")
          setLoading(false)
          return
        }

        const obraRow = obraData as ObraRow
        setObra(obraRow)
        setIvaIncluded(obraRow.iva_included ?? true)

        setEditForm({
          name: obraData.name,
          client_name: obraData.client_name ?? "",
          location_text: obraData.location_text ?? "",
          status: obraData.status as DbObraStatus,
          start_date_planned: obraData.start_date_planned ?? "",
          end_date_planned: obraData.end_date_planned ?? "",
          notes: obraData.notes ?? "",
        })

        const [
          { data: contractsData, error: contractsError },
          { data: stateAccountsData, error: stateAccountsError },
          { data: reportsData, error: reportsError },
          { data: assignmentsData, error: assignmentsError },
          { data: billingItemsData, error: billingItemsError },
        ] = await Promise.all([
          supabase.from("contracts").select("id, obra_id, contract_amount, currency").eq("obra_id", obraId),
          supabase
            .from("obra_state_accounts")
            .select("id, obra_id, amount, concept, method, date, bank_ref, note")
            .eq("obra_id", obraId),
          supabase
            .from("site_reports")
            .select("id, obra_id, report_date, progress_percent")
            .eq("obra_id", obraId)
            .order("report_date", { ascending: false })
            .limit(1),
          supabase
            .from("obra_assignments")
            .select("id, obra_id, employee_id, role_on_site, assigned_to, employees(full_name)")
            .eq("obra_id", obraId),
          supabase
            .from("obra_billing_items")
            .select("id, obra_id, type, description, amount, date, created_at")
            .eq("obra_id", obraId)
            .order("date", { ascending: true }),
        ])

        if (contractsError) console.error("contracts error", contractsError)
        if (stateAccountsError) console.error("state accounts error", stateAccountsError)
        if (reportsError) console.error("reports error", reportsError)
        if (assignmentsError) console.error("assignments error", assignmentsError)
        if (billingItemsError) console.error("billing items error", billingItemsError)

        const contracts = (contractsData || []) as ContractRow[]
        const totalContractAmount = contracts.reduce((sum, c) => {
          const val = typeof c.contract_amount === "string" ? parseFloat(c.contract_amount) : c.contract_amount || 0
          return sum + (val || 0)
        }, 0)

        const currency =
          contracts[0]?.currency && contracts[0].currency.trim() !== "" ? contracts[0].currency : "MXN"

        // Load billing items and compute budget from them instead of contracts
        const loadedBillingItems = (billingItemsData || []) as BillingItem[]
        setBillingItems(loadedBillingItems)

        const totalBillingAmount = loadedBillingItems.reduce((sum, item) => sum + Number(item.amount || 0), 0)
        setBudgetTotal(totalBillingAmount)
        setBudgetCurrency(currency)

        const stateAccounts = (stateAccountsData || []) as ObraStateAccountRow[]
        stateAccounts.sort((a, b) => (a.date > b.date ? -1 : 1))
        setStateAccounts(stateAccounts)

        // Cargar evidencias de los movimientos
        if (stateAccounts.length > 0) {
          const accountIds = stateAccounts.map((a) => a.id)
          const { data: evidenceData } = await supabase
            .from("attachments")
            .select("id, ref_table, ref_id, file_url, file_name, mime_type, size_bytes, uploaded_by, uploaded_at")
            .eq("ref_table", "obra_state_accounts")
            .in("ref_id", accountIds)

          const map: Record<string, AttachmentRow> = {}
          ;(evidenceData || []).forEach((a: any) => {
            map[a.ref_id] = a as AttachmentRow
          })
          setEvidenceMap(map)
        }

        const totalSpent = stateAccounts.reduce((sum, m) => {
          const val = typeof m.amount === "string" ? parseFloat(m.amount) : m.amount
          return sum + (val || 0)
        }, 0)
        setSpentTotal(totalSpent)

        const lastReport = (reportsData || []) as SiteReportRow[]
        const progressValue = lastReport[0]?.progress_percent
        setProgress(progressValue !== null && progressValue !== undefined ? Number(progressValue) : 0)

        const today = new Date().toISOString().slice(0, 10)
        const assignments = (assignmentsData || []) as ObraAssignmentRow[]
        applyTeamStats(assignments, today)

        await fetchDocuments(obraId)
      } catch (e) {
        console.error(e)
        setError("Error inesperado al cargar la obra.")
      } finally {
        setLoading(false)
      }
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id])

  if (loading) {
    return (
      <AdminLayout>
        <div className="py-10 text-center text-slate-500 text-sm">Cargando informacion de la obra...</div>
      </AdminLayout>
    )
  }

  if (error || !obra) {
    return (
      <AdminLayout>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Link href="/admin/projects">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <h1 className="text-2xl font-bold text-slate-900">Detalle de obra</h1>
          </div>
          <Card>
            <CardContent className="py-10 text-center text-red-500">{error ?? "No se encontro la obra."}</CardContent>
          </Card>
        </div>
      </AdminLayout>
    )
  }

  const statusUi = mapDbStatusToBadge(obra.status)

  const displayedProgress = Math.max(0, Math.min(100, Number.isFinite(progress) ? progress : 0))

  const budgetFormatted = formatCurrency(budgetTotal, budgetCurrency)
  const spentFormatted = formatCurrency(spentTotal, budgetCurrency)
  const remaining = budgetTotal - spentTotal
  const remainingFormatted = formatCurrency(remaining, budgetCurrency)

  // Billing items computed values
  const cotizacion = billingItems.find((b) => b.type === "cotizacion") ?? null
  const aditivos = billingItems.filter((b) => b.type === "aditivo")
  const totalBilling = billingItems.reduce((s, b) => s + Number(b.amount || 0), 0)
  const saldoPendiente = totalBilling - spentTotal
  const avanceFinanciero = totalBilling > 0 ? Math.min(100, Math.round((spentTotal / totalBilling) * 100)) : 0

  const startDate = obra.start_date_actual ?? obra.start_date_planned ?? "Sin fecha de inicio"
  const endDate = obra.end_date_actual ?? obra.end_date_planned ?? "Sin fecha de cierre"

  const location = obra.location_text ?? "Sin ubicacion registrada"
  const clientName = obra.client_name ?? "Cliente no especificado"

  // ===== CRUD Functions for Billing Items =====

  async function handleSaveBillingItem() {
    if (!obra) return
    const amount = parseFloat(billingForm.amount.replace(/[^0-9.]/g, ""))
    if (isNaN(amount) || amount <= 0) {
      setBillingError("Ingresa un monto valido.")
      return
    }
    if (billingForm.type === "cotizacion" && !editingBillingItem) {
      const hasCotizacion = billingItems.some((b) => b.type === "cotizacion")
      if (hasCotizacion) {
        setBillingError("Ya existe una cotizacion. Edita la existente.")
        return
      }
    }
    setSavingBilling(true)
    setBillingError(null)
    const { data: authData } = await supabase.auth.getUser()
    const created_by = authData?.user?.id ?? null
    if (editingBillingItem) {
      const { error } = await supabase
        .from("obra_billing_items")
        .update({ description: billingForm.description || null, amount, date: billingForm.date })
        .eq("id", editingBillingItem.id)
      if (error) { setBillingError("No se pudo actualizar."); setSavingBilling(false); return }
    } else {
      const { error } = await supabase.from("obra_billing_items").insert({
        obra_id: obra.id, type: billingForm.type, description: billingForm.description || null,
        amount, date: billingForm.date, created_by,
      })
      if (error) { setBillingError("No se pudo guardar."); setSavingBilling(false); return }
    }
    setBillingDialogOpen(false)
    setEditingBillingItem(null)
    setSavingBilling(false)
    // Reload data to refresh billing items
    const obraId = params.id as string
    const { data: billingItemsData, error: billingItemsError } = await supabase
      .from("obra_billing_items")
      .select("id, obra_id, type, description, amount, date, created_at")
      .eq("obra_id", obraId)
      .order("date", { ascending: true })
    if (billingItemsError) console.error("billing items error", billingItemsError)
    const loadedBillingItems = (billingItemsData || []) as BillingItem[]
    setBillingItems(loadedBillingItems)
    const totalBillingAmount = loadedBillingItems.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    setBudgetTotal(totalBillingAmount)
  }

  async function handleIvaChange(value: boolean) {
    setIvaIncluded(value)
    if (!obra) return
    await supabase.from("obras").update({ iva_included: value }).eq("id", obra.id)
  }

  async function handleDeleteBillingItem(item: BillingItem) {
    const label = item.type === "cotizacion" ? "la cotizacion" : `el aditivo`
    const ok = window.confirm(`Eliminar ${label}?`)
    if (!ok) return
    const { error } = await supabase.from("obra_billing_items").delete().eq("id", item.id)
    if (error) { console.error("delete billing item error:", error); return }
    // Reload data
    const obraId = params.id as string
    const { data: billingItemsData, error: billingItemsError } = await supabase
      .from("obra_billing_items")
      .select("id, obra_id, type, description, amount, date, created_at")
      .eq("obra_id", obraId)
      .order("date", { ascending: true })
    if (billingItemsError) console.error("billing items error", billingItemsError)
    const loadedBillingItems = (billingItemsData || []) as BillingItem[]
    setBillingItems(loadedBillingItems)
    const totalBillingAmount = loadedBillingItems.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    setBudgetTotal(totalBillingAmount)
  }

  function openAddBillingItem(type: "cotizacion" | "aditivo") {
    setEditingBillingItem(null)
    setBillingForm({ type, description: "", amount: "", date: new Date().toISOString().slice(0, 10) })
    setBillingError(null)
    setBillingDialogOpen(true)
  }

  function openEditBillingItem(item: BillingItem) {
    setEditingBillingItem(item)
    setBillingForm({ type: item.type, description: item.description || "", amount: String(item.amount), date: item.date })
    setBillingError(null)
    setBillingDialogOpen(true)
  }

  return (
    <RoleGuard allowed={["admin"]}>
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin/projects">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">{obra.name}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-1 text-sm">
                <MapPin className="w-4 h-4 text-slate-500" />
                <span className="text-slate-600">{location}</span>
                <span className="text-slate-400 mx-2">-</span>
                <span className="text-slate-500">
                  Cliente: <span className="font-medium">{clientName}</span>
                </span>
                {obra.code && (
                  <>
                    <span className="text-slate-400 mx-2">-</span>
                    <span className="text-slate-500">
                      Clave: <span className="font-mono text-xs">{obra.code}</span>
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Edit className="w-4 h-4 mr-2" />
              Edit Project
            </Button>

            <Button variant="destructive" onClick={handleDeleteObra} disabled={deleteLoading}>
              {deleteLoading ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </div>

        {/* Tabs + contenido */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="milestones">Documents</TabsTrigger>
            <TabsTrigger value="account">Estado de Cuenta</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          {/* OVERVIEW */}
          <TabsContent value="overview" className="space-y-6">
            {/* Overview cards (Status / Progress / Budget / Team) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Status */}
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-600">Status</p>
                      <Badge className={`${statusUi.className} mt-2`}>{statusUi.label}</Badge>
                      <p className="text-xs text-slate-500 mt-2">
                        Inicio: {startDate}
                        <br />
                        Fin: {endDate}
                      </p>
                    </div>
                    <div className="p-3 bg-blue-50 rounded-lg">
                      <Clock className="w-5 h-5 text-blue-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Progress */}
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-600">Progress</p>
                      <p className="text-2xl font-bold text-slate-900 mt-2">{displayedProgress}%</p>
                      <p className="text-xs text-slate-500 mt-1">Basado en el ultimo reporte de obra</p>
                    </div>
                    <div className="p-3 bg-green-50 rounded-lg">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Budget - clickable */}
              <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab("account")}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-600">Budget</p>
                      <p className="text-2xl font-bold text-slate-900 mt-2">{budgetFormatted}</p>
                      <p className="text-xs text-slate-500 mt-1">Spent: {spentFormatted}</p>
                    </div>
                    <div className="p-3 bg-purple-50 rounded-lg">
                      <DollarSign className="w-5 h-5 text-purple-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Team size - clickable */}
              <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab("team")}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-600">Team Size</p>
                      <p className="text-xs text-slate-500 mt-1">
                        Director de Obra:{" "}
                        <span className="font-medium text-slate-900">{managerName ?? "Sin asignar"}</span>
                      </p>
                      <p className="text-2xl font-bold text-slate-900 mt-3">{teamSize}</p>
                    </div>
                    <div className="p-3 bg-orange-50 rounded-lg">
                      <Users className="w-5 h-5 text-orange-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Project Details */}
            <Card>
              <CardHeader>
                <CardTitle>Project Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-slate-600">Description / Notes</p>
                  <p className="text-sm text-slate-900 mt-1">{obra.notes || "No hay notas registradas aun para esta obra."}</p>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div>
                    <p className="text-sm font-medium text-slate-600">Start Date (planned / actual)</p>
                    <p className="text-sm text-slate-900 mt-1">{startDate}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-600">End Date (planned / actual)</p>
                    <p className="text-sm text-slate-900 mt-1">{endDate}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-600">Client</p>
                    <p className="text-sm text-slate-900 mt-1">{clientName}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-600">Location</p>
                    <p className="text-sm text-slate-900 mt-1">{location}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Budget Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Budget Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-600">Total Spent</span>
                      <span className="text-sm font-bold text-slate-900">
                        {budgetTotal > 0 ? `${Math.round((spentTotal / budgetTotal) * 100)}%` : "0%"}
                      </span>
                    </div>
                    <Progress
                      value={budgetTotal > 0 ? Math.min(100, Math.max(0, (spentTotal / budgetTotal) * 100)) : 0}
                      className="h-2"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                    <div>
                      <p className="text-sm text-slate-600">Total Budget</p>
                      <p className="text-lg font-bold text-slate-900">{budgetFormatted}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-600">Remaining</p>
                      <p className="text-lg font-bold text-green-600">{remainingFormatted}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* MILESTONES => Documentos (Opcion B con modal) */}
          <TabsContent value="milestones" forceMount className="space-y-6">
            {/* Header */}
            <ProjectDocumentsTab obraId={obra.id}/>
          </TabsContent>

          {/* ESTADO DE CUENTA */}
          <TabsContent value="account" className="space-y-6">

            {/* CARD 1 — Balance General */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Balance General de la Obra</CardTitle>
                <Select
                  value={ivaIncluded ? "con_iva" : "sin_iva"}
                  onValueChange={(v) => handleIvaChange(v === "con_iva")}
                >
                  <SelectTrigger
                    className={`w-36 h-9 cursor-pointer border-2 font-bold text-base ${
                      ivaIncluded
                        ? "bg-green-50 border-green-400 text-green-700 hover:bg-green-100"
                        : "bg-red-50 border-red-400 text-red-700 hover:bg-red-100"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      {ivaIncluded
                        ? <CheckCircle2 className="w-4 h-4 shrink-0" />
                        : <XCircle className="w-4 h-4 shrink-0" />}
                      <span>{ivaIncluded ? "Con IVA" : "Sin IVA"}</span>
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="con_iva">
                      <div className="flex items-center gap-2 font-semibold text-green-700">
                        <CheckCircle2 className="w-4 h-4" />
                        Con IVA
                      </div>
                    </SelectItem>
                    <SelectItem value="sin_iva">
                      <div className="flex items-center gap-2 font-semibold text-red-600">
                        <XCircle className="w-4 h-4" />
                        Sin IVA
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total a cobrar</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1">{formatCurrency(totalBilling, budgetCurrency)}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Cotizacion + Aditivos</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Cobrado</p>
                    <p className="text-2xl font-bold text-green-600 mt-1">{spentFormatted}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Saldo pendiente</p>
                    <p className={`text-2xl font-bold mt-1 ${saldoPendiente < 0 ? "text-red-600" : "text-slate-900"}`}>
                      {formatCurrency(saldoPendiente, budgetCurrency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Avance financiero</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1">{avanceFinanciero}%</p>
                    <div className="mt-2">
                      <Progress value={avanceFinanciero} className="h-2" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* CARD 2 — Cotizacion y Aditivos */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Cotizacion y Aditivos</CardTitle>
                <Button size="sm" onClick={() => openAddBillingItem("aditivo")}>
                  <Plus className="w-4 h-4 mr-1" />
                  Nuevo aditivo
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Cotizacion base */}
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Cotizacion base</p>
                      {cotizacion ? (
                        <>
                          <p className="text-2xl font-bold text-slate-900 mt-1">{formatCurrency(Number(cotizacion.amount), budgetCurrency)}</p>
                          {cotizacion.description && (
                            <p className="text-xs text-slate-500 mt-0.5">{cotizacion.description}</p>
                          )}
                          <p className="text-xs text-slate-400 mt-0.5">{cotizacion.date}</p>
                        </>
                      ) : (
                        <p className="text-sm text-slate-400 mt-1">Sin cotizacion registrada</p>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {cotizacion ? (
                        <>
                          <Button size="sm" variant="outline" onClick={() => openEditBillingItem(cotizacion)}>
                            Editar
                          </Button>
                          <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDeleteBillingItem(cotizacion)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" onClick={() => openAddBillingItem("cotizacion")}>
                          <Plus className="w-4 h-4 mr-1" />
                          Registrar cotizacion
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Tabla de aditivos */}
                {aditivos.length > 0 ? (
                  <div className="rounded-md border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fecha</TableHead>
                          <TableHead>Descripcion</TableHead>
                          <TableHead className="text-right">Monto</TableHead>
                          <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {aditivos.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="text-sm">{item.date}</TableCell>
                            <TableCell className="text-sm">{item.description || "-"}</TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(Number(item.amount), budgetCurrency)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button size="sm" variant="ghost" onClick={() => openEditBillingItem(item)}>Editar</Button>
                                <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDeleteBillingItem(item)}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-slate-50 font-semibold">
                          <TableCell colSpan={2} className="text-slate-700">Total aditivos</TableCell>
                          <TableCell className="text-right font-bold text-slate-900">
                            {formatCurrency(aditivos.reduce((s, a) => s + Number(a.amount || 0), 0), budgetCurrency)}
                          </TableCell>
                          <TableCell />
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 text-center py-2">No hay aditivos registrados aun.</p>
                )}
              </CardContent>
            </Card>

            {/* CARD 3 — Pagos y Movimientos */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Pagos y movimientos</CardTitle>
                <div className="flex gap-2">
                  {stateAccounts.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedPaymentIds(new Set())
                        setEditPaymentsOpen(true)
                      }}
                    >
                      Editar
                    </Button>
                  )}
                  <Button size="sm" onClick={() => setNewPaymentOpen(true)}>
                    + Nuevo deposito
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <input
                  ref={evidenceInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ""
                    if (!file) return
                    if (replacingEvidence) {
                      handleReplaceEvidence(replacingEvidence, file)
                    } else if (pendingEvidenceAccountId) {
                      handleUploadEvidence(pendingEvidenceAccountId, file)
                    }
                  }}
                />
                {stateAccounts.length === 0 ? (
                  <p className="text-sm text-slate-500">Aun no hay movimientos registrados para esta obra.</p>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fecha</TableHead>
                          <TableHead>Concepto</TableHead>
                          <TableHead>Metodo</TableHead>
                          <TableHead>Referencia</TableHead>
                          <TableHead>Nota</TableHead>
                          <TableHead>Evidencia</TableHead>
                          <TableHead className="text-right">Monto</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stateAccounts.map((m) => {
                          const amountNumber = typeof m.amount === "string" ? parseFloat(m.amount) : m.amount
                          const evidence = evidenceMap[m.id]
                          const isUploading = uploadingEvidenceId === m.id
                          return (
                            <TableRow key={m.id}>
                              <TableCell>{m.date}</TableCell>
                              <TableCell>
                                {m.concept === "deposit" ? "Deposito" : m.concept === "advance" ? "Anticipo" : m.concept === "retention" ? "Retencion" : "Devolucion"}
                              </TableCell>
                              <TableCell>
                                {m.method === "transfer" ? "Transferencia" : m.method === "cash" ? "Efectivo" : m.method === "check" ? "Cheque" : "Otro"}
                              </TableCell>
                              <TableCell>{m.bank_ref || "-"}</TableCell>
                              <TableCell className="max-w-xs truncate">{m.note || "-"}</TableCell>
                              <TableCell>
                                {isUploading ? (
                                  <span className="text-xs text-slate-400 flex items-center gap-1">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    Subiendo...
                                  </span>
                                ) : evidence ? (
                                  <Button size="sm" variant="outline" className="text-xs h-7 cursor-pointer gap-1" onClick={() => handleViewEvidence(evidence)}>
                                    <Eye className="w-3 h-3" />
                                    Visualizar
                                  </Button>
                                ) : (
                                  <Button size="sm" variant="ghost" className="text-xs h-7 cursor-pointer text-slate-500 hover:text-slate-900" onClick={() => { setPendingEvidenceAccountId(m.id); evidenceInputRef.current?.click() }}>
                                    + Agregar
                                  </Button>
                                )}
                              </TableCell>
                              <TableCell className="text-right font-medium">{formatCurrency(Number(amountNumber || 0), budgetCurrency)}</TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TEAM  */}
          <TabsContent value="team" forceMount className="space-y-6">
            <ProjectTeamTab obraId={obra.id} allowManage onTeamChange={() => fetchTeamStats(obra.id)} />
          </TabsContent>

          {/* ACTIVITY (mock) */}
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

      {/* Dialog edit obra */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit Obra</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-600">Name *</label>
              <Input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-600">Client Name</label>
              <Input value={editForm.client_name} onChange={(e) => setEditForm((f) => ({ ...f, client_name: e.target.value }))} />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-600">Location</label>
              <Input value={editForm.location_text} onChange={(e) => setEditForm((f) => ({ ...f, location_text: e.target.value }))} />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-600">Status</label>
              <Select value={editForm.status} onValueChange={(v) => setEditForm((f) => ({ ...f, status: v as DbObraStatus }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planned">Planned</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">Planned Start</label>
                <Input type="date" value={editForm.start_date_planned || ""} onChange={(e) => setEditForm((f) => ({ ...f, start_date_planned: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">Planned End</label>
                <Input type="date" value={editForm.end_date_planned || ""} onChange={(e) => setEditForm((f) => ({ ...f, end_date_planned: e.target.value }))} />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-600">Notes</label>
              <Textarea value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} rows={3} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpdateObra} disabled={savingEdit}>
                {savingEdit ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog nuevo deposito / movimiento */}
      <Dialog open={newPaymentOpen} onOpenChange={setNewPaymentOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar nuevo deposito</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">Concepto</label>
                <Select value={newPaymentForm.concept} onValueChange={(v) => setNewPaymentForm((f) => ({ ...f, concept: v as ObraStateAccountRow["concept"] }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="deposit">Deposito</SelectItem>
                    <SelectItem value="advance">Anticipo</SelectItem>
                    <SelectItem value="retention">Retencion</SelectItem>
                    <SelectItem value="return">Devolucion</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">Monto</label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={newPaymentForm.amount}
                  onChange={(e) => setNewPaymentForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">Metodo de pago</label>
                <Select value={newPaymentForm.method || "transfer"} onValueChange={(v) => setNewPaymentForm((f) => ({ ...f, method: v as ObraStateAccountRow["method"] }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="transfer">Transferencia</SelectItem>
                    <SelectItem value="cash">Efectivo</SelectItem>
                    <SelectItem value="check">Cheque</SelectItem>
                    <SelectItem value="other">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">Fecha del deposito</label>
                <Input type="date" value={newPaymentForm.date} onChange={(e) => setNewPaymentForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-600">Referencia bancaria</label>
              <Input value={newPaymentForm.bank_ref} onChange={(e) => setNewPaymentForm((f) => ({ ...f, bank_ref: e.target.value }))} placeholder="Referencia / folio / recibo" />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-600">Nota</label>
              <Textarea rows={3} value={newPaymentForm.note} onChange={(e) => setNewPaymentForm((f) => ({ ...f, note: e.target.value }))} placeholder="Comentario adicional sobre este movimiento" />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setNewPaymentOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreatePayment} disabled={newPaymentSaving}>
                {newPaymentSaving ? "Guardando..." : "Guardar deposito"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Dialog visualizador de evidencia */}
      <Dialog
        open={evidenceViewOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEvidenceViewOpen(false)
            setViewingEvidence(null)
            setViewingSignedUrl(null)
          }
        }}
      >
        <DialogContent className="max-w-3xl w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileText className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{viewingEvidence?.file_name || "Evidencia"}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="mt-1 min-h-[200px] flex items-center justify-center">
            {viewingLoading ? (
              <div className="flex flex-col items-center gap-2 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin" />
                <span className="text-sm">Cargando archivo...</span>
              </div>
            ) : viewingSignedUrl ? (
              viewingEvidence?.mime_type?.startsWith("image/") ? (
                <img
                  src={viewingSignedUrl}
                  alt={viewingEvidence?.file_name || "Evidencia"}
                  className="max-h-[60vh] w-full object-contain rounded border border-slate-200"
                />
              ) : (
                <iframe
                  src={viewingSignedUrl}
                  title={viewingEvidence?.file_name || "Evidencia"}
                  className="w-full h-[60vh] rounded border border-slate-200"
                />
              )
            ) : (
              <p className="text-sm text-red-500">No se pudo cargar el archivo.</p>
            )}
          </div>

          <div className="flex items-center justify-between pt-3 border-t">
            <Button
              variant="destructive"
              size="sm"
              disabled={deletingEvidence || viewingLoading}
              onClick={() => viewingEvidence && handleDeleteEvidence(viewingEvidence)}
            >
              {deletingEvidence ? (
                <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Eliminando...</>
              ) : (
                <><Trash2 className="w-3 h-3 mr-1" />Eliminar</>
              )}
            </Button>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={viewingLoading || deletingEvidence}
                onClick={() => {
                  if (viewingEvidence) {
                    setReplacingEvidence(viewingEvidence)
                    evidenceInputRef.current?.click()
                  }
                }}
              >
                <Edit className="w-3 h-3 mr-1" />
                Reemplazar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEvidenceViewOpen(false)}
              >
                Cerrar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Editar / Eliminar pagos */}
      <Dialog open={editPaymentsOpen} onOpenChange={(v) => (deletingPayments ? null : setEditPaymentsOpen(v))}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar pagos y movimientos</DialogTitle>
          </DialogHeader>

          <div className="mt-2 space-y-3">
            <p className="text-sm text-slate-500">
              Selecciona los movimientos que deseas eliminar y confirma.
            </p>

            <div className="rounded-md border overflow-hidden max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        className="rounded border-slate-300"
                        checked={selectedPaymentIds.size === stateAccounts.length && stateAccounts.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedPaymentIds(new Set(stateAccounts.map((a) => a.id)))
                          } else {
                            setSelectedPaymentIds(new Set())
                          }
                        }}
                      />
                    </TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Concepto</TableHead>
                    <TableHead>Metodo</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stateAccounts.map((m) => {
                    const amountNumber = typeof m.amount === "string" ? parseFloat(m.amount) : m.amount
                    const checked = selectedPaymentIds.has(m.id)
                    return (
                      <TableRow
                        key={m.id}
                        className={`cursor-pointer ${checked ? "bg-red-50" : "hover:bg-slate-50"}`}
                        onClick={() =>
                          setSelectedPaymentIds((prev) => {
                            const next = new Set(prev)
                            if (next.has(m.id)) next.delete(m.id)
                            else next.add(m.id)
                            return next
                          })
                        }
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="rounded border-slate-300"
                            checked={checked}
                            onChange={() =>
                              setSelectedPaymentIds((prev) => {
                                const next = new Set(prev)
                                if (next.has(m.id)) next.delete(m.id)
                                else next.add(m.id)
                                return next
                              })
                            }
                          />
                        </TableCell>
                        <TableCell className="text-sm">{m.date}</TableCell>
                        <TableCell className="text-sm">
                          {m.concept === "deposit" ? "Deposito" : m.concept === "advance" ? "Anticipo" : m.concept === "retention" ? "Retencion" : "Devolucion"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {m.method === "transfer" ? "Transferencia" : m.method === "cash" ? "Efectivo" : m.method === "check" ? "Cheque" : "Otro"}
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(Number(amountNumber || 0), budgetCurrency)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {selectedPaymentIds.size > 0 && (
              <p className="text-sm text-red-600 font-medium">
                {selectedPaymentIds.size} movimiento{selectedPaymentIds.size > 1 ? "s" : ""} seleccionado{selectedPaymentIds.size > 1 ? "s" : ""} para eliminar.
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditPaymentsOpen(false)} disabled={deletingPayments}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                disabled={selectedPaymentIds.size === 0 || deletingPayments}
                onClick={async () => {
                  const ok = window.confirm(`Eliminar ${selectedPaymentIds.size} movimiento${selectedPaymentIds.size > 1 ? "s" : ""}? Esta accion no se puede deshacer.`)
                  if (!ok) return
                  setDeletingPayments(true)
                  const ids = Array.from(selectedPaymentIds)
                  const { error } = await supabase
                    .from("obra_state_accounts")
                    .delete()
                    .in("id", ids)
                  if (error) {
                    console.error("delete payments error:", error)
                  } else {
                    setStateAccounts((prev) => prev.filter((a) => !selectedPaymentIds.has(a.id)))
                    setEvidenceMap((prev) => {
                      const next = { ...prev }
                      ids.forEach((id) => delete next[id])
                      return next
                    })
                    setSelectedPaymentIds(new Set())
                    setEditPaymentsOpen(false)
                    await loadData()
                  }
                  setDeletingPayments(false)
                }}
              >
                {deletingPayments ? "Eliminando..." : `Eliminar${selectedPaymentIds.size > 0 ? ` (${selectedPaymentIds.size})` : ""}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Cotizacion / Aditivo */}
      <Dialog open={billingDialogOpen} onOpenChange={(v) => (savingBilling ? null : setBillingDialogOpen(v))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingBillingItem
                ? editingBillingItem.type === "cotizacion" ? "Editar cotizacion" : "Editar aditivo"
                : billingForm.type === "cotizacion" ? "Registrar cotizacion" : "Nuevo aditivo"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-600">Fecha</label>
              <Input type="date" value={billingForm.date} onChange={(e) => setBillingForm((f) => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-600">
                {billingForm.type === "cotizacion" ? "Descripcion (opcional)" : "Descripcion del aditivo"}
              </label>
              <Input
                value={billingForm.description}
                onChange={(e) => setBillingForm((f) => ({ ...f, description: e.target.value }))}
                placeholder={billingForm.type === "cotizacion" ? "Cotizacion inicial..." : "Trabajo extra, material adicional..."}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-600">Monto *</label>
              <Input value={billingForm.amount} onChange={(e) => setBillingForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
            </div>
            {billingError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{billingError}</div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setBillingDialogOpen(false)} disabled={savingBilling}>Cancelar</Button>
              <Button onClick={handleSaveBillingItem} disabled={savingBilling}>
                {savingBilling ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
    </RoleGuard>
  )
}
