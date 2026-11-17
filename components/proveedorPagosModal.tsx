"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle, Banknote, CheckCircle2, Download, Loader2, Paperclip,
  Plus, Trash2, X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { supabase } from "@/lib/supabaseClient"
import { useAuth } from "@/lib/auth-context"
import { can } from "@/lib/permissions"

const BUCKET = "proveedores-docs"

export type FacturaParaPago = {
  id: string
  folio_completo: string
  proveedor: string
  moneda: string
  total: number
  monto_pagado: number
  saldo: number
  estado_pago: "pendiente" | "parcial" | "pagada"
}

type Pago = {
  id: string
  monto: number
  fecha_pago: string
  metodo_pago: string
  referencia: string | null
  cuenta_origen: string | null
  comprobante_object_path: string | null
  comprobante_file_name: string | null
  notas: string | null
  created_at: string
}

const METODOS = [
  ["transferencia", "Transferencia"],
  ["cheque", "Cheque"],
  ["efectivo", "Efectivo"],
  ["tarjeta", "Tarjeta"],
  ["otro", "Otro"],
] as const

const money = (n: number, m = "MXN") =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: m }).format(n ?? 0)

const fechaCorta = (s: string | null) =>
  s ? new Date(`${s.slice(0, 10)}T12:00:00`).toLocaleDateString("es-MX",
      { day: "numeric", month: "short", year: "numeric" }) : "—"

/** Los campos de PostgrestError no son enumerables: console.error(e) imprime {}. */
const detalle = (e: any) =>
  [e?.message, e?.details, e?.hint, e?.code].filter(Boolean).join(" · ") || String(e)

const hoyISO = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

/** Mismo mes natural que hoy: es la regla de cierre que aplica el RLS. */
const esDelMesEnCurso = (iso: string) => {
  const d = new Date(iso)
  const h = new Date()
  return d.getFullYear() === h.getFullYear() && d.getMonth() === h.getMonth()
}

export function ProveedorPagosModal({
  factura,
  open,
  onOpenChange,
  onCambio,
}: {
  factura: FacturaParaPago | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onCambio: () => Promise<void> | void
}) {
  const { user } = useAuth()
  const borraCualquierMes = can(user?.role, "payments.delete.anyMonth")

  const [pagos, setPagos] = useState<Pago[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [borrandoId, setBorrandoId] = useState<string | null>(null)
  const [form, setForm] = useState(false)

  const [monto, setMonto] = useState("")
  const [fechaPago, setFechaPago] = useState(hoyISO())
  const [metodo, setMetodo] = useState<string>("transferencia")
  const [referencia, setReferencia] = useState("")
  const [cuenta, setCuenta] = useState("")
  const [notas, setNotas] = useState("")
  const [comprobante, setComprobante] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const cargar = useCallback(async () => {
    if (!factura) return
    setCargando(true); setError(null)
    const { data, error } = await supabase
      .from("proveedores_facturas_pagos")
      .select("id, monto, fecha_pago, metodo_pago, referencia, cuenta_origen, comprobante_object_path, comprobante_file_name, notas, created_at")
      .eq("factura_id", factura.id)
      .order("fecha_pago", { ascending: false })
    if (error) setError(`No se pudieron cargar los pagos: ${detalle(error)}`)
    setPagos((data as Pago[]) ?? [])
    setCargando(false)
  }, [factura])

  useEffect(() => { if (open) void cargar() }, [open, cargar])

  const limpiarForm = useCallback(() => {
    setMonto(""); setFechaPago(hoyISO()); setMetodo("transferencia")
    setReferencia(""); setCuenta(""); setNotas(""); setComprobante(null)
    if (fileRef.current) fileRef.current.value = ""
    setForm(false)
  }, [])

  // El saldo de la tabla puede venir de hace unos segundos; lo recalculamos
  // de los pagos que tenemos cargados para no proponer de más.
  const saldoVivo = useMemo(() => {
    if (!factura) return 0
    const pagado = pagos.reduce((s, p) => s + Number(p.monto), 0)
    return Math.round((Number(factura.total) - pagado) * 100) / 100
  }, [factura, pagos])

  const abrirForm = useCallback(() => {
    setMonto(saldoVivo > 0 ? saldoVivo.toFixed(2) : "")
    setForm(true)
  }, [saldoVivo])

  const registrar = useCallback(async () => {
    if (!factura) return
    const montoNum = Number(monto)
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      setError("El monto debe ser mayor a cero."); return
    }
    setGuardando(true); setError(null)

    let subido: string | null = null
    try {
      const { data: auth } = await supabase.auth.getUser()

      if (comprobante) {
        const ext = comprobante.name.split(".").pop() ?? "bin"
        subido = `pagos/${factura.id}/${Date.now()}.${ext}`
        const { error: eUp } = await supabase.storage.from(BUCKET)
          .upload(subido, comprobante, {
            contentType: comprobante.type || "application/octet-stream",
            upsert: false,
          })
        if (eUp) throw new Error(`No se pudo subir el comprobante: ${eUp.message}`)
      }

      const { error: eIns } = await supabase.from("proveedores_facturas_pagos").insert({
        factura_id: factura.id,
        monto: montoNum,
        fecha_pago: fechaPago,
        metodo_pago: metodo,
        referencia: referencia.trim() || null,
        cuenta_origen: cuenta.trim() || null,
        notas: notas.trim() || null,
        comprobante_bucket: subido ? BUCKET : null,
        comprobante_object_path: subido,
        comprobante_file_name: comprobante?.name ?? null,
        comprobante_subido_at: subido ? new Date().toISOString() : null,
        created_by: auth?.user?.id ?? null,
      })
      if (eIns) throw new Error(detalle(eIns))

      limpiarForm()
      await cargar()
      await onCambio()
    } catch (e: any) {
      // Si la base rechazó (por ejemplo, el pago excede el saldo) no dejamos
      // el comprobante huérfano en Storage.
      if (subido) await supabase.storage.from(BUCKET).remove([subido]).catch(() => {})
      setError(e?.message ?? String(e))
    } finally {
      setGuardando(false)
    }
  }, [factura, monto, fechaPago, metodo, referencia, cuenta, notas, comprobante,
      limpiarForm, cargar, onCambio])

  const borrar = useCallback(async (p: Pago) => {
    if (!confirm(`¿Eliminar el pago de ${money(p.monto, factura?.moneda)} del ${fechaCorta(p.fecha_pago)}?`)) return
    setBorrandoId(p.id); setError(null)
    const { error } = await supabase.from("proveedores_facturas_pagos").delete().eq("id", p.id)
    if (error) {
      setError(`No se pudo eliminar: ${detalle(error)}`)
    } else {
      if (p.comprobante_object_path) {
        await supabase.storage.from(BUCKET).remove([p.comprobante_object_path]).catch(() => {})
      }
      await cargar()
      await onCambio()
    }
    setBorrandoId(null)
  }, [factura, cargar, onCambio])

  const verComprobante = useCallback(async (p: Pago) => {
    if (!p.comprobante_object_path) return
    const { data, error } = await supabase.storage.from(BUCKET)
      .createSignedUrl(p.comprobante_object_path, 300, { download: p.comprobante_file_name ?? true })
    if (error || !data?.signedUrl) {
      setError(`No se pudo abrir el comprobante: ${error?.message ?? "sin URL"}`)
      return
    }
    window.open(data.signedUrl, "_blank", "noopener")
  }, [])

  if (!factura) return null

  const liquidada = saldoVivo <= 0.01

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!guardando) { if (!v) limpiarForm(); onOpenChange(v) } }}>
      <DialogContent className="max-w-2xl bg-slate-800 border-slate-700 text-slate-200 p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b border-slate-700 bg-slate-900/60">
          <DialogTitle className="text-slate-100">Pagos · {factura.folio_completo}</DialogTitle>
          <p className="text-xs text-slate-400 mt-0.5">{factura.proveedor}</p>
        </DialogHeader>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* ── resumen ── */}
          <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4 grid grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Total</p>
              <p className="text-sm text-slate-300 tabular-nums">{money(factura.total, factura.moneda)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Pagado</p>
              <p className="text-sm text-emerald-400 tabular-nums">
                {money(factura.total - saldoVivo, factura.moneda)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Saldo</p>
              <p className={`text-sm font-semibold tabular-nums ${liquidada ? "text-emerald-400" : "text-slate-100"}`}>
                {money(Math.max(saldoVivo, 0), factura.moneda)}
              </p>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-200">{error}</p>
            </div>
          )}

          {/* ── pagos aplicados ── */}
          <div className="rounded-xl border border-slate-700 overflow-hidden">
            <div className="px-4 py-2 bg-slate-900/60 border-b border-slate-700 flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-300">
                Pagos aplicados{pagos.length > 0 && <span className="text-slate-500"> · {pagos.length}</span>}
              </p>
            </div>

            {cargando ? (
              <div className="py-8 text-center"><Loader2 className="w-4 h-4 animate-spin text-slate-500 mx-auto" /></div>
            ) : pagos.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">Todavía no se le aplica ningún pago.</div>
            ) : (
              <div className="divide-y divide-slate-700/60">
                {pagos.map((p) => {
                  const puedeBorrar = borraCualquierMes || esDelMesEnCurso(p.created_at)
                  return (
                    <div key={p.id} className="px-4 py-2.5 flex items-start gap-3">
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0 mt-0.5">
                        <Banknote className="w-3.5 h-3.5 text-emerald-400" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-200 tabular-nums">{money(p.monto, factura.moneda)}</p>
                        <p className="text-[11px] text-slate-500">
                          {fechaCorta(p.fecha_pago)} · {METODOS.find(m => m[0] === p.metodo_pago)?.[1] ?? p.metodo_pago}
                          {p.referencia && <> · {p.referencia}</>}
                          {p.cuenta_origen && <> · {p.cuenta_origen}</>}
                        </p>
                        {p.notas && <p className="text-[11px] text-slate-500 mt-0.5">{p.notas}</p>}
                      </div>

                      {p.comprobante_object_path && (
                        <button onClick={() => void verComprobante(p)}
                          title={p.comprobante_file_name ?? "Comprobante"}
                          className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:text-[#4da8e8] hover:bg-slate-700/60 transition-colors">
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        onClick={() => puedeBorrar && void borrar(p)}
                        disabled={!puedeBorrar || borrandoId === p.id}
                        title={puedeBorrar
                          ? "Eliminar pago"
                          : "Solo se pueden eliminar pagos registrados en el mes en curso"}
                        className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:text-red-400
                                   hover:bg-slate-700/60 transition-colors disabled:opacity-30
                                   disabled:hover:text-slate-500 disabled:cursor-not-allowed"
                      >
                        {borrandoId === p.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── nuevo pago ── */}
          {!form ? (
            liquidada ? (
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <p className="text-xs text-emerald-200">Esta factura ya está liquidada.</p>
              </div>
            ) : (
              <Button onClick={abrirForm} style={{ background: "#0174bd" }} className="text-white w-full">
                <Plus className="w-4 h-4 mr-1.5" />Registrar pago
              </Button>
            )
          ) : (
            <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4 space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <Campo etiqueta="Monto" requerido>
                  <input type="number" step="0.01" min="0" value={monto}
                    onChange={(e) => setMonto(e.target.value)} disabled={guardando}
                    className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-1.5 text-sm
                               text-slate-200 tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0174bd]/50" />
                  <p className="text-[10px] text-slate-600 mt-1">
                    Saldo disponible {money(Math.max(saldoVivo, 0), factura.moneda)}
                  </p>
                </Campo>

                <Campo etiqueta="Fecha del pago" requerido>
                  <input type="date" value={fechaPago}
                    onChange={(e) => setFechaPago(e.target.value)} disabled={guardando}
                    className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-1.5 text-sm
                               text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0174bd]/50" />
                  <p className="text-[10px] text-slate-600 mt-1">Cuándo se hizo, no cuándo lo capturas.</p>
                </Campo>

                <Campo etiqueta="Método">
                  <select value={metodo} onChange={(e) => setMetodo(e.target.value)} disabled={guardando}
                    className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-1.5 text-sm
                               text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0174bd]/50">
                    {METODOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                  </select>
                </Campo>

                <Campo etiqueta="Referencia">
                  <input value={referencia} onChange={(e) => setReferencia(e.target.value)}
                    disabled={guardando} placeholder="Folio SPEI, número de cheque…"
                    className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-1.5 text-sm
                               text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#0174bd]/50" />
                </Campo>

                <Campo etiqueta="Cuenta de origen">
                  <input value={cuenta} onChange={(e) => setCuenta(e.target.value)}
                    disabled={guardando} placeholder="Banco o cuenta de donde salió"
                    className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-1.5 text-sm
                               text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#0174bd]/50" />
                </Campo>

                <Campo etiqueta="Notas">
                  <input value={notas} onChange={(e) => setNotas(e.target.value)} disabled={guardando}
                    className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-1.5 text-sm
                               text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0174bd]/50" />
                </Campo>
              </div>

              {/* comprobante */}
              <div>
                <p className="text-[11px] font-semibold text-slate-400 mb-1.5">Comprobante de pago</p>
                {comprobante ? (
                  <div className="flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2">
                    <Paperclip className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="text-xs text-slate-300 truncate flex-1">{comprobante.name}</span>
                    <button type="button" disabled={guardando} aria-label="Quitar comprobante"
                      onClick={() => { setComprobante(null); if (fileRef.current) fileRef.current.value = "" }}
                      className="rounded p-0.5 text-slate-500 hover:text-slate-300">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button type="button" disabled={guardando} onClick={() => fileRef.current?.click()}
                    className="w-full rounded-lg border border-dashed border-slate-600 py-2 text-xs
                               text-slate-500 hover:text-slate-300 hover:border-slate-500 transition-colors">
                    Adjuntar comprobante (opcional)
                  </button>
                )}
                <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,image/*,application/pdf"
                  className="hidden" onChange={(e) => setComprobante(e.target.files?.[0] ?? null)} />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <Button variant="ghost" onClick={limpiarForm} disabled={guardando}
                  className="text-slate-400 hover:text-slate-200 hover:bg-slate-700/60">
                  Cancelar
                </Button>
                <Button onClick={() => void registrar()} disabled={guardando || !monto}
                  style={{ background: guardando || !monto ? undefined : "#0174bd" }}
                  className="text-white disabled:opacity-40">
                  {guardando
                    ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Guardando…</>)
                    : "Guardar pago"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Campo({ etiqueta, requerido, children }: {
  etiqueta: string; requerido?: boolean; children: React.ReactNode
}) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-slate-400">
        {etiqueta}{requerido && <span className="text-red-400"> *</span>}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  )
}
