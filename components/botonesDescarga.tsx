"use client"

/**
 * Botón de descarga que se desdobla en PDF y Excel.
 *
 * Un solo botón ocupa el lugar, y al pulsarlo se abre en los dos formatos
 * (rojo de Acrobat, verde de Excel) más una X para volver. Así la descarga
 * no compite visualmente con la acción principal de la pantalla, que suele
 * ser guardar o aplicar algo.
 *
 * Los colores viven en app/globals.css como CSS plano y SIN capa, no como
 * utilidades de Tailwind: Tailwind v4 emite sus utilidades dentro de @layer
 * y la variante del botón le ganaba al fondo, dejando los dos transparentes.
 * Una regla sin capa vence a cualquier regla con capa, sin importar el orden.
 *
 * La animación corre en los dos sentidos: al abrir los botones entran
 * escalonados desde la derecha, y al cerrar se repliegan en orden inverso
 * antes de desmontarse.
 */

import { useCallback, useState } from "react"
import { Download, FileSpreadsheet, FileText, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"

export type FormatoDescarga = "pdf" | "xlsx"

export function BotonesDescarga({
  onDescargar,
  etiqueta = "Descargar",
  disabled = false,
  size,
  /** Cómo se ve el botón plegado: discreto o con el azul de la marca. */
  tono = "neutro",
  tituloPdf = "Descargar en PDF",
  tituloExcel = "Descargar en Excel",
  onError,
}: {
  onDescargar: (formato: FormatoDescarga) => void | Promise<void>
  etiqueta?: string
  disabled?: boolean
  size?: "sm" | "default" | "lg"
  tono?: "neutro" | "azul"
  tituloPdf?: string
  tituloExcel?: string
  onError?: (mensaje: string) => void
}) {
  const [abierta, setAbierta] = useState(false)
  const [cerrando, setCerrando] = useState(false)
  const [descargando, setDescargando] = useState<FormatoDescarga | null>(null)

  const cerrar = useCallback(() => {
    setCerrando(true)
    // 150 ms de animación de salida + 60 ms del último escalón.
    setTimeout(() => {
      setAbierta(false)
      setCerrando(false)
    }, 210)
  }, [])

  const correr = useCallback(
    async (formato: FormatoDescarga) => {
      setDescargando(formato)
      try {
        await onDescargar(formato)
        cerrar()
      } catch (e) {
        console.error(e)
        onError?.("No se pudo generar el documento.")
      } finally {
        setDescargando(null)
      }
    },
    [onDescargar, cerrar, onError],
  )

  const icono = size === "sm" ? "w-4 h-4 mr-1.5" : "w-4 h-4 mr-2"

  if (!abierta) {
    return (
      <Button
        type="button"
        size={size}
        variant={tono === "azul" ? undefined : "outline"}
        disabled={disabled}
        onClick={() => setAbierta(true)}
        title={`${etiqueta} en PDF o Excel`}
        className={
          tono === "azul"
            ? "rafsa-plegado cursor-pointer bg-[#0174bd] hover:bg-[#015d97] text-white disabled:opacity-50"
            : "rafsa-plegado cursor-pointer border-slate-600 bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-slate-100 hover:border-slate-500 disabled:opacity-50"
        }
      >
        <Download className={icono} />
        {etiqueta}
      </Button>
    )
  }

  return (
    <div
      className={`flex items-center gap-1.5 ${
        cerrando ? "rafsa-desdoble-cerrando" : "rafsa-desdoble"
      }`}
    >
      <Button
        type="button"
        size={size}
        onClick={() => void correr("pdf")}
        disabled={disabled || descargando !== null}
        title={tituloPdf}
        className="rafsa-btn-pdf cursor-pointer"
      >
        {descargando === "pdf" ? (
          <>
            <Loader2 className={`${icono} animate-spin`} />
            PDF…
          </>
        ) : (
          <>
            <FileText className={icono} />
            PDF
          </>
        )}
      </Button>

      <Button
        type="button"
        size={size}
        onClick={() => void correr("xlsx")}
        disabled={disabled || descargando !== null}
        title={tituloExcel}
        className="rafsa-btn-excel cursor-pointer"
      >
        {descargando === "xlsx" ? (
          <>
            <Loader2 className={`${icono} animate-spin`} />
            Excel…
          </>
        ) : (
          <>
            <FileSpreadsheet className={icono} />
            Excel
          </>
        )}
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={cerrar}
        disabled={descargando !== null}
        title="Cerrar"
        className="cursor-pointer bg-transparent text-slate-500 hover:bg-slate-700/70 hover:text-slate-200"
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  )
}
