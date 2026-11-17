"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import {
  AlertTriangle, CheckCircle2, FileCode2, FileText, Loader2, Upload, X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { supabase } from "@/lib/supabaseClient"
import { parseCFDI, CfdiError, type CfdiParsed } from "@/lib/cfdi"

const BUCKET = "proveedores-docs"

const money = (n: number, moneda = "MXN") =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: moneda }).format(n)

/** La Fecha del CFDI viene sin zona; solo la mostramos. */
function fechaCorta(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })
}

function sumaDias(iso: string | null, dias: number): string {
  const base = iso ? new Date(iso) : new Date()
  if (Number.isNaN(base.getTime())) return ""
  base.setDate(base.getDate() + dias)
  return base.toISOString().slice(0, 10)
}

/** Los campos de PostgrestError no son enumerables: console.error(e) imprime {}. */
function detalleError(e: any): string {
  if (!e) return "Error desconocido."
  const partes = [e.message, e.details, e.hint, e.code].filter(Boolean)
  return partes.length ? partes.join(" · ") : String(e)
}

export function ProveedorFacturaUpload({
  open,
  onOpenChange,
  onRegistrada,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Se llama con el id de la factura ya registrada, para refrescar la lista. */
  onRegistrada?: (facturaId: string) => void
}) {
  const [xmlFile, setXmlFile] = useState<File | null>(null)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [cfdi, setCfdi] = useState<CfdiParsed | null>(null)
  const [errorLectura, setErrorLectura] = useState<string | null>(null)
  const [vencimiento, setVencimiento] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null)

  const xmlRef = useRef<HTMLInputElement>(null)
  const pdfRef = useRef<HTMLInputElement>(null)

  const limpiar = useCallback(() => {
    setXmlFile(null); setPdfFile(null); setCfdi(null)
    setErrorLectura(null); setErrorGuardar(null); setVencimiento("")
    if (xmlRef.current) xmlRef.current.value = ""
    if (pdfRef.current) pdfRef.current.value = ""
  }, [])

  const cerrar = useCallback((v: boolean) => {
    if (guardando) return
    if (!v) limpiar()
    onOpenChange(v)
  }, [guardando, limpiar, onOpenChange])

  const tomarXml = useCallback(async (file: File | null) => {
    setErrorLectura(null); setErrorGuardar(null); setCfdi(null); setXmlFile(file)
    if (!file) return
    try {
      const texto = await file.text()
      const leido = parseCFDI(texto)
      setCfdi(leido)
      // Default razonable: 30 días desde la fecha de la factura. Se cambia abajo.
      setVencimiento(sumaDias(leido.fecha, 30))
    } catch (e: any) {
      setCfdi(null)
      setErrorLectura(e instanceof CfdiError ? e.message : `No se pudo leer el XML: ${e?.message ?? e}`)
    }
  }, [])

  const rutaBase = useMemo(() => {
    if (!cfdi) return null
    const llave = cfdi.uuid ?? `sin-timbre-${Date.now()}`
    return `facturas/${cfdi.rfc_emisor}/${llave}`
  }, [cfdi])

  const registrar = useCallback(async () => {
    if (!cfdi || !xmlFile || !rutaBase) return
    setGuardando(true); setErrorGuardar(null)

    const subidos: string[] = []
    try {
      const xmlPath = `${rutaBase}.xml`
      const { error: eXml } = await supabase.storage.from(BUCKET)
        .upload(xmlPath, xmlFile, { contentType: "application/xml", upsert: false })
      if (eXml) throw new Error(`No se pudo subir el XML: ${eXml.message}`)
      subidos.push(xmlPath)

      let pdfPath: string | null = null
      if (pdfFile) {
        pdfPath = `${rutaBase}.pdf`
        const { error: ePdf } = await supabase.storage.from(BUCKET)
          .upload(pdfPath, pdfFile, { contentType: "application/pdf", upsert: false })
        if (ePdf) throw new Error(`No se pudo subir el PDF: ${ePdf.message}`)
        subidos.push(pdfPath)
      }

      const { data, error } = await supabase.rpc("proveedores_registrar_factura", {
        p_cfdi: cfdi as any,
        p_xml_object_path: xmlPath,
        p_pdf_object_path: pdfPath,
        p_file_name: xmlFile.name,
        p_fecha_vencimiento: vencimiento || null,
      })
      if (error) throw new Error(detalleError(error))

      limpiar()
      onOpenChange(false)
      onRegistrada?.(data as string)
    } catch (e: any) {
      // Si la base rechazó, no dejamos los archivos huérfanos en Storage.
      if (subidos.length) {
        await supabase.storage.from(BUCKET).remove(subidos).catch(() => {})
      }
      setErrorGuardar(e?.message ?? String(e))
    } finally {
      setGuardando(false)
    }
  }, [cfdi, xmlFile, pdfFile, rutaBase, vencimiento, limpiar, onOpenChange, onRegistrada])

  const puedeGuardar = !!cfdi && !!xmlFile && !!vencimiento && !guardando

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="max-w-3xl bg-slate-800 border-slate-700 text-slate-200 p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b border-slate-700 bg-slate-900/60">
          <DialogTitle className="text-slate-100">Subir factura de proveedor</DialogTitle>
          <p className="text-xs text-slate-400 mt-0.5">
            El XML es el documento fiscal; el PDF es opcional y solo se guarda para consulta.
          </p>
        </DialogHeader>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* ── archivos ── */}
          <div className="grid sm:grid-cols-2 gap-3">
            <SelectorArchivo
              icono={<FileCode2 className="w-4 h-4" />}
              etiqueta="XML del CFDI"
              requerido
              archivo={xmlFile}
              accept=".xml,text/xml,application/xml"
              inputRef={xmlRef}
              onChange={tomarXml}
              disabled={guardando}
            />
            <SelectorArchivo
              icono={<FileText className="w-4 h-4" />}
              etiqueta="PDF (opcional)"
              archivo={pdfFile}
              accept=".pdf,application/pdf"
              inputRef={pdfRef}
              onChange={setPdfFile}
              disabled={guardando}
            />
          </div>

          {errorLectura && <Aviso tono="danger">{errorLectura}</Aviso>}

          {/* ── lo que se leyó ── */}
          {cfdi && (
            <>
              <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-100 truncate">
                      {cfdi.nombre_emisor ?? cfdi.rfc_emisor}
                    </p>
                    <p className="text-[11px] text-slate-500">{cfdi.rfc_emisor}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-slate-100">
                      {[cfdi.serie, cfdi.folio].filter(Boolean).join("-") || "sin folio"}
                    </p>
                    <p className="text-[11px] text-slate-500">{fechaCorta(cfdi.fecha)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-3 border-t border-slate-700/60">
                  <Dato etiqueta="Subtotal" valor={money(cfdi.subtotal, cfdi.moneda)} />
                  <Dato etiqueta="Descuento" valor={money(cfdi.descuento, cfdi.moneda)} />
                  <Dato etiqueta="IVA" valor={money(cfdi.iva, cfdi.moneda)} />
                  <Dato etiqueta="Total" valor={money(cfdi.total, cfdi.moneda)} destacado />
                </div>

                <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 pt-3 border-t border-slate-700/60 text-[11px] text-slate-500">
                  <span>Para <span className="text-slate-300">{cfdi.nombre_receptor ?? cfdi.rfc_receptor}</span></span>
                  {cfdi.metodo_pago && <span>Método <span className="text-slate-300">{cfdi.metodo_pago}</span></span>}
                  <span>{cfdi.conceptos.length} concepto{cfdi.conceptos.length === 1 ? "" : "s"}</span>
                  {cfdi.moneda !== "MXN" && <span className="text-amber-400">{cfdi.moneda} · TC {cfdi.tipo_cambio}</span>}
                </div>
              </div>

              {cfdi.avisos.map((a, i) => (
                <Aviso key={i} tono="warning">{a}</Aviso>
              ))}

              {/* ── conceptos ── */}
              <div className="rounded-xl border border-slate-700 overflow-hidden">
                <div className="px-4 py-2 bg-slate-900/60 border-b border-slate-700">
                  <p className="text-xs font-semibold text-slate-300">Conceptos</p>
                </div>
                <div className="divide-y divide-slate-700/60 max-h-56 overflow-y-auto">
                  {cfdi.conceptos.map((c) => (
                    <div key={c.line_no} className="px-4 py-2.5 flex items-start gap-3">
                      <span className="text-[10px] text-slate-600 mt-1 w-4 shrink-0">{c.line_no}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-200 leading-snug">{c.descripcion}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {c.cantidad} {c.unidad ?? c.clave_unidad ?? ""} × {money(c.valor_unitario, cfdi.moneda)}
                          {c.no_identificacion && <> · {c.no_identificacion}</>}
                        </p>
                      </div>
                      <span className="text-xs text-slate-300 shrink-0 tabular-nums">
                        {money(c.importe, cfdi.moneda)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="px-4 py-2 bg-slate-900/40 border-t border-slate-700">
                  <p className="text-[10px] text-slate-500">
                    La clasificación de cada renglón y la obra se confirman en el siguiente paso,
                    antes de que toquen el inventario.
                  </p>
                </div>
              </div>

              {/* ── fecha de pago ── */}
              <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
                <label className="text-xs font-semibold text-slate-300">
                  Fecha de pago <span className="text-red-400">*</span>
                </label>
                <p className="text-[11px] text-slate-500 mt-0.5 mb-2.5">
                  De aquí salen los recordatorios: 5 días antes, el día que vence, y diario si se pasa.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    value={vencimiento}
                    onChange={(e) => setVencimiento(e.target.value)}
                    disabled={guardando}
                    className="rounded-lg bg-slate-800 border border-slate-600 px-3 py-1.5 text-sm
                               text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0174bd]/50"
                  />
                  {[
                    ["Contado", 0], ["15 días", 15], ["30 días", 30], ["45 días", 45], ["60 días", 60],
                  ].map(([txt, d]) => (
                    <button
                      key={txt as string}
                      type="button"
                      disabled={guardando}
                      onClick={() => setVencimiento(sumaDias(cfdi.fecha, d as number))}
                      className="rounded-lg border border-slate-600 px-2.5 py-1 text-[11px]
                                 text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors"
                    >
                      {txt as string}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-600 mt-2">Contado a partir de la fecha de la factura.</p>
              </div>
            </>
          )}

          {errorGuardar && <Aviso tono="danger">{errorGuardar}</Aviso>}
        </div>

        <div className="px-5 py-3.5 border-t border-slate-700 bg-slate-900/60 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={() => cerrar(false)} disabled={guardando}
            className="text-slate-400 hover:text-slate-200 hover:bg-slate-700/60">
            Cancelar
          </Button>
          <Button onClick={registrar} disabled={!puedeGuardar}
            style={{ background: puedeGuardar ? "#0174bd" : undefined }}
            className="text-white disabled:opacity-40">
            {guardando
              ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Registrando…</>)
              : (<><Upload className="w-4 h-4 mr-2" />Registrar factura</>)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ── piezas ── */

function Dato({ etiqueta, valor, destacado }: { etiqueta: string; valor: string; destacado?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{etiqueta}</p>
      <p className={destacado ? "text-sm font-semibold text-slate-100 tabular-nums"
                              : "text-sm text-slate-300 tabular-nums"}>{valor}</p>
    </div>
  )
}

function Aviso({ tono, children }: { tono: "warning" | "danger"; children: React.ReactNode }) {
  const c = tono === "danger"
    ? { borde: "border-red-500/40",   fondo: "bg-red-500/10",   icono: "text-red-400",   texto: "text-red-200" }
    : { borde: "border-amber-500/40", fondo: "bg-amber-500/10", icono: "text-amber-400", texto: "text-amber-100" }
  return (
    <div className={`rounded-xl border ${c.borde} ${c.fondo} p-3 flex items-start gap-2.5`}>
      <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${c.icono}`} />
      <p className={`text-xs leading-relaxed ${c.texto}`}>{children}</p>
    </div>
  )
}

function SelectorArchivo({
  icono, etiqueta, requerido, archivo, accept, inputRef, onChange, disabled,
}: {
  icono: React.ReactNode
  etiqueta: string
  requerido?: boolean
  archivo: File | null
  accept: string
  inputRef: React.RefObject<HTMLInputElement | null>
  onChange: (f: File | null) => void
  disabled?: boolean
}) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-slate-500">{icono}</span>
        <span className="text-xs font-semibold text-slate-300">
          {etiqueta}{requerido && <span className="text-red-400"> *</span>}
        </span>
      </div>

      {archivo ? (
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="text-xs text-slate-300 truncate flex-1">{archivo.name}</span>
          <button
            type="button"
            disabled={disabled}
            aria-label={`Quitar ${etiqueta}`}
            onClick={() => { onChange(null); if (inputRef.current) inputRef.current.value = "" }}
            className="rounded p-0.5 text-slate-500 hover:text-slate-300"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="w-full rounded-lg border border-dashed border-slate-600 py-2.5 text-xs
                     text-slate-500 hover:text-slate-300 hover:border-slate-500 transition-colors"
        >
          Elegir archivo
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </div>
  )
}
