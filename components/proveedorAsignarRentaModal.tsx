"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, CalendarRange, Loader2, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { supabase } from "@/lib/supabaseClient"

export type RentaParaAsignar = {
  id: string
  descripcion: string
  modelo: string | null
  num_interno: string | null
  obra_id: string | null
  en_obra_desde: string | null
  en_obra_hasta: string | null
  obra_notas: string | null
}

type Empresa = { id: string; name: string }
type Obra = { id: string; name: string; code: string | null; empresa_id: string | null }

const detalle = (e: any) =>
  [e?.message, e?.details, e?.hint, e?.code].filter(Boolean).join(" · ") || String(e)

const hoyISO = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export function ProveedorAsignarRentaModal({
  renta,
  open,
  onOpenChange,
  onAsignada,
}: {
  renta: RentaParaAsignar | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onAsignada: () => Promise<void> | void
}) {
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [obras, setObras] = useState<Obra[]>([])
  const [cargando, setCargando] = useState(true)

  const [empresaId, setEmpresaId] = useState("")
  const [obraId, setObraId] = useState("")
  const [desde, setDesde] = useState("")
  const [hasta, setHasta] = useState("")
  const [notas, setNotas] = useState("")

  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !renta) return
    setError(null); setGuardando(false); setCargando(true)
    setDesde(renta.en_obra_desde ?? hoyISO())
    setHasta(renta.en_obra_hasta ?? "")
    setNotas(renta.obra_notas ?? "")

    void (async () => {
      const [emRes, obRes] = await Promise.all([
        supabase.from("empresas").select("id, name").order("name"),
        supabase.from("obras").select("id, name, code, empresa_id").order("name"),
      ])
      if (emRes.error || obRes.error) {
        setError(`No se pudieron cargar obras: ${detalle(emRes.error ?? obRes.error)}`)
      }
      const listaObras = (obRes.data as Obra[]) ?? []
      setEmpresas((emRes.data as Empresa[]) ?? [])
      setObras(listaObras)

      // Si ya estaba asignada, se abre en su empresa y obra actuales.
      const actual = renta.obra_id ? listaObras.find(o => o.id === renta.obra_id) : null
      setEmpresaId(actual?.empresa_id ?? "")
      setObraId(actual?.id ?? "")
      setCargando(false)
    })()
  }, [open, renta])

  const obrasDeEmpresa = useMemo(
    () => obras.filter(o => o.empresa_id === empresaId), [obras, empresaId])

  const cambiarEmpresa = useCallback((id: string) => {
    setEmpresaId(id); setObraId(""); setError(null)
  }, [])

  const dias = useMemo(() => {
    if (!desde || !hasta) return null
    const d = new Date(`${desde}T12:00:00`).getTime()
    const h = new Date(`${hasta}T12:00:00`).getTime()
    if (Number.isNaN(d) || Number.isNaN(h) || h < d) return null
    return Math.round((h - d) / 86_400_000) + 1
  }, [desde, hasta])

  const asignar = useCallback(async () => {
    if (!renta) return
    if (!obraId) { setError("Elige la obra."); return }
    if (!desde || !hasta) { setError("Indica desde y hasta cuándo estará en la obra."); return }
    if (hasta < desde) { setError("La fecha de salida no puede ser anterior a la de llegada."); return }

    setGuardando(true); setError(null)
    const { error } = await supabase.rpc("proveedores_asignar_renta_obra", {
      p_renta_id: renta.id,
      p_obra_id: obraId,
      p_desde: desde,
      p_hasta: hasta,
      p_notas: notas.trim() || null,
    })
    setGuardando(false)
    if (error) { setError(detalle(error)); return }
    onOpenChange(false)
    await onAsignada()
  }, [renta, obraId, desde, hasta, notas, onOpenChange, onAsignada])

  if (!renta) return null

  const yaPaso = !!hasta && hasta < hoyISO()
  const puedeGuardar = !!obraId && !!desde && !!hasta && !guardando

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!guardando) onOpenChange(v) }}>
      <DialogContent className="max-w-lg bg-slate-800 border-slate-700 text-slate-200 p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b border-slate-700 bg-slate-900/60">
          <DialogTitle className="text-slate-100">Asignar a obra</DialogTitle>
          <p className="text-xs text-slate-400 mt-0.5">
            {renta.descripcion}
            {renta.num_interno && <span className="text-slate-500"> · {renta.num_interno}</span>}
          </p>
        </DialogHeader>

        <div className="p-5 space-y-3">
          {cargando ? (
            <div className="py-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-slate-500 mx-auto" /></div>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 gap-3">
                <Campo etiqueta="Empresa" requerido>
                  <select value={empresaId} onChange={(e) => cambiarEmpresa(e.target.value)}
                    disabled={guardando}
                    className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-1.5 text-sm
                               text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0174bd]/50">
                    <option value="">— Elige la empresa —</option>
                    {empresas.map(em => <option key={em.id} value={em.id}>{em.name}</option>)}
                  </select>
                </Campo>

                <Campo etiqueta="Obra" requerido>
                  <select value={obraId} onChange={(e) => setObraId(e.target.value)}
                    disabled={guardando || !empresaId}
                    className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-1.5 text-sm
                               text-slate-200 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[#0174bd]/50">
                    <option value="">
                      {!empresaId ? "— Elige primero la empresa —"
                        : obrasDeEmpresa.length === 0 ? "— Esta empresa no tiene obras —"
                        : "— Elige la obra —"}
                    </option>
                    {obrasDeEmpresa.map(o => (
                      <option key={o.id} value={o.id}>{o.code ? `${o.code} · ${o.name}` : o.name}</option>
                    ))}
                  </select>
                </Campo>
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-3">
                <p className="text-[11px] font-semibold text-slate-400 mb-2 flex items-center gap-1.5">
                  <CalendarRange className="w-3 h-3" />
                  Tiempo en la obra <span className="text-red-400">*</span>
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase tracking-wide text-slate-500">Llega</label>
                    <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
                      disabled={guardando}
                      className="w-full mt-1 rounded-lg bg-slate-800 border border-slate-600 px-3 py-1.5 text-sm
                                 text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0174bd]/50" />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wide text-slate-500">Se va</label>
                    <input type="date" value={hasta} min={desde || undefined}
                      onChange={(e) => setHasta(e.target.value)} disabled={guardando}
                      className="w-full mt-1 rounded-lg bg-slate-800 border border-slate-600 px-3 py-1.5 text-sm
                                 text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0174bd]/50" />
                  </div>
                </div>
                <p className="text-[10px] text-slate-600 mt-2">
                  {dias != null
                    ? `${dias} día${dias === 1 ? "" : "s"} en obra. Al pasar la fecha de salida se marca como devuelta sola.`
                    : "Al pasar la fecha de salida se marca como devuelta sola."}
                </p>
                {yaPaso && (
                  <p className="text-[10px] text-amber-400 mt-1">
                    Esa fecha ya pasó: la renta quedará como devuelta.
                  </p>
                )}
              </div>

              <Campo etiqueta="Nota">
                <input value={notas} onChange={(e) => setNotas(e.target.value)} disabled={guardando}
                  placeholder="Frente, quién la opera, condiciones…"
                  className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-1.5 text-sm
                             text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#0174bd]/50" />
              </Campo>

              {error && (
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-200">{error}</p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-slate-700 bg-slate-900/60 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={guardando}
            className="text-slate-400 hover:text-slate-200 hover:bg-slate-700/60">Cancelar</Button>
          <Button onClick={() => void asignar()} disabled={!puedeGuardar}
            style={{ background: puedeGuardar ? "#0174bd" : undefined }}
            className="text-white disabled:opacity-40">
            {guardando
              ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Guardando…</>)
              : (<><MapPin className="w-4 h-4 mr-2" />Asignar</>)}
          </Button>
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
