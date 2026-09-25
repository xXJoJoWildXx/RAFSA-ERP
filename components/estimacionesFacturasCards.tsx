"use client"

import { useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Plus,
  CheckCircle2,
  FileText,
  Upload,
  Trash2,
  Loader2,
  DollarSign,
  Eye,
  Download,
  AlertTriangle,
  ClipboardList,
  Receipt,
  X,
} from "lucide-react"

/* ─── Types ─── */

interface Estimacion {
  id: string
  obra_id: string
  number: number
  description: string
  amount: number
  date_start: string | null
  date_end: string | null
  status: "pending" | "completed"
  created_at: string
  is_anticipo?: boolean
}

interface Factura {
  id: string
  obra_id: string
  estimacion_id: string | null
  aditivo_id?: string | null
  invoice_number: string
  amount: number
  date: string
  status: "pending" | "paid" | "partial"
  amount_paid: number
  note: string | null
  created_at: string
}

interface Aditivo {
  id: string
  obra_id: string
  description: string | null
  amount: number
  date: string
  with_iva: boolean
}

interface FacturaAttachment {
  id: string
  file_url: string
  file_name: string | null
  mime_type: string | null
}

interface Props {
  obraId: string
  currency?: string
  /** Called when a payment is registered so the parent can refresh state accounts */
  onPaymentRegistered?: () => void
  /** Cambia (se incrementa) para forzar recarga cuando el padre modifica aditivas */
  reloadSignal?: number
}

/* ─── Helpers ─── */

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function fmtCurrency(value: number, currency: string = "MXN"): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency, minimumFractionDigits: 2 }).format(value)
}

/* ─── Component ─── */

export function EstimacionesFacturasCards({ obraId, currency = "MXN", onPaymentRegistered, reloadSignal }: Props) {
  // Data
  const [estimaciones, setEstimaciones] = useState<Estimacion[]>([])
  const [aditivos, setAditivos] = useState<Aditivo[]>([])
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [attachments, setAttachments] = useState<Record<string, FacturaAttachment>>({}) // facturaId → attachment
  const [estAttachments, setEstAttachments] = useState<Record<string, FacturaAttachment>>({}) // estimacionId → attachment
  const [loading, setLoading] = useState(true)

  // Porcentajes de la obra usados para calcular el neto a facturar de estimaciones
  const [garantiaPct, setGarantiaPct] = useState(0) // retención por fondo de garantía
  const [anticipoPct, setAnticipoPct] = useState(0) // amortización de anticipo

  // Estimacion dialog
  const [estDialogOpen, setEstDialogOpen] = useState(false)
  const [editingEst, setEditingEst] = useState<Estimacion | null>(null)
  const [estForm, setEstForm] = useState({ description: "", amount: "", date_start: "", date_end: "" })
  const [estFile, setEstFile] = useState<File | null>(null)
  const [savingEst, setSavingEst] = useState(false)
  const [estFormTouched, setEstFormTouched] = useState(false)

  // Factura dialog
  const [facDialogOpen, setFacDialogOpen] = useState(false)
  const [facTargetEst, setFacTargetEst] = useState<Estimacion | null>(null)
  const [facTargetAditivo, setFacTargetAditivo] = useState<Aditivo | null>(null)
  const [facForm, setFacForm] = useState({ invoice_number: "", amount: "", date: toLocalDateStr(new Date()), note: "" })
  const [savingFac, setSavingFac] = useState(false)
  const [facFile, setFacFile] = useState<File | null>(null)

  // Payment dialog
  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const [payTargetFac, setPayTargetFac] = useState<Factura | null>(null)
  const [payForm, setPayForm] = useState({ amount: "", note: "", method: "transfer", bank_ref: "" })
  const [savingPay, setSavingPay] = useState(false)

  // File preview
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewName, setPreviewName] = useState("")
  const [previewEstId, setPreviewEstId] = useState<string | null>(null) // if previewing an estimacion doc
  const replaceFileRef = useRef<HTMLInputElement>(null)

  // Estimacion file upload
  const [uploadingEstFile, setUploadingEstFile] = useState<string | null>(null)
  const estFileInputRef = useRef<HTMLInputElement>(null)
  const estDialogFileRef = useRef<HTMLInputElement>(null)

  // File input ref (facturas)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ─── Fetch ───

  async function fetchData() {
    const [{ data: estData }, { data: facData }, { data: aditData }, { data: obraData }] = await Promise.all([
      supabase
        .from("obra_estimaciones")
        .select("id, obra_id, number, description, amount, date_start, date_end, status, created_at, is_anticipo")
        .eq("obra_id", obraId)
        .order("number", { ascending: true }),
      supabase
        .from("obra_facturas")
        .select("id, obra_id, estimacion_id, aditivo_id, invoice_number, amount, date, status, amount_paid, note, created_at")
        .eq("obra_id", obraId)
        .order("date", { ascending: true }),
      supabase
        .from("obra_billing_items")
        .select("id, obra_id, description, amount, date, with_iva")
        .eq("obra_id", obraId)
        .eq("type", "aditivo")
        .order("date", { ascending: true }),
      supabase
        .from("obras")
        .select("garantia_pct, anticipo_pct")
        .eq("id", obraId)
        .single(),
    ])

    const loadedEst = (estData || []) as Estimacion[]
    const loadedFac = (facData || []) as Factura[]
    const loadedAdit = (aditData || []) as Aditivo[]
    setEstimaciones(loadedEst)
    setFacturas(loadedFac)
    setAditivos(loadedAdit)
    setGarantiaPct(Number(obraData?.garantia_pct ?? 0))
    setAnticipoPct(Number(obraData?.anticipo_pct ?? 0))

    // Load attachments for facturas
    if (loadedFac.length > 0) {
      const facIds = loadedFac.map((f: Factura) => f.id)
      const { data: attData } = await supabase
        .from("attachments")
        .select("id, ref_id, file_url, file_name, mime_type")
        .eq("ref_table", "obra_facturas")
        .in("ref_id", facIds)

      const attMap: Record<string, FacturaAttachment> = {}
      ;(attData || []).forEach((a: any) => { attMap[a.ref_id] = a })
      setAttachments(attMap)
    }

    // Load attachments for estimaciones
    if (loadedEst.length > 0) {
      const estIds = loadedEst.map((e: Estimacion) => e.id)
      const { data: estAttData } = await supabase
        .from("attachments")
        .select("id, ref_id, file_url, file_name, mime_type")
        .eq("ref_table", "obra_estimaciones")
        .in("ref_id", estIds)

      const estAttMap: Record<string, FacturaAttachment> = {}
      ;(estAttData || []).forEach((a: any) => { estAttMap[a.ref_id] = a })
      setEstAttachments(estAttMap)
    }

    setLoading(false)
  }

  useEffect(() => { fetchData() }, [obraId, reloadSignal]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Computed ───

  const totalEstimaciones = estimaciones.length
  const completedEstimaciones = estimaciones.filter((e: Estimacion) => e.status === "completed").length
  const avanceTrabajo = totalEstimaciones > 0 ? Math.round((completedEstimaciones / totalEstimaciones) * 100) : 0

  const getFacturaForEst = (estId: string) => facturas.find((f: Factura) => f.estimacion_id === estId) ?? null
  const getFacturaForAditivo = (aditivoId: string) => facturas.find((f: Factura) => f.aditivo_id === aditivoId) ?? null

  const round2 = (n: number) => Math.round(n * 100) / 100

  // Neto a facturar de una estimación normal:
  //   monto − retención por fondo de garantía − amortización de anticipo.
  // NO aplica al anticipo (es la primera "estimación") ni a las aditivas.
  // Devuelve null cuando no hay deducciones que mostrar.
  type Deduction = { base: number; retencion: number; amortizacion: number; neto: number }
  const getDeduction = (est: Estimacion): Deduction | null => {
    if (est.is_anticipo) return null
    const base = Number(est.amount)
    const retencion = round2((base * garantiaPct) / 100)
    const amortizacion = round2((base * anticipoPct) / 100)
    if (retencion <= 0 && amortizacion <= 0) return null
    const neto = round2(base - retencion - amortizacion)
    return { base, retencion, amortizacion, neto }
  }

  // ─── CRUD: Estimaciones ───

  function openAddEstimacion() {
    setEditingEst(null)
    setEstForm({ description: "", amount: "", date_start: "", date_end: "" })
    setEstFile(null)
    setEstFormTouched(false)
    setEstDialogOpen(true)
  }

  function openEditEstimacion(est: Estimacion) {
    if (est.is_anticipo) return // el anticipo viene del contrato; no se edita a mano
    setEditingEst(est)
    setEstForm({
      description: est.description,
      amount: String(est.amount),
      date_start: est.date_start ?? "",
      date_end: est.date_end ?? "",
    })
    setEstFile(null)
    setEstFormTouched(false)
    setEstDialogOpen(true)
  }

  async function handleSaveEstimacion() {
    setEstFormTouched(true)
    const amount = parseFloat((estForm.amount || "0").replace(/[^0-9.]/g, ""))
    if (!estForm.description.trim() || !estForm.amount || isNaN(amount) || amount <= 0) return
    setSavingEst(true)

    const { data: authData } = await supabase.auth.getUser()
    const userId = authData?.user?.id ?? null

    let savedEstId: string | null = null

    if (editingEst) {
      await supabase
        .from("obra_estimaciones")
        .update({
          description: estForm.description.trim(),
          amount,
          date_start: estForm.date_start || null,
          date_end: estForm.date_end || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingEst.id)
      savedEstId = editingEst.id
    } else {
      const nextNumber = estimaciones.length > 0 ? Math.max(...estimaciones.map((e: Estimacion) => e.number)) + 1 : 1
      const { data: inserted } = await supabase.from("obra_estimaciones").insert({
        obra_id: obraId,
        number: nextNumber,
        description: estForm.description.trim(),
        amount,
        date_start: estForm.date_start || null,
        date_end: estForm.date_end || null,
        created_by: userId,
      }).select("id").single()
      savedEstId = inserted?.id ?? null
    }

    // Upload attached file if provided
    if (estFile && savedEstId) {
      const ext = estFile.name.split(".").pop() || "pdf"
      const path = `estimaciones/${obraId}/${savedEstId}.${ext}`
      const { error: upErr } = await supabase.storage.from("obra-facturas").upload(path, estFile, { upsert: true })
      if (!upErr) {
        const { data: urlData } = supabase.storage.from("obra-facturas").getPublicUrl(path)
        await supabase.from("attachments").insert({
          ref_table: "obra_estimaciones",
          ref_id: savedEstId,
          file_url: urlData.publicUrl,
          file_name: estFile.name,
          mime_type: estFile.type || null,
          uploaded_by: userId,
        })
      }
    }

    setEstDialogOpen(false)
    setSavingEst(false)
    setEstFile(null)
    await fetchData()
  }

  async function handleDeleteEstimacion(est: Estimacion) {
    if (est.is_anticipo) {
      alert("El anticipo proviene del contrato y no se elimina desde aquí.")
      return
    }
    const factura = getFacturaForEst(est.id)
    if (factura) {
      alert("No se puede eliminar una estimación que ya tiene factura asignada.")
      return
    }
    if (!confirm(`¿Eliminar Estimación #${est.number}?`)) return
    await supabase.from("obra_estimaciones").delete().eq("id", est.id)
    await fetchData()
  }

  // ─── Estimacion Documents ───

  async function handleUploadEstDoc(est: Estimacion, file: File) {
    setUploadingEstFile(est.id)
    const { data: authData } = await supabase.auth.getUser()
    const userId = authData?.user?.id ?? null

    // Delete previous if exists
    const prev = estAttachments[est.id]
    if (prev) {
      await supabase.from("attachments").delete().eq("id", prev.id)
      const prevExt = prev.file_name?.split(".").pop() || "pdf"
      await supabase.storage.from("obra-facturas").remove([`estimaciones/${obraId}/${est.id}.${prevExt}`])
    }

    const ext = file.name.split(".").pop() || "pdf"
    const path = `estimaciones/${obraId}/${est.id}.${ext}`
    const { error: uploadErr } = await supabase.storage.from("obra-facturas").upload(path, file, { upsert: true })
    if (uploadErr) { console.error("upload est doc error:", uploadErr); setUploadingEstFile(null); return }

    const { data: urlData } = supabase.storage.from("obra-facturas").getPublicUrl(path)
    await supabase.from("attachments").insert({
      ref_table: "obra_estimaciones",
      ref_id: est.id,
      file_url: urlData.publicUrl,
      file_name: file.name,
      mime_type: file.type || null,
      uploaded_by: userId,
    })

    setUploadingEstFile(null)
    await fetchData()
  }

  async function handleViewEstDoc(est: Estimacion) {
    const att = estAttachments[est.id]
    if (!att) return
    const ext = att.file_name?.split(".").pop() || "pdf"
    const path = `estimaciones/${obraId}/${est.id}.${ext}`
    const { data } = await supabase.storage.from("obra-facturas").createSignedUrl(path, 300)
    if (data?.signedUrl) {
      setPreviewEstId(est.id)
      setPreviewUrl(data.signedUrl)
      setPreviewName(att.file_name || `estimacion-${est.number}.${ext}`)
    }
  }

  // ─── CRUD: Facturas ───

  function openAddFactura(est: Estimacion) {
    setFacTargetAditivo(null)
    setFacTargetEst(est)
    // Para estimaciones normales se prellena el NETO (monto − retención − amortización);
    // para el anticipo se usa el monto completo.
    const ded = getDeduction(est)
    const preAmount = ded ? ded.neto : Number(est.amount)
    setFacForm({
      invoice_number: "",
      amount: String(preAmount),
      date: toLocalDateStr(new Date()),
      note: "",
    })
    setFacFile(null)
    setFacDialogOpen(true)
  }

  function openAddFacturaAditivo(aditivo: Aditivo) {
    setFacTargetEst(null)
    setFacTargetAditivo(aditivo)
    setFacForm({
      invoice_number: "",
      amount: String(aditivo.amount),
      date: toLocalDateStr(new Date()),
      note: "",
    })
    setFacFile(null)
    setFacDialogOpen(true)
  }

  async function handleSaveFactura() {
    const target = facTargetEst ?? facTargetAditivo
    if (!target || !facForm.invoice_number.trim() || !facForm.amount) return
    setSavingFac(true)

    const amount = parseFloat(facForm.amount.replace(/[^0-9.]/g, ""))
    if (isNaN(amount) || amount <= 0) { setSavingFac(false); return }

    const { data: authData } = await supabase.auth.getUser()
    const userId = authData?.user?.id ?? null

    // Insert factura — cuelga de la estimación O de la aditiva
    const { data: inserted, error } = await supabase
      .from("obra_facturas")
      .insert({
        obra_id: obraId,
        estimacion_id: facTargetEst ? facTargetEst.id : null,
        aditivo_id: facTargetAditivo ? facTargetAditivo.id : null,
        invoice_number: facForm.invoice_number.trim(),
        amount,
        date: facForm.date,
        note: facForm.note.trim() || null,
        created_by: userId,
      })
      .select("id")
      .single()

    if (error || !inserted) { console.error("insert factura error:", error); setSavingFac(false); return }

    // Solo las estimaciones tienen estado; se marca completada al facturar
    if (facTargetEst) {
      await supabase
        .from("obra_estimaciones")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", facTargetEst.id)
    }

    // Upload file if provided
    if (facFile) {
      const ext = facFile.name.split(".").pop() || "pdf"
      const path = `${obraId}/${inserted.id}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from("obra-facturas")
        .upload(path, facFile, { upsert: true })

      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from("obra-facturas").getPublicUrl(path)
        await supabase.from("attachments").insert({
          ref_table: "obra_facturas",
          ref_id: inserted.id,
          file_url: urlData.publicUrl,
          file_name: facFile.name,
          mime_type: facFile.type,
          size_bytes: facFile.size,
          uploaded_by: userId,
        })
      }
    }

    setFacDialogOpen(false)
    setSavingFac(false)
    await fetchData()
  }

  async function handleDeleteFactura(fac: Factura) {
    if (fac.amount_paid > 0) {
      alert("No se puede eliminar una factura que ya tiene pagos registrados.")
      return
    }
    const msg = fac.estimacion_id
      ? `¿Eliminar factura ${fac.invoice_number}? La estimación volverá a estado pendiente.`
      : `¿Eliminar factura ${fac.invoice_number} de la aditiva?`
    if (!confirm(msg)) return

    // Delete attachment if exists
    const att = attachments[fac.id]
    if (att) {
      await supabase.from("attachments").delete().eq("id", att.id)
      // Delete from storage
      const ext = att.file_name?.split(".").pop() || "pdf"
      await supabase.storage.from("obra-facturas").remove([`${obraId}/${fac.id}.${ext}`])
    }

    // Delete factura
    await supabase.from("obra_facturas").delete().eq("id", fac.id)

    // Revert estimacion to pending (solo aplica a facturas de estimación)
    if (fac.estimacion_id) {
      await supabase
        .from("obra_estimaciones")
        .update({ status: "pending", updated_at: new Date().toISOString() })
        .eq("id", fac.estimacion_id)
    }

    await fetchData()
  }

  // ─── Payment from Factura ───

  function openPayDialog(fac: Factura) {
    setPayTargetFac(fac)
    // El monto personalizado NO se auto-rellena; el usuario lo captura.
    setPayForm({ amount: "", note: "", method: "transfer", bank_ref: "" })
    setPayDialogOpen(true)
  }

  async function handleRegisterPayment(fullPayment: boolean) {
    if (!payTargetFac) return
    setSavingPay(true)

    const remaining = Number(payTargetFac.amount) - Number(payTargetFac.amount_paid)
    let payAmount: number

    if (fullPayment) {
      payAmount = remaining
    } else {
      payAmount = parseFloat(payForm.amount.replace(/[^0-9.]/g, ""))
      if (isNaN(payAmount) || payAmount <= 0) { setSavingPay(false); return }
      if (payAmount > remaining) {
        alert(`El monto no puede ser mayor al saldo pendiente de la factura (${fmtCurrency(remaining, currency)}).`)
        setSavingPay(false)
        return
      }
    }

    const { data: authData } = await supabase.auth.getUser()
    const userId = authData?.user?.id ?? null

    // El pago del anticipo se registra como 'advance'; el resto como 'deposit'
    const targetEst = estimaciones.find((e: Estimacion) => e.id === payTargetFac.estimacion_id)
    const concept = targetEst?.is_anticipo ? "advance" : "deposit"

    // Insert into obra_state_accounts
    const { error: payError } = await supabase.from("obra_state_accounts").insert({
      obra_id: obraId,
      concept,
      date: toLocalDateStr(new Date()),
      amount: payAmount,
      method: payForm.method,
      bank_ref: payForm.bank_ref.trim() || null,
      note: payForm.note.trim() || null,
      uploaded_by: userId,
      invoice_number: payTargetFac.invoice_number,
      factura_id: payTargetFac.id,
    })

    if (payError) { console.error("payment error:", payError); setSavingPay(false); return }

    // Update factura amount_paid and status
    const newAmountPaid = Number(payTargetFac.amount_paid) + payAmount
    const newStatus = newAmountPaid >= Number(payTargetFac.amount) ? "paid" : "partial"

    await supabase
      .from("obra_facturas")
      .update({
        amount_paid: newAmountPaid,
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payTargetFac.id)

    setPayDialogOpen(false)
    setSavingPay(false)
    await fetchData()
    onPaymentRegistered?.()
  }

  // ─── Download helper ───

  async function handleDownloadFile(url: string, filename: string) {
    const res = await fetch(url)
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = blobUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(blobUrl)
  }

  // ─── View attachment ───

  async function handleViewAttachment(fac: Factura) {
    const att = attachments[fac.id]
    if (!att) return

    const ext = att.file_name?.split(".").pop() || "pdf"
    const path = `${obraId}/${fac.id}.${ext}`
    const { data } = await supabase.storage.from("obra-facturas").createSignedUrl(path, 300)
    if (data?.signedUrl) {
      setPreviewEstId(null)
      setPreviewUrl(data.signedUrl)
      setPreviewName(att.file_name || `factura.${ext}`)
    }
  }

  // ─── Render ───

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    )
  }

  const STATUS_BADGE: Record<string, { label: string; className: string }> = {
    pending: { label: "Pendiente", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
    paid: { label: "Pagada", className: "bg-green-500/15 text-green-400 border-green-500/30" },
    partial: { label: "Saldo Pendiente", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  }

  // Fila reutilizable de factura (para estimaciones y aditivas)
  const FacturaRow = ({
    title,
    subtitle,
    montoText,
    fac,
    onAssign,
    deduction = null,
  }: {
    title: string
    subtitle: string | null
    montoText: string
    fac: Factura | null
    onAssign: () => void
    deduction?: Deduction | null
  }) => {
    const att = fac ? attachments[fac.id] : null
    const facRemaining = fac ? Number(fac.amount) - Number(fac.amount_paid) : 0
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-700/30 p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{title}</p>
            {subtitle && <p className="text-sm text-slate-300 mt-0.5">{subtitle}</p>}
            <p className="text-xs text-slate-500 mt-0.5">{montoText}</p>
          </div>
        </div>

        {/* Desglose neto a facturar (solo estimaciones normales con deducciones) */}
        {deduction && (
          <div className="mb-3 rounded-md border border-slate-600/70 bg-slate-800/40 p-2.5 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Monto estimación</span>
              <span className="text-slate-300">{fmtCurrency(deduction.base, currency)}</span>
            </div>
            {deduction.retencion > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">− Retención fondo garantía ({garantiaPct}%)</span>
                <span className="text-amber-400">−{fmtCurrency(deduction.retencion, currency)}</span>
              </div>
            )}
            {deduction.amortizacion > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">− Amortización anticipo ({anticipoPct}%)</span>
                <span className="text-amber-400">−{fmtCurrency(deduction.amortizacion, currency)}</span>
              </div>
            )}
            <div className="flex justify-between text-xs font-semibold border-t border-slate-600/70 pt-1">
              <span className="text-slate-300">Neto a facturar</span>
              <span className="text-[#4da8e8]">{fmtCurrency(deduction.neto, currency)}</span>
            </div>
          </div>
        )}

        {fac ? (
          <div className="mt-3 rounded-md border border-slate-600 bg-slate-800/60 p-3">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-semibold text-slate-200">Factura: {fac.invoice_number}</span>
                  <Badge className={`text-xs border ${STATUS_BADGE[fac.status]?.className ?? ""}`}>
                    {STATUS_BADGE[fac.status]?.label ?? fac.status}
                  </Badge>
                </div>
                <p className="text-xs text-slate-400">
                  Monto: {fmtCurrency(Number(fac.amount), currency)}
                  {" · "}Fecha: {fac.date}
                </p>
                {fac.status !== "pending" && (
                  <p className="text-xs text-slate-400">
                    Pagado: {fmtCurrency(Number(fac.amount_paid), currency)}
                    {fac.status === "partial" && (
                      <span className="text-amber-400 ml-1">(Saldo: {fmtCurrency(facRemaining, currency)})</span>
                    )}
                  </p>
                )}
                {fac.note && <p className="text-xs text-slate-500 italic">{fac.note}</p>}
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                {att && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="cursor-pointer h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-slate-700"
                    onClick={() => handleViewAttachment(fac)}
                    title="Ver documento"
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                )}
                {fac.status !== "paid" && (
                  <Button
                    size="sm"
                    className="cursor-pointer text-xs h-8 bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => openPayDialog(fac)}
                  >
                    <DollarSign className="w-3 h-3 mr-1" />
                    Registrar Pago
                  </Button>
                )}
                {fac.amount_paid === 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="cursor-pointer text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8"
                    onClick={() => handleDeleteFactura(fac)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex items-center justify-between border-t border-slate-700/50 pt-3">
            <span className="text-xs text-slate-500 italic">Sin factura asignada</span>
            <Button
              size="sm"
              variant="outline"
              className="cursor-pointer text-xs h-8 bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white"
              onClick={onAssign}
            >
              <Upload className="w-3 h-3 mr-1" />
              Asignar factura
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      {/* ═══════════ CARD: ESTIMACIONES ═══════════ */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <ClipboardList className="w-5 h-5 text-slate-400" />
            <CardTitle className="text-slate-100">Estimaciones</CardTitle>
          </div>
          <Button size="sm" className="cursor-pointer" onClick={openAddEstimacion}>
            <Plus className="w-4 h-4 mr-1" />
            Nueva estimación
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Progress bar */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-400">Avance de trabajo</span>
              <span className="text-sm font-bold text-slate-200">
                {completedEstimaciones}/{totalEstimaciones} — {avanceTrabajo}%
              </span>
            </div>
            <Progress
              value={avanceTrabajo}
              className="h-2.5 bg-slate-700/60 [&>div]:bg-gradient-to-r [&>div]:from-emerald-500 [&>div]:to-green-400"
            />
          </div>

          {/* Table */}
          {estimaciones.length > 0 ? (
            <div className="rounded-md border border-slate-700 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-slate-700/30">
                    <TableHead className="text-slate-400 w-16">#</TableHead>
                    <TableHead className="text-slate-400">Descripción</TableHead>
                    <TableHead className="text-slate-400">Periodo</TableHead>
                    <TableHead className="text-slate-400">Estado</TableHead>
                    <TableHead className="text-right text-slate-400">Monto</TableHead>
                    <TableHead className="text-right text-slate-400">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {estimaciones.map((est: Estimacion) => {
                    const fac = getFacturaForEst(est.id)
                    const isCompleted = est.status === "completed"
                    return (
                      <TableRow key={est.id} className="border-slate-700 hover:bg-slate-700/20">
                        <TableCell className="font-mono font-bold text-slate-300">
                          {est.is_anticipo ? (
                            <Badge className="bg-[#0174bd]/15 text-[#4da8e8] border border-[#0174bd]/30 text-[10px] font-semibold">
                              Anticipo
                            </Badge>
                          ) : (
                            est.number
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-slate-300 max-w-xs">{est.description}</TableCell>
                        <TableCell className="text-sm text-slate-400">
                          {est.date_start && est.date_end
                            ? `${est.date_start} — ${est.date_end}`
                            : est.date_start || est.date_end || "—"}
                        </TableCell>
                        <TableCell>
                          {isCompleted ? (
                            <Badge className="bg-green-500/15 text-green-400 border border-green-500/30 text-xs">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Completada
                            </Badge>
                          ) : (
                            <Badge className="bg-slate-600/30 text-slate-400 border border-slate-600/50 text-xs">
                              Pendiente
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium text-slate-200">
                          {fmtCurrency(Number(est.amount), currency)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {/* Estimacion doc: eye if exists, upload if not */}
                            {estAttachments[est.id] ? (
                              <Button
                                size="sm" variant="ghost"
                                className="cursor-pointer h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-slate-700"
                                onClick={() => handleViewEstDoc(est)}
                                title="Ver documento"
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            ) : (
                              <Button
                                size="sm" variant="ghost"
                                className="cursor-pointer h-8 w-8 p-0 text-slate-500 hover:text-[#4da8e8] hover:bg-[#0174bd]/10"
                                disabled={!!uploadingEstFile}
                                onClick={() => { setUploadingEstFile(est.id); estFileInputRef.current?.click() }}
                                title="Subir documento"
                              >
                                {uploadingEstFile === est.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Upload className="w-4 h-4" />
                                )}
                              </Button>
                            )}
                            {!fac && !est.is_anticipo && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="cursor-pointer text-slate-400 hover:text-slate-100 hover:bg-slate-700 text-xs"
                                onClick={() => openEditEstimacion(est)}
                              >
                                Editar
                              </Button>
                            )}
                            {!fac && !est.is_anticipo && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="cursor-pointer text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                onClick={() => handleDeleteEstimacion(est)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {/* Total row */}
                  <TableRow className="bg-slate-700/40 font-semibold border-slate-700">
                    <TableCell colSpan={4} className="text-slate-300">Total estimaciones</TableCell>
                    <TableCell className="text-right font-bold text-slate-100">
                      {fmtCurrency(estimaciones.reduce((s: number, e: Estimacion) => s + Number(e.amount), 0), currency)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-slate-500 text-center py-4">No hay estimaciones registradas aún.</p>
          )}
        </CardContent>
      </Card>

      {/* ═══════════ CARD: FACTURAS ═══════════ */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <Receipt className="w-5 h-5 text-slate-400" />
            <CardTitle className="text-slate-100">Facturas</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.xml,.jpg,.jpeg,.png"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ""
              if (file) setFacFile(file)
            }}
          />

          {/* Hidden input for estimacion docs */}
          <input
            ref={estFileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.xml,.jpg,.jpeg,.png,.xlsx,.docx"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ""
              if (file && uploadingEstFile) {
                const est = estimaciones.find((es: Estimacion) => es.id === uploadingEstFile)
                if (est) handleUploadEstDoc(est, file)
              }
            }}
          />

          {/* ── Subsección: Facturas de Estimaciones ── */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-300">Estimaciones</p>
            {estimaciones.length > 0 ? (
              <div className="space-y-3">
                {estimaciones.map((est: Estimacion) => (
                  <FacturaRow
                    key={est.id}
                    title={est.is_anticipo ? "Anticipo" : `Estimación #${est.number}`}
                    subtitle={est.description}
                    montoText={`Monto estimado: ${fmtCurrency(Number(est.amount), currency)}`}
                    fac={getFacturaForEst(est.id)}
                    onAssign={() => openAddFactura(est)}
                    deduction={getDeduction(est)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 text-center py-3">
                Registra estimaciones primero para poder asignar facturas.
              </p>
            )}
          </div>

          {/* ── Subsección: Facturas de Aditivas ── */}
          <div className="space-y-3 pt-3 border-t border-slate-700/60">
            <p className="text-sm font-semibold text-slate-300">Aditivas</p>
            {aditivos.length > 0 ? (
              <div className="space-y-3">
                {aditivos.map((ad: Aditivo) => (
                  <FacturaRow
                    key={ad.id}
                    title="Aditiva"
                    subtitle={ad.description}
                    montoText={`Monto: ${fmtCurrency(Number(ad.amount), currency)}`}
                    fac={getFacturaForAditivo(ad.id)}
                    onAssign={() => openAddFacturaAditivo(ad)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 text-center py-3">
                Agrega aditivas para poder asignarles factura.
              </p>
            )}
          </div>

        </CardContent>
      </Card>

      {/* ═══════════ DIALOG: Nueva/Editar Estimación ═══════════ */}
      <Dialog open={estDialogOpen} onOpenChange={(v) => (!savingEst ? setEstDialogOpen(v) : null)}>
        <DialogContent className="max-w-md bg-slate-800 border-slate-700 text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-slate-100">
              {editingEst ? `Editar Estimación #${editingEst.number}` : "Nueva Estimación"}
            </DialogTitle>
          </DialogHeader>
          <div
            className="space-y-4 mt-2"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA" && !savingEst)
                handleSaveEstimacion()
            }}
          >
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-400">Descripción *</label>
              <Textarea
                value={estForm.description}
                onChange={(e) => setEstForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Bloque de trabajo, concepto..."
                className={`bg-slate-700/60 text-slate-100 placeholder:text-slate-500 focus:border-[#0174bd] ${
                  estFormTouched && !estForm.description.trim() ? "border-red-500" : "border-slate-600"
                }`}
                rows={2}
              />
              {estFormTouched && !estForm.description.trim() && (
                <p className="text-[11px] text-red-400">La descripción es obligatoria</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-400">Monto *</label>
              <Input
                value={estForm.amount}
                onChange={(e) => setEstForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                className={`bg-slate-700/60 text-slate-100 placeholder:text-slate-500 focus:border-[#0174bd] ${
                  estFormTouched && (!estForm.amount || isNaN(parseFloat(estForm.amount.replace(/[^0-9.]/g, ""))) || parseFloat(estForm.amount.replace(/[^0-9.]/g, "")) <= 0)
                    ? "border-red-500"
                    : "border-slate-600"
                }`}
              />
              {estFormTouched && (!estForm.amount || isNaN(parseFloat(estForm.amount.replace(/[^0-9.]/g, ""))) || parseFloat(estForm.amount.replace(/[^0-9.]/g, "")) <= 0) && (
                <p className="text-[11px] text-red-400">Ingresa un monto válido mayor a 0</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-400">Fecha inicio</label>
                <Input
                  type="date"
                  value={estForm.date_start}
                  onChange={(e) => setEstForm((f) => ({ ...f, date_start: e.target.value }))}
                  className="bg-slate-700/60 border-slate-600 text-slate-100 focus:border-[#0174bd]"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-400">Fecha fin</label>
                <Input
                  type="date"
                  value={estForm.date_end}
                  onChange={(e) => setEstForm((f) => ({ ...f, date_end: e.target.value }))}
                  className="bg-slate-700/60 border-slate-600 text-slate-100 focus:border-[#0174bd]"
                />
              </div>
            </div>
            {/* Document attachment */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-400">Documento (opcional)</label>
              <input
                ref={estDialogFileRef}
                type="file"
                className="hidden"
                accept=".pdf,.xml,.jpg,.jpeg,.png,.xlsx,.docx"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ""
                  if (f) setEstFile(f)
                }}
              />
              {estFile ? (
                <div className="flex items-center gap-2 rounded-md border border-slate-600 bg-slate-700/40 px-3 py-2">
                  <FileText className="w-4 h-4 text-[#4da8e8] shrink-0" />
                  <span className="text-sm text-slate-200 truncate flex-1">{estFile.name}</span>
                  <Button size="sm" variant="ghost" className="cursor-pointer h-7 w-7 p-0 text-slate-400 hover:text-red-400" onClick={() => setEstFile(null)}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="cursor-pointer bg-transparent border-slate-600 border-dashed text-slate-400 hover:bg-slate-700 hover:text-white"
                  onClick={() => estDialogFileRef.current?.click()}
                >
                  <Upload className="w-4 h-4 mr-1.5" />
                  Adjuntar documento
                </Button>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setEstDialogOpen(false)}
                disabled={savingEst}
                className="cursor-pointer bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white"
              >
                Cancelar
              </Button>
              <Button onClick={handleSaveEstimacion} disabled={savingEst} className="cursor-pointer">
                {savingEst && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                {editingEst ? "Guardar" : "Crear"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══════════ DIALOG: Asignar Factura ═══════════ */}
      <Dialog open={facDialogOpen} onOpenChange={(v) => (!savingFac ? setFacDialogOpen(v) : null)}>
        <DialogContent className="max-w-md bg-slate-800 border-slate-700 text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-slate-100">
              {facTargetAditivo
                ? "Asignar Factura — Aditiva"
                : facTargetEst?.is_anticipo
                ? "Asignar Factura — Anticipo"
                : `Asignar Factura — Estimación #${facTargetEst?.number}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {/* Desglose neto a facturar (solo estimaciones normales) */}
            {facTargetEst && (() => {
              const ded = getDeduction(facTargetEst)
              if (!ded) return null
              return (
                <div className="rounded-md border border-slate-600 bg-slate-700/40 p-3 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Monto estimación</span>
                    <span className="text-slate-200 font-medium">{fmtCurrency(ded.base, currency)}</span>
                  </div>
                  {ded.retencion > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">− Retención fondo garantía ({garantiaPct}%)</span>
                      <span className="text-amber-400">−{fmtCurrency(ded.retencion, currency)}</span>
                    </div>
                  )}
                  {ded.amortizacion > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">− Amortización anticipo ({anticipoPct}%)</span>
                      <span className="text-amber-400">−{fmtCurrency(ded.amortizacion, currency)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-semibold border-t border-slate-600 pt-1">
                    <span className="text-slate-300">Neto a facturar</span>
                    <span className="text-[#4da8e8]">{fmtCurrency(ded.neto, currency)}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 pt-0.5">
                    El monto se prellenó con el neto; puedes ajustarlo si es necesario.
                  </p>
                </div>
              )
            })()}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-400">Número de factura *</label>
              <Input
                value={facForm.invoice_number}
                onChange={(e) => setFacForm((f) => ({ ...f, invoice_number: e.target.value }))}
                placeholder="CFDI-001"
                className="bg-slate-700/60 border-slate-600 text-slate-100 placeholder:text-slate-500 focus:border-[#0174bd]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-400">Monto *</label>
                <Input
                  value={facForm.amount}
                  onChange={(e) => setFacForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00"
                  className="bg-slate-700/60 border-slate-600 text-slate-100 placeholder:text-slate-500 focus:border-[#0174bd]"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-400">Fecha</label>
                <Input
                  type="date"
                  value={facForm.date}
                  onChange={(e) => setFacForm((f) => ({ ...f, date: e.target.value }))}
                  className="bg-slate-700/60 border-slate-600 text-slate-100 focus:border-[#0174bd]"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-400">Nota (opcional)</label>
              <Textarea
                value={facForm.note}
                onChange={(e) => setFacForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="Observaciones..."
                className="bg-slate-700/60 border-slate-600 text-slate-100 placeholder:text-slate-500 focus:border-[#0174bd]"
                rows={2}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-400">Archivo (PDF / XML)</label>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="cursor-pointer bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white text-xs"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-3 h-3 mr-1" />
                  {facFile ? "Cambiar archivo" : "Seleccionar archivo"}
                </Button>
                {facFile && (
                  <span className="text-xs text-slate-400 truncate max-w-[200px]">{facFile.name}</span>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setFacDialogOpen(false)}
                disabled={savingFac}
                className="cursor-pointer bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white"
              >
                Cancelar
              </Button>
              <Button onClick={handleSaveFactura} disabled={savingFac} className="cursor-pointer">
                {savingFac && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                Asignar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══════════ DIALOG: Registrar Pago ═══════════ */}
      <Dialog open={payDialogOpen} onOpenChange={(v) => (!savingPay ? setPayDialogOpen(v) : null)}>
        <DialogContent className="max-w-md bg-slate-800 border-slate-700 text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-slate-100">
              Registrar Pago — Factura {payTargetFac?.invoice_number}
            </DialogTitle>
          </DialogHeader>
          {payTargetFac && (() => {
            const remaining = Number(payTargetFac.amount) - Number(payTargetFac.amount_paid)
            const parsedPay = parseFloat((payForm.amount || "").replace(/[^0-9.]/g, ""))
            const payHasValue = payForm.amount.trim() !== "" && !isNaN(parsedPay) && parsedPay > 0
            const payExceeds = payHasValue && parsedPay > remaining
            const payValid = payHasValue && !payExceeds
            return (
              <div className="space-y-4 mt-2">
                {/* Summary */}
                <div className="rounded-md border border-slate-600 bg-slate-700/40 p-3 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Monto factura:</span>
                    <span className="text-slate-200 font-medium">{fmtCurrency(Number(payTargetFac.amount), currency)}</span>
                  </div>
                  {Number(payTargetFac.amount_paid) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Ya pagado:</span>
                      <span className="text-green-400 font-medium">{fmtCurrency(Number(payTargetFac.amount_paid), currency)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-semibold border-t border-slate-600 pt-1">
                    <span className="text-slate-300">Saldo pendiente:</span>
                    <span className="text-slate-100">{fmtCurrency(remaining, currency)}</span>
                  </div>
                </div>

                {/* Quick full payment */}
                <Button
                  className="cursor-pointer w-full bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => handleRegisterPayment(true)}
                  disabled={savingPay}
                >
                  {savingPay ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
                  Registrar pago completo ({fmtCurrency(remaining, currency)})
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-700" /></div>
                  <div className="relative flex justify-center">
                    <span className="bg-slate-800 px-3 text-xs text-slate-500">o monto personalizado</span>
                  </div>
                </div>

                {/* Custom amount */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-400">Monto a pagar</label>
                  <Input
                    value={payForm.amount}
                    onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))}
                    placeholder="0.00"
                    className={`bg-slate-700/60 text-slate-100 placeholder:text-slate-500 focus:border-[#0174bd] ${
                      payExceeds ? "border-red-500" : "border-slate-600"
                    }`}
                  />
                  {payExceeds && (
                    <p className="text-[11px] text-red-400">
                      El monto ingresado supera el saldo pendiente por cobrar ({fmtCurrency(remaining, currency)}).
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-400">Método</label>
                    <select
                      value={payForm.method}
                      onChange={(e) => setPayForm((f) => ({ ...f, method: e.target.value }))}
                      className="h-10 rounded-md border border-slate-600 bg-slate-700/60 px-3 text-sm text-slate-100 focus:border-[#0174bd] outline-none"
                    >
                      <option value="transfer">Transferencia</option>
                      <option value="cash">Efectivo</option>
                      <option value="check">Cheque</option>
                      <option value="other">Otro</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-400">Ref. bancaria</label>
                    <Input
                      value={payForm.bank_ref}
                      onChange={(e) => setPayForm((f) => ({ ...f, bank_ref: e.target.value }))}
                      placeholder="Opcional"
                      className="bg-slate-700/60 border-slate-600 text-slate-100 placeholder:text-slate-500 focus:border-[#0174bd]"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-400">Nota (opcional)</label>
                  <Textarea
                    value={payForm.note}
                    onChange={(e) => setPayForm((f) => ({ ...f, note: e.target.value }))}
                    placeholder="Observaciones del pago..."
                    className="bg-slate-700/60 border-slate-600 text-slate-100 placeholder:text-slate-500 focus:border-[#0174bd]"
                    rows={2}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setPayDialogOpen(false)}
                    disabled={savingPay}
                    className="cursor-pointer bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white"
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => handleRegisterPayment(false)}
                    disabled={savingPay || !payValid}
                    className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingPay && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                    Registrar pago parcial
                  </Button>
                </div>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* File Preview Dialog */}
      <Dialog open={!!previewUrl} onOpenChange={(v) => { if (!v) { setPreviewUrl(null); setPreviewEstId(null) } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] bg-slate-800 border-slate-700 text-slate-100 flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-3 border-b border-slate-700">
            <DialogTitle className="text-slate-100 truncate">{previewName}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 px-6 pt-3">
            {previewUrl && (/\.(png|jpe?g|gif|webp|svg)$/i.test(previewName) ? (
              <img src={previewUrl} alt={previewName} className="max-w-full max-h-[65vh] mx-auto rounded-md object-contain" />
            ) : (
              <iframe src={previewUrl} title={previewName} className="w-full h-[65vh] rounded-md border border-slate-600 bg-white" />
            ))}
          </div>
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-700">
            {/* Replace button — only for estimacion docs */}
            {previewEstId && (
              <>
                <input
                  ref={replaceFileRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.xml,.jpg,.jpeg,.png,.xlsx,.docx"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ""
                    if (file && previewEstId) {
                      const est = estimaciones.find((es: Estimacion) => es.id === previewEstId)
                      if (est) {
                        setPreviewUrl(null)
                        setPreviewEstId(null)
                        await handleUploadEstDoc(est, file)
                      }
                    }
                  }}
                />
                <Button
                  variant="outline"
                  className="cursor-pointer bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white"
                  onClick={() => replaceFileRef.current?.click()}
                >
                  <Upload className="w-4 h-4 mr-1.5" />
                  Reemplazar
                </Button>
              </>
            )}
            <Button
              className="cursor-pointer bg-[#0174bd] hover:bg-[#0163a3] text-white"
              onClick={() => previewUrl && handleDownloadFile(previewUrl, previewName)}
            >
              <Download className="w-4 h-4 mr-1.5" />
              Descargar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
