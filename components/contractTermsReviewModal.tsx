"use client"

import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Loader2, Sparkles, AlertTriangle, CheckCircle2, FileText } from "lucide-react"

/* ─── Tipos del JSON que devuelve la IA (idéntico al schema de la Edge Function) ─── */
export interface ContractTermsExtraction {
  cliente: string | null
  ubicacion: string | null
  folio_contrato: string | null
  nombre_obra: string | null
  monto_total: number | null
  monto_total_source?: "consenso" | "sin_consenso"
  moneda: string
  iva_incluido: boolean
  anticipo: { porcentaje: number | null; monto: number | null; monto_source?: string }
  saldo: { porcentaje: number | null; monto: number | null; monto_source?: string }
  garantia: { porcentaje: number | null; monto: number | null; monto_source?: string }
  fecha_inicio: string | null
  fecha_termino: string | null
  confianza: number
}

interface DocRef {
  id: string
  bucket: string
  object_path: string
  file_name: string
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  obraId: string
  doc: DocRef | null
  extraction: ContractTermsExtraction | null
  currency?: string
  onApplied?: () => void
}

function fmtCurrency(value: number, currency = "MXN") {
  if (!Number.isFinite(value)) return "-"
  return new Intl.NumberFormat("es-MX", { style: "currency", currency, minimumFractionDigits: 2 }).format(value)
}

function numOrEmpty(v: number | null | undefined): string {
  return v === null || v === undefined || Number.isNaN(v) ? "" : String(v)
}

function parseNum(s: string): number | null {
  const n = parseFloat(String(s).replace(/[^0-9.]/g, ""))
  return Number.isFinite(n) ? n : null
}

/** monto = total × % (redondeado a 2 decimales). Devuelve null si no hay % o total válidos,
 * para no pisar un monto capturado a mano cuando el % está vacío. */
function calcMonto(pctStr: string, totalStr: string): string | null {
  const pct = parseNum(pctStr)
  const total = parseNum(totalStr)
  if (pct === null || total === null || pct <= 0 || total <= 0) return null
  return String(Math.round(total * pct) / 100)
}

export function ContractTermsReviewModal({
  open,
  onOpenChange,
  obraId,
  doc,
  extraction,
  currency = "MXN",
  onApplied,
}: Props) {
  // Editable form
  const [form, setForm] = useState({
    // Datos de cabecera de la obra
    cliente: "",
    ubicacion: "",
    folio: "",
    nombre: "",
    fecha_inicio: "",
    fecha_termino: "",
    // Financieros
    monto_total: "",
    anticipo_pct: "",
    anticipo_amount: "",
    saldo_pct: "",
    saldo_amount: "",
    garantia_pct: "",
    garantia_amount: "",
  })

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // PDF preview
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // Existing state (for conflict detection)
  const [existingCotizacion, setExistingCotizacion] = useState<{ id: string; amount: number } | null>(null)
  const [existingGarantiaStatus, setExistingGarantiaStatus] = useState<string>("none")
  const [existingAnticipoEst, setExistingAnticipoEst] = useState<{ id: string; status: string } | null>(null)
  const [cotizacionChoice, setCotizacionChoice] = useState<"replace" | "keep">("replace")
  const [loadingExisting, setLoadingExisting] = useState(false)

  // Valores actuales de cabecera de la obra (para "solo llenar vacíos")
  const [existingObra, setExistingObra] = useState<{
    client_name: string | null
    location_text: string | null
    code: string | null
    name: string | null
    start_date_planned: string | null
    end_date_planned: string | null
    contract_total_amount: number | null
    anticipo_pct: number | null
    anticipo_amount: number | null
    garantia_pct: number | null
    garantia_amount: number | null
    status: string | null
  } | null>(null)

  const isEmpty = (v: string | null | undefined) => !v || String(v).trim() === ""

  // Init form from extraction
  useEffect(() => {
    if (!extraction) return
    setForm({
      cliente: extraction.cliente ?? "",
      ubicacion: extraction.ubicacion ?? "",
      folio: extraction.folio_contrato ?? "",
      nombre: extraction.nombre_obra ?? "",
      fecha_inicio: extraction.fecha_inicio ?? "",
      fecha_termino: extraction.fecha_termino ?? "",
      monto_total: numOrEmpty(extraction.monto_total),
      anticipo_pct: numOrEmpty(extraction.anticipo?.porcentaje),
      anticipo_amount: numOrEmpty(extraction.anticipo?.monto),
      saldo_pct: numOrEmpty(extraction.saldo?.porcentaje),
      saldo_amount: numOrEmpty(extraction.saldo?.monto),
      garantia_pct: numOrEmpty(extraction.garantia?.porcentaje),
      garantia_amount: numOrEmpty(extraction.garantia?.monto),
    })
    setError(null)
    setCotizacionChoice("replace")
  }, [extraction])

  // Load PDF preview + existing state when opened
  useEffect(() => {
    if (!open || !doc) return
    let active = true
    setLoadingExisting(true)
    ;(async () => {
      // Signed URL for preview
      const { data: urlData } = await supabase.storage
        .from(doc.bucket)
        .createSignedUrl(doc.object_path, 600)
      if (active && urlData?.signedUrl) setPreviewUrl(urlData.signedUrl)

      // Existing cotización
      const { data: cot } = await supabase
        .from("obra_billing_items")
        .select("id, amount")
        .eq("obra_id", obraId)
        .eq("type", "cotizacion")
        .limit(1)
        .maybeSingle()
      if (active) setExistingCotizacion(cot ? { id: cot.id, amount: Number(cot.amount) } : null)

      // Existing garantía status + header fields + valores financieros capturados
      const { data: obra } = await supabase
        .from("obras")
        .select("garantia_status, status, client_name, location_text, code, name, start_date_planned, end_date_planned, contract_total_amount, anticipo_pct, anticipo_amount, garantia_pct, garantia_amount")
        .eq("id", obraId)
        .single()
      if (active) {
        setExistingGarantiaStatus(String(obra?.garantia_status ?? "none"))
        setExistingObra(obra ? {
          client_name: obra.client_name ?? null,
          location_text: obra.location_text ?? null,
          code: obra.code ?? null,
          name: obra.name ?? null,
          start_date_planned: obra.start_date_planned ?? null,
          end_date_planned: obra.end_date_planned ?? null,
          contract_total_amount: obra.contract_total_amount ?? null,
          anticipo_pct: obra.anticipo_pct ?? null,
          anticipo_amount: obra.anticipo_amount ?? null,
          garantia_pct: obra.garantia_pct ?? null,
          garantia_amount: obra.garantia_amount ?? null,
          status: obra.status ?? null,
        } : null)
      }

      // Existing anticipo estimación (para no duplicar)
      const { data: antEst } = await supabase
        .from("obra_estimaciones")
        .select("id, status")
        .eq("obra_id", obraId)
        .eq("is_anticipo", true)
        .limit(1)
        .maybeSingle()
      if (active) setExistingAnticipoEst(antEst ? { id: antEst.id, status: String(antEst.status) } : null)

      if (active) setLoadingExisting(false)
    })()
    return () => {
      active = false
      setPreviewUrl(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, doc?.id, obraId])

  const montoTotalNum = parseNum(form.monto_total)

  // Conflict: existing cotización differs from extracted monto_total
  const hasCotizacionConflict = useMemo(() => {
    if (!existingCotizacion || montoTotalNum === null) return false
    return Math.abs(existingCotizacion.amount - montoTotalNum) > 0.01
  }, [existingCotizacion, montoTotalNum])

  // Comparación: datos financieros ya capturados (manualmente) vs. lo detectado por la IA
  const financialComparison = useMemo(() => {
    if (!extraction || !existingObra) return null
    type Kind = "money" | "pct"

    // Solo comparar si YA hay datos financieros capturados (a mano o previamente).
    // Si la obra no tiene ningún dato financiero registrado, no se muestra el recuadro.
    const hasCaptured =
      (existingObra.contract_total_amount ?? 0) > 0 ||
      (existingObra.anticipo_pct ?? 0) > 0 ||
      (existingObra.anticipo_amount ?? 0) > 0 ||
      (existingObra.garantia_pct ?? 0) > 0 ||
      (existingObra.garantia_amount ?? 0) > 0
    if (!hasCaptured) return null

    // Normaliza a 2 decimales (centavos / centésimas de %) para comparar de forma EXACTA
    const norm = (v: number | null | undefined): number | null =>
      v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 100)
    const pos = (v: number | null | undefined) => (v ?? 0) > 0

    const rows: { label: string; captured: number | null; detected: number | null; congruent: boolean; kind: Kind }[] = []
    const push = (label: string, captured: number | null | undefined, detected: number | null | undefined, kind: Kind) => {
      const cap = captured === null || captured === undefined ? null : Number(captured)
      const det = detected === null || detected === undefined ? null : Number(detected)
      const cN = norm(cap), dN = norm(det)
      // Congruente SOLO si ambos existen y son idénticos al centavo (una diferencia de 0.01 ya es "no igual")
      const congruent = cN !== null && dN !== null && cN === dN
      rows.push({ label, captured: cap, detected: det, congruent, kind })
    }

    // Monto total del contrato
    const mtCap = existingObra.contract_total_amount, mtDet = extraction.monto_total
    if (pos(mtCap) || pos(mtDet)) push("Monto total del contrato", mtCap, mtDet, "money")

    // Anticipo — si aplica (en cualquiera de los lados), muestra % y monto
    const anCapPct = existingObra.anticipo_pct, anCapAmt = existingObra.anticipo_amount
    const anDetPct = extraction.anticipo?.porcentaje ?? null, anDetAmt = extraction.anticipo?.monto ?? null
    if (pos(anCapPct) || pos(anCapAmt) || pos(anDetPct) || pos(anDetAmt)) {
      push("Anticipo (%)", anCapPct, anDetPct, "pct")
      push("Anticipo (monto)", anCapAmt, anDetAmt, "money")
    }

    // Fondo de garantía — si aplica (en cualquiera de los lados), muestra % y monto
    const gaCapPct = existingObra.garantia_pct, gaCapAmt = existingObra.garantia_amount
    const gaDetPct = extraction.garantia?.porcentaje ?? null, gaDetAmt = extraction.garantia?.monto ?? null
    if (pos(gaCapPct) || pos(gaCapAmt) || pos(gaDetPct) || pos(gaDetAmt)) {
      push("Fondo de garantía (%)", gaCapPct, gaDetPct, "pct")
      push("Fondo de garantía (monto)", gaCapAmt, gaDetAmt, "money")
    }

    if (rows.length === 0) return null
    return { rows, allCongruent: rows.every((r) => r.congruent) }
  }, [extraction, existingObra])

  const fmtVal = (v: number | null, kind: "money" | "pct") =>
    v === null ? "—" : kind === "pct" ? `${v}%` : fmtCurrency(v, currency)

  async function handleApply() {
    setError(null)
    if (montoTotalNum === null || montoTotalNum <= 0) {
      setError("El monto total es obligatorio y debe ser mayor a 0.")
      return
    }
    setSaving(true)
    try {
      const anticipoAmount = parseNum(form.anticipo_amount)
      const anticipoPct = parseNum(form.anticipo_pct)
      const saldoAmount = parseNum(form.saldo_amount)
      const saldoPct = parseNum(form.saldo_pct)
      const garantiaAmount = parseNum(form.garantia_amount)
      const garantiaPct = parseNum(form.garantia_pct)

      // Campos financieros ausentes → 0 (no null), como pidió el negocio
      const num0 = (v: number | null) => (v === null ? 0 : v)

      // 1) Update obras — términos del contrato (el anticipo ya NO vive aquí:
      // ahora es una estimación-anticipo, ver más abajo)
      const obraUpdate: Record<string, unknown> = {
        contract_total_amount: montoTotalNum,
        // Saldo: sin UI, siempre se guarda (0 si no aplica)
        saldo_pct: num0(saldoPct),
        saldo_amount: num0(saldoAmount),
        // Porcentajes de garantía y anticipo — siempre se guardan; se usan para
        // calcular retención/amortización en las facturas de estimaciones.
        garantia_pct: num0(garantiaPct),
        anticipo_pct: num0(anticipoPct),
      }

      // Garantía (monto/estatus): solo si aún no está configurada
      if (existingGarantiaStatus === "none") {
        obraUpdate.garantia_amount = num0(garantiaAmount)
        if (num0(garantiaAmount) > 0) obraUpdate.garantia_status = "pending"
      }

      // Al registrar la cotización por primera vez, la obra pasa de "Planeada" a "En progreso"
      if (!existingCotizacion && existingObra?.status === "planned") obraUpdate.status = "in_progress"

      // Datos de cabecera — SOLO si la obra los tiene vacíos ("no pisar lo capturado")
      if (isEmpty(existingObra?.client_name) && !isEmpty(form.cliente)) obraUpdate.client_name = form.cliente.trim()
      if (isEmpty(existingObra?.location_text) && !isEmpty(form.ubicacion)) obraUpdate.location_text = form.ubicacion.trim()
      if (isEmpty(existingObra?.code) && !isEmpty(form.folio)) obraUpdate.code = form.folio.trim()
      if (isEmpty(existingObra?.name) && !isEmpty(form.nombre)) obraUpdate.name = form.nombre.trim()
      if (isEmpty(existingObra?.start_date_planned) && !isEmpty(form.fecha_inicio)) obraUpdate.start_date_planned = form.fecha_inicio
      if (isEmpty(existingObra?.end_date_planned) && !isEmpty(form.fecha_termino)) obraUpdate.end_date_planned = form.fecha_termino

      const { error: obraErr } = await supabase.from("obras").update(obraUpdate).eq("id", obraId)
      if (obraErr) {
        const dup = String(obraErr.message || "").toLowerCase().includes("duplicate") || obraErr.code === "23505"
        throw new Error(
          dup
            ? "El folio del contrato ya está en uso por otra obra. Edítalo o déjalo vacío."
            : "No se pudieron guardar los términos en la obra.",
        )
      }

      // 2) Cotización en obra_billing_items
      const { data: authData } = await supabase.auth.getUser()
      const userId = authData?.user?.id ?? null

      if (!existingCotizacion) {
        // No existe → crear
        const { error: insErr } = await supabase.from("obra_billing_items").insert({
          obra_id: obraId,
          type: "cotizacion",
          description: "Monto del contrato (extraído por IA)",
          amount: montoTotalNum,
          date: new Date().toISOString().slice(0, 10),
          created_by: userId,
          with_iva: true,
        })
        if (insErr) throw new Error("No se pudo crear la cotización.")
      } else if (hasCotizacionConflict && cotizacionChoice === "replace") {
        const { error: updErr } = await supabase
          .from("obra_billing_items")
          .update({ amount: montoTotalNum })
          .eq("id", existingCotizacion.id)
        if (updErr) throw new Error("No se pudo actualizar la cotización.")
      }
      // Si conflicto y choice==="keep", o no hay conflicto → no se toca la cotización

      // 3) Anticipo → estimación-anticipo (is_anticipo). Solo si hay monto (>0).
      //    Si no hay anticipo, no se crea ninguna estimación.
      const antAmt = num0(anticipoAmount)
      const antPct = num0(anticipoPct)
      if (antAmt > 0) {
        const desc = `Anticipo${antPct > 0 ? ` (${antPct}%)` : ""}`
        if (!existingAnticipoEst) {
          const { error: antErr } = await supabase.from("obra_estimaciones").insert({
            obra_id: obraId,
            number: 0,
            description: desc,
            amount: antAmt,
            status: "pending",
            is_anticipo: true,
            created_by: userId,
          })
          if (antErr) throw new Error("No se pudo crear el anticipo como estimación.")
        } else if (existingAnticipoEst.status !== "completed") {
          // Ya existe pero aún sin factura → actualizar monto/descr. desde el contrato
          await supabase
            .from("obra_estimaciones")
            .update({ description: desc, amount: antAmt, updated_at: new Date().toISOString() })
            .eq("id", existingAnticipoEst.id)
        }
      }

      onApplied?.()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al aplicar los datos.")
    } finally {
      setSaving(false)
    }
  }

  const confianza = extraction?.confianza ?? null

  // Aviso "sin consenso": las 3 fuentes (dígitos/letras/cálculo) no coincidieron
  const SinConsenso = ({ show }: { show?: boolean }) =>
    show ? (
      <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 mt-1">
        <AlertTriangle className="w-3 h-3" />
        Sin consenso entre dígitos/letras/cálculo — verifica
      </span>
    ) : null

  return (
    <Dialog open={open} onOpenChange={(v) => (saving ? null : onOpenChange(v))}>
      <DialogContent className="max-w-[92vw] xl:max-w-6xl w-full bg-slate-800 border-slate-700 text-slate-100 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-slate-700">
          <DialogTitle className="flex items-center gap-2 text-slate-100">
            <Sparkles className="w-5 h-5 text-[#4da8e8]" />
            Revisar datos extraídos del contrato
          </DialogTitle>
          <p className="text-xs text-slate-500 mt-1">
            Verifica y corrige los datos antes de aplicarlos al Estado de Cuenta.
          </p>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 h-[68vh]">
          {/* ── PDF preview ── */}
          <div className="bg-slate-900 border-r border-slate-700 min-h-[300px] hidden lg:block">
            {previewUrl ? (
              <iframe src={previewUrl} title="Contrato" className="w-full h-full min-h-[300px] border-0" />
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-600">
                <FileText className="w-10 h-10" />
                <p className="text-sm">Cargando contrato…</p>
              </div>
            )}
          </div>

          {/* ── Form ── */}
          <div className="p-6 space-y-4 overflow-y-auto">
            {/* Confidence badge */}
            {confianza !== null && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Confianza de la IA:</span>
                <Badge
                  className={`text-xs border ${
                    confianza >= 0.75
                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                      : confianza >= 0.5
                      ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                      : "bg-red-500/15 text-red-400 border-red-500/30"
                  }`}
                >
                  {Math.round(confianza * 100)}%
                </Badge>
                {confianza < 0.75 && (
                  <span className="text-xs text-amber-400">Revisa con cuidado.</span>
                )}
              </div>
            )}

            {/* Comparación con datos capturados previamente */}
            {financialComparison && (
              <div className={`rounded-lg border p-3 space-y-2 ${
                financialComparison.allCongruent
                  ? "border-emerald-500/30 bg-emerald-500/10"
                  : "border-amber-500/40 bg-amber-500/10"
              }`}>
                <div className="flex items-start gap-2">
                  {financialComparison.allCongruent
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    : <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />}
                  <div className="text-xs">
                    <p className={`font-semibold ${financialComparison.allCongruent ? "text-emerald-300" : "text-amber-300"}`}>
                      {financialComparison.allCongruent
                        ? "Los datos capturados coinciden con el contrato"
                        : "Se detectaron diferencias entre lo capturado y el contrato"}
                    </p>
                    <p className={financialComparison.allCongruent ? "text-emerald-400/80" : "text-amber-400/80"}>
                      Comparación de los datos financieros registrados a mano contra los que la IA detectó.
                    </p>
                  </div>
                </div>
                <div className="rounded-md border border-slate-700 overflow-hidden">
                  <div className="grid grid-cols-[1.4fr_1fr_1fr_auto] gap-0 text-[11px]">
                    <div className="bg-slate-700/50 px-2 py-1 font-semibold text-slate-300">Concepto</div>
                    <div className="bg-slate-700/50 px-2 py-1 font-semibold text-slate-300 text-right">Capturado</div>
                    <div className="bg-slate-700/50 px-2 py-1 font-semibold text-slate-300 text-right">Detectado</div>
                    <div className="bg-slate-700/50 px-2 py-1 font-semibold text-slate-300 text-center">✓</div>
                    {financialComparison.rows.map((r) => (
                      <div key={r.label} className="contents">
                        <div className="px-2 py-1 text-slate-300 border-t border-slate-700/60">{r.label}</div>
                        <div className="px-2 py-1 text-slate-200 text-right border-t border-slate-700/60">{fmtVal(r.captured, r.kind)}</div>
                        <div className="px-2 py-1 text-slate-200 text-right border-t border-slate-700/60">{fmtVal(r.detected, r.kind)}</div>
                        <div className="px-2 py-1 text-center border-t border-slate-700/60">
                          {r.congruent
                            ? <span className="text-emerald-400 font-bold">✓</span>
                            : <span className="text-amber-400 font-bold">≠</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Datos de la obra (solo se aplican a los campos vacíos) */}
            <div className="rounded-lg border border-slate-700 bg-slate-700/20 p-3 space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Datos de la obra</p>
              {([
                { key: "cliente" as const, label: "Cliente", existing: existingObra?.client_name, type: "text" },
                { key: "nombre" as const, label: "Nombre / objeto", existing: existingObra?.name, type: "text" },
                { key: "ubicacion" as const, label: "Ubicación", existing: existingObra?.location_text, type: "text" },
                { key: "folio" as const, label: "Folio del contrato", existing: existingObra?.code, type: "text" },
                { key: "fecha_inicio" as const, label: "Fecha de inicio", existing: existingObra?.start_date_planned, type: "date" },
                { key: "fecha_termino" as const, label: "Fecha de término", existing: existingObra?.end_date_planned, type: "date" },
              ]).map((fld) => {
                const alreadySet = !isEmpty(fld.existing)
                return (
                  <div key={fld.key} className="flex flex-col gap-1">
                    <label className="text-[11px] text-slate-500">{fld.label}</label>
                    {alreadySet ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-300 truncate">{fld.existing}</span>
                        <Badge className="text-[10px] border bg-slate-600/30 text-slate-400 border-slate-600/50 shrink-0">
                          ya capturado
                        </Badge>
                      </div>
                    ) : (
                      <Input
                        type={fld.type}
                        value={form[fld.key]}
                        onChange={(e) => setForm((f) => ({ ...f, [fld.key]: e.target.value }))}
                        placeholder={fld.type === "date" ? "" : "—"}
                        className="bg-slate-700/60 border-slate-600 text-slate-100 placeholder:text-slate-500 focus:border-[#0174bd] h-8 text-sm"
                      />
                    )}
                  </div>
                )
              })}
              <p className="text-[11px] text-slate-600">Los campos ya capturados no se modifican; solo se llenan los vacíos.</p>
            </div>

            {/* Monto total */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-400">Monto total del contrato *</label>
              <Input
                value={form.monto_total}
                onChange={(e) => setForm((f) => {
                  const total = e.target.value
                  return {
                    ...f,
                    monto_total: total,
                    anticipo_amount: calcMonto(f.anticipo_pct, total) ?? f.anticipo_amount,
                    saldo_amount: calcMonto(f.saldo_pct, total) ?? f.saldo_amount,
                    garantia_amount: calcMonto(f.garantia_pct, total) ?? f.garantia_amount,
                  }
                })}
                placeholder="0.00"
                className="bg-slate-700/60 border-slate-600 text-slate-100 placeholder:text-slate-500 focus:border-[#0174bd]"
              />
              <p className="text-[11px] text-slate-500">Base sin IVA. Alimenta la Cotización. Los montos se consolidan por votación (dígitos/letras/cálculo) y quedan editables.</p>
              <SinConsenso show={extraction?.monto_total_source === "sin_consenso"} />
            </div>

            {/* Anticipo */}
            <div className="rounded-lg border border-slate-700 bg-slate-700/20 p-3 space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Anticipo</p>
              <SinConsenso show={extraction?.anticipo?.monto_source === "sin_consenso"} />
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] text-slate-500">Porcentaje %</label>
                  <Input
                    value={form.anticipo_pct}
                    onChange={(e) => setForm((f) => {
                      const pct = e.target.value
                      return { ...f, anticipo_pct: pct, anticipo_amount: calcMonto(pct, f.monto_total) ?? f.anticipo_amount }
                    })}
                    placeholder="30"
                    className="bg-slate-700/60 border-slate-600 text-slate-100 focus:border-[#0174bd]"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] text-slate-500">Monto</label>
                  <Input
                    value={form.anticipo_amount}
                    onChange={(e) => setForm((f) => ({ ...f, anticipo_amount: e.target.value }))}
                    placeholder="0.00"
                    className="bg-slate-700/60 border-slate-600 text-slate-100 focus:border-[#0174bd]"
                  />
                </div>
              </div>
            </div>

            {/* Saldo */}
            <div className="rounded-lg border border-slate-700 bg-slate-700/20 p-3 space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Saldo restante</p>
              <SinConsenso show={extraction?.saldo?.monto_source === "sin_consenso"} />
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] text-slate-500">Porcentaje %</label>
                  <Input
                    value={form.saldo_pct}
                    onChange={(e) => setForm((f) => {
                      const pct = e.target.value
                      return { ...f, saldo_pct: pct, saldo_amount: calcMonto(pct, f.monto_total) ?? f.saldo_amount }
                    })}
                    placeholder="70"
                    className="bg-slate-700/60 border-slate-600 text-slate-100 focus:border-[#0174bd]"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] text-slate-500">Monto</label>
                  <Input
                    value={form.saldo_amount}
                    onChange={(e) => setForm((f) => ({ ...f, saldo_amount: e.target.value }))}
                    placeholder="0.00"
                    className="bg-slate-700/60 border-slate-600 text-slate-100 focus:border-[#0174bd]"
                  />
                </div>
              </div>
              <p className="text-[11px] text-slate-600">Se guarda como referencia (aún sin uso en cálculos).</p>
            </div>

            {/* Garantía */}
            <div className="rounded-lg border border-slate-700 bg-slate-700/20 p-3 space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Fondo de Garantía</p>
              <SinConsenso show={extraction?.garantia?.monto_source === "sin_consenso"} />
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] text-slate-500">Porcentaje %</label>
                  <Input
                    value={form.garantia_pct}
                    onChange={(e) => setForm((f) => {
                      const pct = e.target.value
                      return { ...f, garantia_pct: pct, garantia_amount: calcMonto(pct, f.monto_total) ?? f.garantia_amount }
                    })}
                    placeholder="5"
                    className="bg-slate-700/60 border-slate-600 text-slate-100 focus:border-[#0174bd]"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] text-slate-500">Monto</label>
                  <Input
                    value={form.garantia_amount}
                    onChange={(e) => setForm((f) => ({ ...f, garantia_amount: e.target.value }))}
                    placeholder="0.00"
                    className="bg-slate-700/60 border-slate-600 text-slate-100 focus:border-[#0174bd]"
                  />
                </div>
              </div>
            </div>

            {/* Conflict banner */}
            {hasCotizacionConflict && existingCotizacion && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-300 space-y-0.5">
                    <p className="font-semibold">Ya existe una cotización registrada</p>
                    <p className="text-amber-400/90">
                      Actual: {fmtCurrency(existingCotizacion.amount, currency)} · Contrato:{" "}
                      {fmtCurrency(montoTotalNum ?? 0, currency)}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCotizacionChoice("replace")}
                    className={`flex-1 rounded-md border py-1.5 text-xs font-medium transition-all cursor-pointer ${
                      cotizacionChoice === "replace"
                        ? "bg-[#0174bd]/20 border-[#0174bd]/50 text-[#4da8e8]"
                        : "bg-slate-700/40 border-slate-600 text-slate-400 hover:bg-slate-700"
                    }`}
                  >
                    Reemplazar con el contrato
                  </button>
                  <button
                    type="button"
                    onClick={() => setCotizacionChoice("keep")}
                    className={`flex-1 rounded-md border py-1.5 text-xs font-medium transition-all cursor-pointer ${
                      cotizacionChoice === "keep"
                        ? "bg-slate-500/20 border-slate-400/50 text-slate-200"
                        : "bg-slate-700/40 border-slate-600 text-slate-400 hover:bg-slate-700"
                    }`}
                  >
                    Conservar la actual
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-slate-700 bg-slate-800">
          <p className="text-[11px] text-slate-500">
            Al aplicar: datos de la obra (vacíos), Cotización, Anticipo y Fondo de Garantía.
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="cursor-pointer bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleApply}
              disabled={saving || loadingExisting}
              className="cursor-pointer bg-[#0174bd] hover:bg-[#0163a3] text-white"
            >
              {saving ? (
                <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Aplicando…</>
              ) : (
                <><CheckCircle2 className="w-4 h-4 mr-1.5" />Aplicar a Estado de Cuenta</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
