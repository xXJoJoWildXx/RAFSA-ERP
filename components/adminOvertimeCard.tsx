"use client"

/**
 * Captura de horas extra del personal exento de asistencia (Administración).
 *
 * Este personal no pasa por la toma de asistencia de obra: cobra su sueldo real
 * completo todas las semanas. Lo único variable son las horas extra, y aquí es
 * donde se capturan (una sola fila por empleado y por semana, tabla
 * public.admin_overtime). La conciliación de nómina lee esa tabla y suma
 * horas × costo por hora al sueldo real.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { listRecentPeriods } from "@/lib/payroll/weeks"
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Clock,
  Loader2,
  Save,
} from "lucide-react"

/* eslint-disable @typescript-eslint/no-explicit-any */

type Row = {
  id: string
  full_name: string
  payroll_code: string | null
  real_salary: number
  overtime_hour_cost: number
  role_name: string
  hours: string // texto, para poder dejar el campo vacío mientras se escribe
  savedHours: number
}

const money = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 })

export function AdminOvertimeCard({
  weekStart,
  weekLabel,
  variant = "card",
}: {
  /** Semana a capturar. Sólo en variant="card"; en "panel" la elige el propio panel. */
  weekStart?: string
  weekLabel?: string
  /** "card" = tarjeta plegable dentro de otra pantalla. "panel" = pestaña propia. */
  variant?: "card" | "panel"
}) {
  const esPanel = variant === "panel"
  const periods = useMemo(() => listRecentPeriods(8), [])
  const [panelWeek, setPanelWeek] = useState(periods[0]?.weekStart ?? "")

  const semana = esPanel ? panelWeek : (weekStart ?? "")
  const etiquetaSemana = esPanel
    ? periods.find((p) => p.weekStart === panelWeek)?.label
    : weekLabel

  // En su propia pestaña siempre está abierto; como tarjeta arranca plegado.
  const [open, setOpen] = useState(esPanel)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [rows, setRows] = useState<Row[]>([])

  const load = useCallback(async () => {
    if (!semana) return
    setLoading(true)
    setError(null)
    setSavedAt(null)
    try {
      // Empleados activos con algún rol exento de asistencia
      const { data: asign, error: asignErr } = await supabase
        .from("employee_roles")
        .select(
          "employee_id, employee_roles_catalog!inner(name, attendance_exempt), employees!inner(id, full_name, payroll_code, status, real_salary, overtime_hour_cost)",
        )
        .eq("employee_roles_catalog.attendance_exempt", true)
        .eq("employees.status", "active")
      if (asignErr) throw asignErr

      const porEmpleado = new Map<string, Row>()
      for (const r of (asign || []) as any[]) {
        const e = r.employees
        if (!e || porEmpleado.has(e.id)) continue
        porEmpleado.set(e.id, {
          id: e.id,
          full_name: e.full_name ?? "(sin nombre)",
          payroll_code: e.payroll_code ?? null,
          real_salary: Number(e.real_salary) || 0,
          overtime_hour_cost: Number(e.overtime_hour_cost) || 0,
          role_name: r.employee_roles_catalog?.name ?? "Administración",
          hours: "",
          savedHours: 0,
        })
      }

      // Horas ya capturadas para esta semana
      const { data: ot, error: otErr } = await supabase
        .from("admin_overtime")
        .select("employee_id, hours")
        .eq("week_start", semana)
      if (otErr) throw otErr

      for (const r of (ot || []) as any[]) {
        const row = porEmpleado.get(r.employee_id)
        if (!row) continue
        const h = Number(r.hours) || 0
        row.savedHours = h
        row.hours = h ? String(h) : ""
      }

      setRows(
        Array.from(porEmpleado.values()).sort((a, b) =>
          a.full_name.localeCompare(b.full_name, "es"),
        ),
      )
    } catch (e: any) {
      console.error("[adminOvertime] load:", e)
      setError(e?.message || "No se pudieron cargar las horas extra.")
    } finally {
      setLoading(false)
    }
  }, [semana])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  const dirty = rows.some((r) => (Number(r.hours) || 0) !== r.savedHours)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const cambiadas = rows.filter((r) => (Number(r.hours) || 0) !== r.savedHours)
      if (cambiadas.length) {
        const payload = cambiadas.map((r) => ({
          employee_id: r.id,
          week_start: semana,
          hours: Number(r.hours) || 0,
          updated_at: new Date().toISOString(),
        }))
        const { error: upErr } = await supabase
          .from("admin_overtime")
          .upsert(payload, { onConflict: "employee_id,week_start" })
        if (upErr) throw upErr
        setRows((prev) =>
          prev.map((r) => ({ ...r, savedHours: Number(r.hours) || 0 })),
        )
      }
      setSavedAt(Date.now())
    } catch (e: any) {
      console.error("[adminOvertime] save:", e)
      setError(e?.message || "No se pudieron guardar las horas extra.")
    } finally {
      setSaving(false)
    }
  }

  const totalHoras = rows.reduce((s, r) => s + (Number(r.hours) || 0), 0)
  const totalImporte = rows.reduce(
    (s, r) => s + (Number(r.hours) || 0) * r.overtime_hour_cost,
    0,
  )

  const titulo = (
    <div className="flex items-center gap-3 text-left">
      <div className="p-2 rounded-lg bg-[#0174bd]/15">
        <Clock className="w-4 h-4 text-[#4da8e8]" />
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-100">Horas extra de Administración</p>
        <p className="text-xs text-slate-400 mt-0.5">
          Personal sin toma de asistencia
          {!esPanel && etiquetaSemana ? ` · ${etiquetaSemana}` : ""}
        </p>
      </div>
    </div>
  )

  return (
    <div className="rounded-2xl border border-slate-700/60 bg-slate-800 overflow-hidden">
      {esPanel ? (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 px-5 py-4">
          {titulo}
          <div className="flex flex-col gap-1.5 sm:items-end">
            <label className="text-xs font-medium text-slate-400">Semana (Jue – Mié)</label>
            <Select value={panelWeek} onValueChange={setPanelWeek}>
              <SelectTrigger className="w-full sm:w-72 cursor-pointer bg-slate-900 border-slate-700 text-slate-200 focus:border-[#0174bd]/60">
                <SelectValue placeholder="Selecciona la semana" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                {periods.map((p) => (
                  <SelectItem
                    key={p.weekStart}
                    value={p.weekStart}
                    className="focus:bg-slate-700 focus:text-slate-100"
                  >
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-3 px-5 py-4 cursor-pointer hover:bg-slate-700/30 transition-colors"
        >
          {titulo}
          <div className="flex items-center gap-3">
            {open && rows.length > 0 && (
              <span className="hidden sm:inline text-xs text-slate-400">
                {totalHoras} h · {money(totalImporte)}
              </span>
            )}
            <ChevronDown
              className={`w-4 h-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </div>
        </button>
      )}

      {open && (
        <div className="border-t border-slate-700/60 p-5 pt-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              Cargando personal...
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-slate-400">
              No hay empleados activos con un rol exento de asistencia.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto -mx-1 px-1">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-700/60">
                      <th className="py-2 pr-3 font-medium">Empleado</th>
                      <th className="py-2 px-3 font-medium">Código</th>
                      <th className="py-2 px-3 font-medium text-right">Sueldo real</th>
                      <th className="py-2 px-3 font-medium text-right">Costo / hora</th>
                      <th className="py-2 px-3 font-medium text-right w-28">Horas extra</th>
                      <th className="py-2 pl-3 font-medium text-right">Total semana</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const h = Number(r.hours) || 0
                      const total = r.real_salary + h * r.overtime_hour_cost
                      return (
                        <tr key={r.id} className="border-b border-slate-700/40 last:border-0">
                          <td className="py-2.5 pr-3">
                            <span className="text-slate-200">{r.full_name}</span>
                            <span className="block text-xs text-slate-500">{r.role_name}</span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-xs text-slate-400">
                            {r.payroll_code || "—"}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-300">
                            {money(r.real_salary)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-400">
                            {r.overtime_hour_cost ? money(r.overtime_hour_cost) : "—"}
                          </td>
                          <td className="py-2.5 px-3">
                            <Input
                              type="number"
                              min="0"
                              step="0.5"
                              inputMode="decimal"
                              value={r.hours}
                              placeholder="0"
                              onChange={(e) => {
                                const v = e.target.value
                                setRows((prev) =>
                                  prev.map((x) => (x.id === r.id ? { ...x, hours: v } : x)),
                                )
                              }}
                              className="h-9 text-right bg-slate-900 border-slate-700 text-slate-200 placeholder:text-slate-600 focus:border-[#0174bd]/60"
                            />
                          </td>
                          <td className="py-2.5 pl-3 text-right font-semibold text-slate-100">
                            {money(total)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {error && (
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2.5 text-sm text-red-300">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  {esPanel && (
                    <p className="text-sm text-slate-300">
                      <span className="font-semibold text-slate-100">{totalHoras} h</span>
                      {" · "}
                      <span className="font-semibold text-slate-100">{money(totalImporte)}</span>
                      <span className="text-slate-500"> en horas extra esta semana</span>
                    </p>
                  )}
                  <p className="text-xs text-slate-500">
                    Se guardan por semana. La conciliación suma estas horas al sueldo real.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {savedAt && !dirty && (
                    <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                      <Check className="w-3.5 h-3.5" />
                      Guardado
                    </span>
                  )}
                  <Button
                    onClick={handleSave}
                    disabled={!dirty || saving}
                    className="cursor-pointer bg-[#0174bd] hover:bg-[#0174bd]/90 text-white font-semibold disabled:opacity-40"
                  >
                    {saving ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Guardando...</>
                    ) : (
                      <><Save className="w-4 h-4 mr-2" />Guardar horas</>
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
