"use client"

import { useParams, useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react"
import { AdminLayout } from "@/components/admin-layout"
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

// ---------- Tipos DB básicos ----------

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
  if (t === "quote") return "Cotización"
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

// ---------- Página de detalle ----------

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
  const [newPaymentForm, setNewPaymentForm] = useState({
    concept: "deposit" as ObraStateAccountRow["concept"],
    amount: "",
    method: "transfer" as ObraStateAccountRow["method"],
    date: new Date().toISOString().slice(0, 10),
    bank_ref: "",
    note: "",
  })

  // ------------------ Documentos: UI + Modal (Opción B) ------------------

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

    // autollenar título si está vacío
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
    const ok = window.confirm("¿Seguro que deseas eliminar esta obra? Esta acción no se puede deshacer.")
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

  async function handleCreatePayment() {
    if (!obra) return

    const amountNumber = Number(newPaymentForm.amount)
    if (!amountNumber || amountNumber <= 0) {
      alert("Ingresa un monto válido mayor a 0.")
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

  // 👇 mock (otros tabs)
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

  useEffect(() => {
    const loadData = async () => {
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
            notes
          `,
          )
          .eq("id", obraId)
          .single()

        if (obraError || !obraData) {
          console.error("Error fetching obra:", obraError)
          setError("No se encontró la obra o hubo un error al cargarla.")
          setLoading(false)
          return
        }

        setObra(obraData as ObraRow)

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
            .select("id, obra_id, employee_id, role_on_site, employees(full_name)")
            .eq("obra_id", obraId),
        ])

        if (contractsError) console.error("contracts error", contractsError)
        if (stateAccountsError) console.error("state accounts error", stateAccountsError)
        if (reportsError) console.error("reports error", reportsError)
        if (assignmentsError) console.error("assignments error", assignmentsError)

        const contracts = (contractsData || []) as ContractRow[]
        const totalContractAmount = contracts.reduce((sum, c) => {
          const val = typeof c.contract_amount === "string" ? parseFloat(c.contract_amount) : c.contract_amount || 0
          return sum + (val || 0)
        }, 0)

        const currency =
          contracts[0]?.currency && contracts[0].currency.trim() !== "" ? contracts[0].currency : "MXN"

        setBudgetTotal(totalContractAmount)
        setBudgetCurrency(currency)

        const stateAccounts = (stateAccountsData || []) as ObraStateAccountRow[]
        stateAccounts.sort((a, b) => (a.date > b.date ? -1 : 1))
        setStateAccounts(stateAccounts)

        const totalSpent = stateAccounts.reduce((sum, m) => {
          const val = typeof m.amount === "string" ? parseFloat(m.amount) : m.amount
          return sum + (val || 0)
        }, 0)
        setSpentTotal(totalSpent)

        const lastReport = (reportsData || []) as SiteReportRow[]
        const progressValue = lastReport[0]?.progress_percent
        setProgress(progressValue !== null && progressValue !== undefined ? Number(progressValue) : 0)

        const assignments = (assignmentsData || []) as ObraAssignmentRow[]
        setTeamSize(assignments.length)

        const managerAssignment = assignments.find((a) => a.role_on_site?.toLowerCase() === "manager")
        let foundManagerName: string | null = null

        if (managerAssignment) {
          const emp = managerAssignment.employees
          if (Array.isArray(emp)) foundManagerName = emp[0]?.full_name ?? null
          else foundManagerName = emp?.full_name ?? null
        }

        setManagerName(foundManagerName)

        await fetchDocuments(obraId)
      } catch (e) {
        console.error(e)
        setError("Error inesperado al cargar la obra.")
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [params.id])

  if (loading) {
    return (
      <AdminLayout>
        <div className="py-10 text-center text-slate-500 text-sm">Cargando información de la obra...</div>
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
            <CardContent className="py-10 text-center text-red-500">{error ?? "No se encontró la obra."}</CardContent>
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

  const startDate = obra.start_date_actual ?? obra.start_date_planned ?? "Sin fecha de inicio"
  const endDate = obra.end_date_actual ?? obra.end_date_planned ?? "Sin fecha de cierre"

  const location = obra.location_text ?? "Sin ubicación registrada"
  const clientName = obra.client_name ?? "Cliente no especificado"

  return (
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
                <span className="text-slate-400 mx-2">•</span>
                <span className="text-slate-500">
                  Cliente: <span className="font-medium">{clientName}</span>
                </span>
                {obra.code && (
                  <>
                    <span className="text-slate-400 mx-2">•</span>
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
                      <p className="text-xs text-slate-500 mt-1">Basado en el último reporte de obra</p>
                    </div>
                    <div className="p-3 bg-green-50 rounded-lg">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Budget – clickable */}
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

              {/* Team size – clickable */}
              <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab("team")}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-600">Team Size</p>
                      <p className="text-xs text-slate-500 mt-1">
                        Manager:{" "}
                        <span className="font-medium text-slate-900">{managerName ?? "Sin responsable asignado"}</span>
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
                  <p className="text-sm text-slate-900 mt-1">{obra.notes || "No hay notas registradas aún para esta obra."}</p>
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

          {/* MILESTONES => Documentos (Opción B con modal) */}
          <TabsContent value="milestones" className="space-y-6">
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

            {/* Lista de documentos */}
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

                              <TableCell className="text-sm text-slate-600">
                                {new Date(d.created_at).toISOString().slice(0, 10)}
                              </TableCell>

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

            {/* Modal (Opción B) */}
            <Dialog open={uploadOpen} onOpenChange={(v) => (uploadSaving ? null : setUploadOpen(v))}>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Subir documento</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 mt-2">
                  {/* Dropzone */}
                  <div
                    className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4"
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                  >
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
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        value={uploadForm.version}
                        onChange={(e) => setUploadForm((f) => ({ ...f, version: e.target.value }))}
                        placeholder="1"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5 md:col-span-2">
                      <label className="text-xs font-medium text-slate-600">Título *</label>
                      <Input
                        value={uploadForm.title}
                        onChange={(e) => setUploadForm((f) => ({ ...f, title: e.target.value }))}
                        placeholder="Ej. Contrato firmado – Cliente X"
                      />
                      <p className="text-[11px] text-slate-500">Tip: usa un nombre claro (cliente / fecha / versión).</p>
                    </div>

                    <div className="flex flex-col gap-1.5 md:col-span-2">
                      <label className="text-xs font-medium text-slate-600">Notas (opcional)</label>
                      <Textarea
                        rows={3}
                        value={uploadForm.notes}
                        onChange={(e) => setUploadForm((f) => ({ ...f, notes: e.target.value }))}
                        placeholder="Comentarios internos (ej. pendiente de firma del cliente, etc.)"
                      />
                    </div>
                  </div>

                  {uploadError && (
                    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{uploadError}</div>
                  )}

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
          </TabsContent>

          {/* ESTADO DE CUENTA */}
          <TabsContent value="account" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Estado de Cuenta</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <p className="text-sm text-slate-600">Costo de la obra</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1">{budgetFormatted}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Cobrado</p>
                    <p className="text-xl font-semibold text-green-600 mt-1">{spentFormatted}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Restante por cobrar</p>
                    <p className="text-xl font-semibold text-slate-900 mt-1">{remainingFormatted}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Pagos y movimientos</CardTitle>
                <Button size="sm" onClick={() => setNewPaymentOpen(true)}>
                  + Nuevo depósito
                </Button>
              </CardHeader>
              <CardContent>
                {stateAccounts.length === 0 ? (
                  <p className="text-sm text-slate-500">Aún no hay movimientos registrados para esta obra.</p>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fecha depósito</TableHead>
                          <TableHead>Concepto</TableHead>
                          <TableHead>Método</TableHead>
                          <TableHead>Referencia</TableHead>
                          <TableHead>Nota</TableHead>
                          <TableHead className="text-right">Monto</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stateAccounts.map((m) => {
                          const amountNumber = typeof m.amount === "string" ? parseFloat(m.amount) : m.amount
                          return (
                            <TableRow key={m.id}>
                              <TableCell>{m.date}</TableCell>
                              <TableCell>
                                {m.concept === "deposit"
                                  ? "Depósito"
                                  : m.concept === "advance"
                                  ? "Anticipo"
                                  : m.concept === "retention"
                                  ? "Retención"
                                  : "Devolución"}
                              </TableCell>
                              <TableCell>
                                {m.method === "transfer"
                                  ? "Transferencia"
                                  : m.method === "cash"
                                  ? "Efectivo"
                                  : m.method === "check"
                                  ? "Cheque"
                                  : "Otro"}
                              </TableCell>
                              <TableCell>{m.bank_ref || "-"}</TableCell>
                              <TableCell className="max-w-xs truncate">{m.note || "-"}</TableCell>
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

          {/* TEAM (mock) */}
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

      {/* Dialog nuevo depósito / movimiento */}
      <Dialog open={newPaymentOpen} onOpenChange={setNewPaymentOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar nuevo depósito</DialogTitle>
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
                    <SelectItem value="deposit">Depósito</SelectItem>
                    <SelectItem value="advance">Anticipo</SelectItem>
                    <SelectItem value="retention">Retención</SelectItem>
                    <SelectItem value="return">Devolución</SelectItem>
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
                <label className="text-xs font-medium text-slate-600">Método de pago</label>
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
                <label className="text-xs font-medium text-slate-600">Fecha del depósito</label>
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
                {newPaymentSaving ? "Guardando..." : "Guardar depósito"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  )
}
