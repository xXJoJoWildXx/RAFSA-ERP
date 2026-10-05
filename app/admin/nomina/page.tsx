"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AdminLayout } from "@/components/admin-layout"
import { RoleGuard } from "@/lib/role-guard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Wallet,
  Upload,
  Loader2,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Banknote,
  Building2,
  Save,
  FileDown,
  UserPlus,
  Search,
  History,
  Trash2,
  BadgeCheck,
  Download,
  ClipboardCheck,
} from "lucide-react"
import { supabase } from "@/lib/supabaseClient"
import { listRecentPeriods, fmtDateDisplay } from "@/lib/payroll/weeks"
import { generatePayrollReportPdf } from "@/lib/payroll/report"
import { AdminAttendance } from "@/components/adminAttendance"
import type { ReconLine, ReconResult } from "@/lib/payroll/types"

function fmtCurrency(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—"
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 })
}

const STATUS_META: Record<ReconLine["match_status"], { label: string; cls: string }> = {
  matched: { label: "Conciliado", cls: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25" },
  sin_asistencia: { label: "Sin asistencia", cls: "bg-amber-500/15 text-amber-300 border border-amber-500/25" },
  unmatched: { label: "Sin empatar", cls: "bg-red-500/15 text-red-400 border border-red-500/25" },
  sin_fiscal: { label: "Sin fiscal", cls: "bg-sky-500/15 text-sky-300 border border-sky-500/25" },
}

type RunRow = {
  id: string
  week_start: string
  week_end: string
  period_label: string | null
  total_real: number
  total_fiscal: number
  total_efectivo: number
  employee_count: number
  status: string
  source_file_name: string | null
  created_at: string
}

type EmpHit = { id: string; full_name: string; payroll_code: string | null }

export default function NominaPage() {
  const periods = useMemo(() => listRecentPeriods(8), [])
  const [tab, setTab] = useState<"dispersion" | "asistencia">("dispersion")
  const [week, setWeek] = useState(periods[0]?.weekStart ?? "")
  const [file, setFile] = useState<File | null>(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ReconResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)

  const [history, setHistory] = useState<RunRow[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Asignación de código
  const [assignLine, setAssignLine] = useState<ReconLine | null>(null)
  const [assignQuery, setAssignQuery] = useState("")
  const [assignHits, setAssignHits] = useState<EmpHit[]>([])
  const [assignBusy, setAssignBusy] = useState(false)

  const selectedPeriod = periods.find((p) => p.weekStart === week)

  async function refreshHistory() {
    setLoadingHistory(true)
    try {
      const res = await fetch("/api/payroll")
      const json = await res.json()
      if (res.ok) setHistory(json.runs ?? [])
    } catch {
      /* noop */
    } finally {
      setLoadingHistory(false)
    }
  }

  useEffect(() => {
    refreshHistory()
  }, [])

  async function runReconcile(opts: { file?: File; reusePath?: string }) {
    if (!selectedPeriod) return
    setProcessing(true)
    setError(null)
    try {
      const fd = new FormData()
      if (opts.file) fd.append("file", opts.file)
      if (opts.reusePath) fd.append("source_object_path", opts.reusePath)
      fd.append("week_start", selectedPeriod.weekStart)
      fd.append("week_end", selectedPeriod.weekEnd)
      const res = await fetch("/api/payroll/reconcile", { method: "POST", body: fd })
      const json = await res.json()
      if (!res.ok) {
        setError(json?.error || "No se pudo procesar el archivo.")
        return
      }
      setResult(json as ReconResult)
      setSavedId(null)
    } catch {
      setError("Error de red al procesar el archivo.")
    } finally {
      setProcessing(false)
    }
  }

  async function handleProcess() {
    if (!file || processing) return
    setResult(null)
    await runReconcile({ file })
  }

  async function handleSave() {
    if (!result || saving) return
    setSaving(true)
    try {
      const { data: auth } = await supabase.auth.getUser()
      const res = await fetch("/api/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...result, created_by: auth?.user?.id ?? null }),
      })
      const json = await res.json()
      if (!res.ok) {
        alert(json?.error || "No se pudo guardar la corrida.")
        return
      }
      setSavedId(json.id)
      await refreshHistory()
    } catch {
      alert("Error de red al guardar.")
    } finally {
      setSaving(false)
    }
  }

  // ── Asignación de código ──
  async function openAssign(line: ReconLine) {
    setAssignLine(line)
    setAssignQuery("")
    setAssignHits([])
  }

  async function searchEmployees(q: string) {
    setAssignQuery(q)
    if (q.trim().length < 2) {
      setAssignHits([])
      return
    }
    const { data } = await supabase
      .from("employees")
      .select("id, full_name, payroll_code")
      .ilike("full_name", `%${q.trim()}%`)
      .order("full_name")
      .limit(20)
    setAssignHits((data as EmpHit[]) ?? [])
  }

  async function assignCodeTo(emp: EmpHit) {
    if (!assignLine?.codigo) return
    setAssignBusy(true)
    try {
      const { error: upErr } = await supabase
        .from("employees")
        .update({ payroll_code: assignLine.codigo })
        .eq("id", emp.id)
      if (upErr) {
        alert(
          upErr.message.includes("duplicate") || upErr.message.includes("unique")
            ? `El código ${assignLine.codigo} ya está asignado a otro empleado.`
            : "No se pudo asignar el código.",
        )
        return
      }
      setAssignLine(null)
      // Re-conciliar reutilizando el archivo ya subido
      if (result?.source_object_path) await runReconcile({ reusePath: result.source_object_path })
    } finally {
      setAssignBusy(false)
    }
  }

  async function markPaid(runId: string) {
    if (!confirm("¿Marcar esta corrida como pagada?")) return
    const res = await fetch(`/api/payroll/${runId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "paid" }),
    })
    if (res.ok) await refreshHistory()
  }

  async function deleteRun(runId: string) {
    if (!confirm("¿Eliminar esta corrida guardada? No afecta las nóminas ni los empleados.")) return
    const res = await fetch(`/api/payroll/${runId}`, { method: "DELETE" })
    if (res.ok) await refreshHistory()
  }

  async function downloadRunReport(runId: string) {
    const res = await fetch(`/api/payroll/${runId}`)
    const json = await res.json()
    if (!res.ok) {
      alert(json?.error || "No se pudo abrir la corrida.")
      return
    }
    const run = json.run
    const lines = (json.lines ?? []).map((l: any): ReconLine => ({
      codigo: l.payroll_code,
      employee_id: l.employee_id,
      employee_name_raw: l.employee_name_raw,
      employee_name_erp: null,
      departamento_raw: l.departamento_raw,
      obra_names_erp: typeof l.note === "string" && l.note.startsWith("obras:")
        ? l.note.slice(6).split(" | ").filter(Boolean)
        : [],
      real_total: Number(l.real_total) || 0,
      fiscal_neto: Number(l.fiscal_neto) || 0,
      efectivo: Number(l.efectivo) || 0,
      bank_name: l.bank_name,
      account_number: l.account_number,
      interbank_clabe: l.interbank_clabe,
      match_status: l.match_status,
      flags: [],
    }))
    const asResult: ReconResult = {
      week_start: run.week_start,
      week_end: run.week_end,
      period_label: run.period_label,
      doc_period_start: null,
      doc_period_end: null,
      source_object_path: run.source_object_path,
      source_file_name: run.source_file_name,
      fiscal_total_neto: Number(run.fiscal_total_neto) || 0,
      parsed_sum_neto: Number(run.total_fiscal) || 0,
      totals: {
        real: Number(run.total_real) || 0,
        fiscal: Number(run.total_fiscal) || 0,
        efectivo: Number(run.total_efectivo) || 0,
      },
      counts: { total: lines.length, matched: 0, unmatched: 0, sin_nomina: 0, sin_fiscal: 0 },
      lines,
    }
    generatePayrollReportPdf(asResult)
  }

  const groups = useMemo(() => {
    if (!result) return []
    const map = new Map<string, ReconLine[]>()
    for (const l of result.lines) {
      const key = l.obra_names_erp[0] || l.departamento_raw || "Sin clasificar"
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(l)
    }
    return Array.from(map.entries())
  }, [result])

  const cuadre =
    result?.fiscal_total_neto != null
      ? Math.abs(result.fiscal_total_neto - result.parsed_sum_neto) < 0.01
      : null

  const inputCls =
    "bg-slate-900 border-slate-700 text-slate-200 placeholder:text-slate-600 focus:border-[#0174bd]/60"

  return (
    <RoleGuard allowed={["admin"]}>
      <AdminLayout>
        <div className="space-y-6">
          {/* Header */}
          <div
            className="rounded-2xl border border-slate-700/60 p-6"
            style={{
              background: "linear-gradient(135deg, #1e293b 0%, #0f1e2e 50%, #162438 100%)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 20px rgba(0,0,0,0.3)",
            }}
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-[#0174bd]/15">
                <Wallet className="w-6 h-6 text-[#4da8e8]" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-100">Nómina</h1>
                <p className="text-slate-400 text-sm mt-0.5">
                  {tab === "dispersion"
                    ? "Concilia la nómina fiscal contra el sueldo real de la semana y obtén cuánto va en efectivo."
                    : "Toma la asistencia de cualquier trabajador de cualquier obra."}
                </p>
              </div>
            </div>
          </div>

          {/* Pestañas */}
          <div className="relative inline-grid grid-cols-2 p-1 rounded-xl bg-slate-800 border border-slate-700/60">
            {/* Rectángulo azul deslizante */}
            <span
              className="absolute top-1 bottom-1 left-1 rounded-lg bg-[#0174bd] shadow-[0_2px_8px_rgba(1,116,189,0.4)] transition-transform duration-300 ease-out"
              style={{
                width: "calc(50% - 4px)",
                transform: tab === "asistencia" ? "translateX(100%)" : "translateX(0)",
              }}
            />
            <TabBtn active={tab === "dispersion"} onClick={() => setTab("dispersion")} icon={<FileSpreadsheet className="w-4 h-4" />}>
              Dispersión
            </TabBtn>
            <TabBtn active={tab === "asistencia"} onClick={() => setTab("asistencia")} icon={<ClipboardCheck className="w-4 h-4" />}>
              Tomar asistencia
            </TabBtn>
          </div>

          {/* Se mantiene montado (solo oculto) para no perder lo capturado al cambiar de pestaña */}
          <div className={tab === "asistencia" ? "" : "hidden"}>
            <AdminAttendance />
          </div>

          {tab === "dispersion" && (
          <>

          {/* Controles */}
          <div className="rounded-2xl border border-slate-700/60 bg-slate-800 p-5">
            <div className="flex flex-col lg:flex-row lg:items-end gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-400">Semana (Jue – Mié)</label>
                <Select value={week} onValueChange={setWeek}>
                  <SelectTrigger className={`w-full lg:w-72 cursor-pointer ${inputCls}`}>
                    <SelectValue placeholder="Selecciona la semana" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                    {periods.map((p) => (
                      <SelectItem key={p.weekStart} value={p.weekStart} className="focus:bg-slate-700 focus:text-slate-100">
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-400">Documento de nómina (.xlsx)</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null
                    e.target.value = ""
                    if (f) setFile(f)
                  }}
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="justify-start cursor-pointer border-slate-300 text-slate-900 hover:bg-slate-100 lg:w-72"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {file ? file.name : "Elegir archivo CONTPAQi"}
                </Button>
              </div>

              <Button
                onClick={handleProcess}
                disabled={!file || !selectedPeriod || processing}
                className="cursor-pointer bg-[#0174bd] hover:bg-[#0174bd]/90 text-white font-semibold disabled:opacity-40"
              >
                {processing ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Procesando...</>
                ) : (
                  <><FileSpreadsheet className="w-4 h-4 mr-2" />Procesar y conciliar</>
                )}
              </Button>
            </div>

            {error && (
              <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2.5 text-sm text-red-300">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}
          </div>

          {/* Resultado */}
          {result && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <SummaryCard label="Sueldo real (semana)" value={fmtCurrency(result.totals.real)} tone="slate" />
                <SummaryCard label="Depósito fiscal (NETO)" value={fmtCurrency(result.totals.fiscal)} tone="sky" />
                <SummaryCard label="A pagar en efectivo" value={fmtCurrency(result.totals.efectivo)} tone="emerald" />
                <SummaryCard label="Empleados en documento" value={String(result.counts.total - result.counts.sin_fiscal)} tone="blue" />
              </div>

              <div className="flex flex-wrap items-center gap-3 text-sm">
                {cuadre === true && (
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    Cuadra con el documento: {fmtCurrency(result.fiscal_total_neto)}
                  </span>
                )}
                {cuadre === false && (
                  <span className="flex items-center gap-1.5 text-amber-300">
                    <AlertTriangle className="w-4 h-4" />
                    Diferencia vs Total Gral. ({fmtCurrency(result.fiscal_total_neto)} vs {fmtCurrency(result.parsed_sum_neto)})
                  </span>
                )}
                {result.counts.unmatched > 0 && (
                  <Badge className={STATUS_META.unmatched.cls}>{result.counts.unmatched} sin empatar</Badge>
                )}
                {result.counts.sin_asistencia > 0 && (
                  <Badge className={STATUS_META.sin_asistencia.cls}>{result.counts.sin_asistencia} sin asistencia registrada</Badge>
                )}
                {result.counts.sin_fiscal > 0 && (
                  <Badge className={STATUS_META.sin_fiscal.cls}>{result.counts.sin_fiscal} con nómina pero sin fiscal</Badge>
                )}

                <div className="ml-auto flex items-center gap-2">
                  <Button
                    onClick={handleSave}
                    disabled={saving || !!savedId}
                    className="cursor-pointer bg-[#0174bd] hover:bg-[#0174bd]/90 text-white font-semibold disabled:opacity-40 h-9"
                  >
                    {saving ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Guardando...</>
                    ) : savedId ? (
                      <><CheckCircle2 className="w-4 h-4 mr-2" />Guardada</>
                    ) : (
                      <><Save className="w-4 h-4 mr-2" />Guardar corrida</>
                    )}
                  </Button>
                  <Button
                    onClick={() => generatePayrollReportPdf(result)}
                    variant="outline"
                    className="cursor-pointer border-slate-300 text-slate-900 hover:bg-slate-100 h-9"
                  >
                    <FileDown className="w-4 h-4 mr-2" />Descargar reporte
                  </Button>
                </div>
              </div>

              {/* Tabla por obra */}
              <div className="space-y-5">
                {groups.map(([groupName, rows]) => {
                  const gReal = rows.reduce((s, r) => s + (r.real_total ?? 0), 0)
                  const gFiscal = rows.reduce((s, r) => s + (r.fiscal_neto ?? 0), 0)
                  const gEfectivo = rows.filter((r) => r.real_total != null).reduce((s, r) => s + (r.efectivo ?? 0), 0)
                  return (
                    <div key={groupName} className="rounded-2xl border border-slate-700/60 bg-slate-800 overflow-hidden">
                      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700/60 bg-slate-900/40">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-[#4da8e8]" />
                          <span className="font-semibold text-slate-100">{groupName}</span>
                          <span className="text-xs text-slate-500">({rows.length})</span>
                        </div>
                        <div className="hidden sm:flex items-center gap-4 text-xs">
                          <span className="text-slate-400">Real: <b className="text-slate-200">{fmtCurrency(gReal)}</b></span>
                          <span className="text-sky-300">Depósito: <b>{fmtCurrency(gFiscal)}</b></span>
                          <span className="text-emerald-400">Efectivo: <b>{fmtCurrency(gEfectivo)}</b></span>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="border-slate-700 hover:bg-transparent">
                              <TableHead className="text-slate-400 text-xs">Código</TableHead>
                              <TableHead className="text-slate-400 text-xs">Empleado</TableHead>
                              <TableHead className="text-slate-400 text-xs">Depto (reporte)</TableHead>
                              <TableHead className="text-slate-400 text-xs text-right">Sueldo real</TableHead>
                              <TableHead className="text-slate-400 text-xs text-right">Depósito (fiscal)</TableHead>
                              <TableHead className="text-slate-400 text-xs text-right">Efectivo</TableHead>
                              <TableHead className="text-slate-400 text-xs">Cuenta</TableHead>
                              <TableHead className="text-slate-400 text-xs">Estado</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {rows.map((r, i) => (
                              <TableRow key={`${r.employee_id ?? r.codigo ?? i}`} className="border-slate-700/50 hover:bg-slate-700/20">
                                <TableCell className="text-slate-400 text-sm font-mono">{r.codigo || "—"}</TableCell>
                                <TableCell className="text-slate-200 text-sm">
                                  {r.employee_name_erp || r.employee_name_raw || "—"}
                                  {r.employee_name_raw && r.employee_name_erp && r.employee_name_raw !== r.employee_name_erp && (
                                    <span className="block text-[11px] text-slate-500">doc: {r.employee_name_raw}</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-slate-400 text-xs">{r.departamento_raw || "—"}</TableCell>
                                <TableCell className="text-right text-sm text-slate-200">
                                  {r.real_total != null ? fmtCurrency(r.real_total) : <span className="text-amber-400">pendiente</span>}
                                </TableCell>
                                <TableCell className="text-right text-sm text-sky-300">{fmtCurrency(r.fiscal_neto)}</TableCell>
                                <TableCell className="text-right text-sm font-semibold">
                                  {r.real_total != null ? (
                                    <span className={r.efectivo < 0 ? "text-red-400" : "text-emerald-400"}>{fmtCurrency(r.efectivo)}</span>
                                  ) : (
                                    <span className="text-slate-600">—</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-slate-400 text-xs">
                                  {r.account_number || r.interbank_clabe ? (
                                    <span className="flex items-center gap-1">
                                      <Banknote className="w-3 h-3 text-slate-500" />
                                      {r.bank_name ? `${r.bank_name} ` : ""}
                                      {r.account_number || r.interbank_clabe}
                                    </span>
                                  ) : (
                                    <span className="text-slate-600">sin cuenta</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {r.match_status === "unmatched" ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => openAssign(r)}
                                      className="h-7 text-xs cursor-pointer bg-transparent border-red-500/40 text-red-300 hover:bg-red-500/10"
                                    >
                                      <UserPlus className="w-3 h-3 mr-1" />Asignar código
                                    </Button>
                                  ) : (
                                    <Badge className={`${STATUS_META[r.match_status].cls} text-xs`}>
                                      {STATUS_META[r.match_status].label}
                                    </Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* Historial */}
          <div className="rounded-2xl border border-slate-700/60 bg-slate-800 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-700/60 bg-slate-900/40">
              <History className="w-4 h-4 text-[#4da8e8]" />
              <span className="font-semibold text-slate-100">Corridas guardadas</span>
              {loadingHistory && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" />}
            </div>
            {history.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">Aún no hay corridas guardadas.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-700 hover:bg-transparent">
                      <TableHead className="text-slate-400 text-xs">Semana</TableHead>
                      <TableHead className="text-slate-400 text-xs text-right">Real</TableHead>
                      <TableHead className="text-slate-400 text-xs text-right">Depósito</TableHead>
                      <TableHead className="text-slate-400 text-xs text-right">Efectivo</TableHead>
                      <TableHead className="text-slate-400 text-xs text-center">Emp.</TableHead>
                      <TableHead className="text-slate-400 text-xs">Estado</TableHead>
                      <TableHead className="text-slate-400 text-xs text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((r) => (
                      <TableRow key={r.id} className="border-slate-700/50 hover:bg-slate-700/20">
                        <TableCell className="text-slate-200 text-sm">
                          {fmtDateDisplay(r.week_start)} – {fmtDateDisplay(r.week_end)}
                        </TableCell>
                        <TableCell className="text-right text-sm text-slate-300">{fmtCurrency(r.total_real)}</TableCell>
                        <TableCell className="text-right text-sm text-sky-300">{fmtCurrency(r.total_fiscal)}</TableCell>
                        <TableCell className="text-right text-sm text-emerald-400">{fmtCurrency(r.total_efectivo)}</TableCell>
                        <TableCell className="text-center text-sm text-slate-400">{r.employee_count}</TableCell>
                        <TableCell>
                          {r.status === "paid" ? (
                            <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 text-xs">Pagada</Badge>
                          ) : (
                            <Badge className="bg-slate-500/15 text-slate-300 border border-slate-500/25 text-xs">Conciliada</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => downloadRunReport(r.id)}
                              className="h-7 cursor-pointer text-slate-400 hover:text-slate-100" title="Descargar reporte">
                              <Download className="w-4 h-4" />
                            </Button>
                            {r.status !== "paid" && (
                              <Button size="sm" variant="ghost" onClick={() => markPaid(r.id)}
                                className="h-7 cursor-pointer text-slate-400 hover:text-emerald-400" title="Marcar pagada">
                                <BadgeCheck className="w-4 h-4" />
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => deleteRun(r.id)}
                              className="h-7 cursor-pointer text-slate-400 hover:text-red-400" title="Eliminar">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
          </>
          )}
        </div>

        {/* Modal asignar código */}
        <Dialog open={!!assignLine} onOpenChange={(v) => (!v ? setAssignLine(null) : null)}>
          <DialogContent className="max-w-md bg-slate-800 border-slate-700 text-slate-100">
            <DialogHeader>
              <DialogTitle className="text-slate-100">Asignar código {assignLine?.codigo}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-1">
              <p className="text-sm text-slate-400">
                Empleado en el documento: <span className="text-slate-200">{assignLine?.employee_name_raw}</span>.
                Busca al empleado del ERP para guardarle este código.
              </p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                <Input
                  autoFocus
                  value={assignQuery}
                  onChange={(e) => searchEmployees(e.target.value)}
                  placeholder="Nombre del empleado..."
                  className={`pl-10 ${inputCls}`}
                />
              </div>
              <div className="max-h-64 overflow-y-auto space-y-1">
                {assignHits.map((emp) => (
                  <button
                    key={emp.id}
                    disabled={assignBusy}
                    onClick={() => assignCodeTo(emp)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-slate-700/40 hover:bg-slate-700 text-left cursor-pointer transition-colors disabled:opacity-50"
                  >
                    <span className="text-sm text-slate-200">{emp.full_name}</span>
                    {emp.payroll_code ? (
                      <span className="text-[11px] text-amber-400">código actual: {emp.payroll_code}</span>
                    ) : (
                      <span className="text-[11px] text-slate-500">sin código</span>
                    )}
                  </button>
                ))}
                {assignQuery.trim().length >= 2 && assignHits.length === 0 && (
                  <p className="text-xs text-slate-500 px-1 py-2">Sin resultados.</p>
                )}
              </div>
              {assignBusy && (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />Asignando y reconciliando...
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </AdminLayout>
    </RoleGuard>
  )
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: "slate" | "sky" | "emerald" | "blue"
}) {
  const toneCls: Record<string, string> = {
    slate: "text-slate-100",
    sky: "text-sky-300",
    emerald: "text-emerald-400",
    blue: "text-[#4da8e8]",
  }
  return (
    <div className="rounded-2xl border border-slate-700/60 bg-slate-800 p-5">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${toneCls[tone]}`}>{value}</p>
    </div>
  )
}

function TabBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`relative z-10 flex w-full items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors whitespace-nowrap ${
        active ? "text-white" : "text-slate-400 hover:text-slate-200"
      }`}
    >
      {icon}
      {children}
    </button>
  )
}
