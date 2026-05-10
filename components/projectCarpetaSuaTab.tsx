"use client"

import { useEffect, useRef, useState, type DragEvent } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Button } from "@/components/ui/button"
// Card components unused after dark mode refactor
// import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Upload,
  FileText,
  Eye,
  Trash2,
  Download,
  Loader2,
  FolderOpen,
  RefreshCw,
  File,
  ImageIcon,
  FileArchive,
} from "lucide-react"

const SUA_BUCKET = "carpeta-sua"
const SUA_REF_TABLE = "carpeta_sua"

type SuaFile = {
  id: string
  file_url: string
  file_name: string
  mime_type: string | null
  size_bytes: number | null
  uploaded_by: string | null
  uploaded_at: string
}

function formatBytes(bytes: number | null) {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return "-"
  const units = ["B", "KB", "MB", "GB"]
  let i = 0
  let v = bytes
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
  } catch {
    return iso
  }
}

function getMimeLabel(mime: string | null, fileName: string) {
  if (!mime) {
    const ext = fileName.split(".").pop()?.toUpperCase() ?? "FILE"
    return ext
  }
  if (mime.startsWith("image/")) return mime.split("/")[1].toUpperCase()
  if (mime === "application/pdf") return "PDF"
  if (mime.includes("word")) return "WORD"
  if (mime.includes("excel") || mime.includes("spreadsheet")) return "EXCEL"
  if (mime.includes("zip") || mime.includes("rar")) return "ZIP"
  const ext = fileName.split(".").pop()?.toUpperCase()
  return ext ?? mime.split("/")[1]?.toUpperCase() ?? "FILE"
}

function getMimeBadgeClass(mime: string | null) {
  if (!mime) return "bg-slate-500/15 text-slate-400 border border-slate-500/25"
  if (mime.startsWith("image/")) return "bg-violet-500/15 text-violet-400 border border-violet-500/25"
  if (mime === "application/pdf") return "bg-red-500/15 text-red-400 border border-red-500/25"
  if (mime.includes("word")) return "bg-[#0174bd]/15 text-[#4da8e8] border border-[#0174bd]/25"
  if (mime.includes("excel") || mime.includes("spreadsheet")) return "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
  return "bg-slate-500/15 text-slate-400 border border-slate-500/25"
}

function FileIcon({ mime }: { mime: string | null }) {
  if (mime?.startsWith("image/")) return <ImageIcon className="w-4 h-4 text-purple-500" />
  if (mime === "application/pdf") return <FileText className="w-4 h-4 text-red-500" />
  if (mime?.includes("zip") || mime?.includes("rar")) return <FileArchive className="w-4 h-4 text-amber-500" />
  return <File className="w-4 h-4 text-slate-400" />
}

function isPreviewable(mime: string | null) {
  if (!mime) return false
  return mime.startsWith("image/") || mime === "application/pdf"
}

type Props = {
  obraId: string
  compact?: boolean
}

export function ProjectCarpetaSuaTab({ obraId, compact = false }: Props) {
  const [files, setFiles] = useState<SuaFile[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  // Visor inline
  const [viewOpen, setViewOpen] = useState(false)
  const [viewingFile, setViewingFile] = useState<SuaFile | null>(null)
  const [viewingUrl, setViewingUrl] = useState<string | null>(null)
  const [viewingLoading, setViewingLoading] = useState(false)

  // Eliminacion
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  async function loadFiles() {
    if (!obraId) return
    setLoading(true)
    setError(null)

    const { data, error: fetchErr } = await supabase
      .from("attachments")
      .select("id, file_url, file_name, mime_type, size_bytes, uploaded_by, uploaded_at")
      .eq("ref_table", SUA_REF_TABLE)
      .eq("ref_id", obraId)
      .order("uploaded_at", { ascending: false })

    if (fetchErr) {
      console.error("loadFiles SUA error:", fetchErr)
      setError("No se pudieron cargar los archivos.")
    } else {
      setFiles((data || []) as SuaFile[])
    }

    setLoading(false)
  }

  useEffect(() => {
    loadFiles()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obraId])

  async function handleUpload(file: File) {
    if (!file || !obraId) return
    setUploading(true)
    setError(null)

    try {
      const uuid = crypto.randomUUID()
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
      const objectPath = `obras/${obraId}/${uuid}_${safeName}`

      const { error: storageErr } = await supabase.storage
        .from(SUA_BUCKET)
        .upload(objectPath, file, { contentType: file.type, upsert: false })

      if (storageErr) {
        console.error("storage upload SUA error:", storageErr)
        setError("No se pudo subir el archivo.")
        setUploading(false)
        return
      }

      const { data: authData } = await supabase.auth.getUser()
      const uploaded_by = authData?.user?.id ?? null

      const { error: insertErr } = await supabase.from("attachments").insert({
        ref_table: SUA_REF_TABLE,
        ref_id: obraId,
        file_url: objectPath,
        file_name: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
        uploaded_by,
      })

      if (insertErr) {
        console.error("insert SUA attachment error:", insertErr)
        // Intentar borrar el archivo del storage para evitar huerfanos
        await supabase.storage.from(SUA_BUCKET).remove([objectPath])
        setError("No se pudo registrar el archivo.")
        setUploading(false)
        return
      }

      await loadFiles()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al subir archivo.")
    }

    setUploading(false)
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (file) handleUpload(file)
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(true)
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleUpload(file)
  }

  async function handleView(file: SuaFile) {
    setViewingFile(file)
    setViewingUrl(null)
    setViewOpen(true)
    setViewingLoading(true)

    const { data, error: urlErr } = await supabase.storage
      .from(SUA_BUCKET)
      .createSignedUrl(file.file_url, 60 * 60) // 1 hora

    if (urlErr || !data?.signedUrl) {
      console.error("signed URL error:", urlErr)
      setError("No se pudo generar el enlace de visualizacion.")
      setViewOpen(false)
    } else {
      setViewingUrl(data.signedUrl)
    }

    setViewingLoading(false)
  }

  async function handleDownload(file: SuaFile) {
    const { data, error: urlErr } = await supabase.storage
      .from(SUA_BUCKET)
      .createSignedUrl(file.file_url, 300, { download: file.file_name })

    if (urlErr || !data?.signedUrl) {
      setError("No se pudo generar el enlace de descarga.")
      return
    }

    const a = document.createElement("a")
    a.href = data.signedUrl
    a.download = file.file_name
    a.click()
  }

  async function handleDelete(file: SuaFile) {
    const ok = window.confirm(`Eliminar "${file.file_name}" de la Carpeta SUA?`)
    if (!ok) return

    setDeletingId(file.id)
    setError(null)

    const { error: storageErr } = await supabase.storage
      .from(SUA_BUCKET)
      .remove([file.file_url])

    if (storageErr) {
      console.error("storage delete SUA error:", storageErr)
    }

    const { error: dbErr } = await supabase
      .from("attachments")
      .delete()
      .eq("id", file.id)

    if (dbErr) {
      console.error("db delete SUA error:", dbErr)
      setError("No se pudo eliminar el archivo.")
      setDeletingId(null)
      return
    }

    setFiles((prev) => prev.filter((f) => f.id !== file.id))
    setDeletingId(null)
  }

  const filtered = files.filter((f) =>
    !search.trim() || f.file_name.toLowerCase().includes(search.trim().toLowerCase()),
  )

  // ── Modo compacto: card simple con lista y un botón de subir ──
  if (compact) {
    return (
      <div
        className="rounded-2xl border border-slate-700/60 overflow-hidden"
        style={{
          background: "linear-gradient(145deg, #1e293b 0%, #172030 60%, #1a2535 100%)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        <div className="flex flex-row items-center justify-between p-5 border-b border-slate-700/60">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-slate-500" />
            <h3 className="text-base font-semibold text-slate-100">Carpeta SUA</h3>
          </div>
          <Button
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="bg-[#0174bd] hover:bg-[#0174bd]/90 text-white"
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            {uploading ? "Subiendo..." : "Subir archivo"}
          </Button>
        </div>

        <div className="p-5">
          <input ref={inputRef} type="file" className="hidden" onChange={handleFileInputChange} />
          {error && (
            <div className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>
          )}
          {loading ? (
            <div className="py-6 flex items-center justify-center gap-2 text-slate-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Cargando...
            </div>
          ) : files.length === 0 ? (
            <div className="py-6 text-center">
              <FolderOpen className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-500">No hay archivos en la Carpeta SUA todavia.</p>
            </div>
          ) : (
            <div className="rounded-md border border-slate-700/60 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700/60 hover:bg-slate-800/40">
                    <TableHead className="w-full min-w-0 text-slate-400">Archivo</TableHead>
                    <TableHead className="w-20 shrink-0 text-slate-400">Tipo</TableHead>
                    <TableHead className="w-24 shrink-0 text-slate-400">Fecha</TableHead>
                    <TableHead className="w-24 shrink-0 text-right text-slate-400">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {files.map((f) => (
                    <TableRow key={f.id} className="border-slate-700/40 hover:bg-slate-800/40">
                      <TableCell className="max-w-0 w-full">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileIcon mime={f.mime_type} />
                          <span className="font-medium text-slate-200 truncate block min-w-0" title={f.file_name}>
                            {f.file_name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${getMimeBadgeClass(f.mime_type)}`}>
                          {getMimeLabel(f.mime_type, f.file_name)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-slate-400">{formatDate(f.uploaded_at)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {isPreviewable(f.mime_type) && (
                            <Button size="sm" variant="ghost" onClick={() => handleView(f)} title="Visualizar"
                              className="text-slate-400 hover:bg-slate-700/60 hover:text-slate-200">
                              <Eye className="w-4 h-4" />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => handleDownload(f)} title="Descargar"
                            className="text-slate-400 hover:bg-slate-700/60 hover:text-slate-200">
                            <Download className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm" variant="ghost"
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            onClick={() => handleDelete(f)}
                            disabled={deletingId === f.id}
                            title="Eliminar"
                          >
                            {deletingId === f.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
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

        {/* Visor inline (reutilizado) */}
        <Dialog open={viewOpen} onOpenChange={(v) => { if (!viewingLoading) { setViewOpen(v); if (!v) setViewingUrl(null) } }}>
          <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col bg-slate-800 border-slate-700">
            <DialogHeader>
              <DialogTitle className="truncate pr-8 text-slate-100">{viewingFile?.file_name}</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-hidden mt-2 min-h-[400px] flex items-center justify-center bg-slate-900 rounded-md">
              {viewingLoading ? (
                <div className="flex flex-col items-center gap-2 text-slate-500">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <p className="text-sm">Generando enlace seguro...</p>
                </div>
              ) : viewingUrl ? (
                viewingFile?.mime_type?.startsWith("image/") ? (
                  <img src={viewingUrl} alt={viewingFile?.file_name} className="max-w-full max-h-[65vh] object-contain rounded-md shadow" />
                ) : (
                  <iframe src={viewingUrl} className="w-full h-[65vh] rounded-md border-0" title={viewingFile?.file_name} />
                )
              ) : (
                <p className="text-sm text-slate-500">No se pudo cargar la vista previa.</p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-700 mt-3">
              {viewingFile && (
                <Button variant="outline" onClick={() => handleDownload(viewingFile)}
                  className="border-slate-700 text-slate-400 hover:bg-slate-700/60 hover:text-slate-200">
                  <Download className="w-4 h-4 mr-2" />
                  Descargar
                </Button>
              )}
              <Button variant="outline" onClick={() => { setViewOpen(false); setViewingUrl(null) }}
                className="border-slate-700 text-slate-400 hover:bg-slate-700/60 hover:text-slate-200">
                Cerrar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-100">Carpeta SUA</h2>
          <p className="text-sm text-slate-400">
            Documentos SUA y archivos de seguridad social de esta obra.
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="border-slate-700 text-slate-400 hover:bg-slate-700/60 hover:text-slate-200"
            onClick={loadFiles}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refrescar
          </Button>
          <Button
            className="bg-[#0174bd] hover:bg-[#0174bd]/90 text-white"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            {uploading ? "Subiendo..." : "Subir archivo"}
          </Button>
        </div>
      </div>

      {/* Input oculto */}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Zona de arrastre */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 cursor-pointer transition-colors ${
          dragOver
            ? "border-[#0174bd]/60 bg-[#0174bd]/5"
            : "border-slate-700 bg-slate-900/40 hover:border-slate-600 hover:bg-slate-800/60"
        } ${uploading ? "pointer-events-none opacity-60" : ""}`}
      >
        {uploading ? (
          <>
            <Loader2 className="w-8 h-8 text-[#4da8e8] animate-spin" />
            <p className="text-sm text-slate-400 font-medium">Subiendo archivo...</p>
          </>
        ) : (
          <>
            <div className="p-3 rounded-full bg-slate-800 border border-slate-700 shadow-sm">
              <FolderOpen className="w-6 h-6 text-slate-400" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-slate-300">
                Arrastra un archivo aqui o haz clic para seleccionar
              </p>
              <p className="text-xs text-slate-500 mt-1">
                PDF, imagenes, Word, Excel — cualquier formato
              </p>
            </div>
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Buscador y conteo */}
      <div
        className="rounded-xl border border-slate-700/60 p-4 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between"
        style={{ background: "linear-gradient(145deg, #1e293b 0%, #172030 60%, #1a2535 100%)" }}
      >
        <Input
          placeholder="Buscar por nombre de archivo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:w-72 bg-slate-900 border-slate-700 text-slate-200 placeholder:text-slate-500 focus:border-[#0174bd]/60 focus-visible:ring-0 focus-visible:ring-offset-0"
        />
        <p className="text-sm text-slate-400">
          {filtered.length} {filtered.length === 1 ? "archivo" : "archivos"}
        </p>
      </div>

      {/* Tabla de archivos */}
      <div
        className="rounded-xl border border-slate-700/60 overflow-hidden"
        style={{ background: "linear-gradient(145deg, #1e293b 0%, #172030 60%, #1a2535 100%)" }}
      >
        <div className="p-5 pb-4 border-b border-slate-700/60">
          <h3 className="text-base font-semibold text-slate-100">Archivos</h3>
        </div>
        <div className="p-5">
          {loading ? (
            <div className="py-12 flex items-center justify-center gap-2 text-slate-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Cargando archivos...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center">
              <FolderOpen className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-400">
                {search ? "No se encontraron archivos con ese nombre." : "No hay archivos en la Carpeta SUA todavia."}
              </p>
              {!search && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 border-slate-700 text-slate-400 hover:bg-slate-700/60 hover:text-slate-200"
                  onClick={() => inputRef.current?.click()}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Subir el primero
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-md border border-slate-700/60 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700/60 hover:bg-slate-800/40">
                    <TableHead className="w-full min-w-0 text-slate-400">Archivo</TableHead>
                    <TableHead className="w-20 shrink-0 text-slate-400">Tipo</TableHead>
                    <TableHead className="w-20 shrink-0 text-slate-400">Tamaño</TableHead>
                    <TableHead className="w-24 shrink-0 text-slate-400">Fecha</TableHead>
                    <TableHead className="w-24 shrink-0 text-right text-slate-400">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((f) => (
                    <TableRow key={f.id} className="border-slate-700/40 hover:bg-slate-800/40">
                      <TableCell className="max-w-0 w-full">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileIcon mime={f.mime_type} />
                          <span className="font-medium text-slate-200 truncate block min-w-0" title={f.file_name}>
                            {f.file_name}
                          </span>
                        </div>
                      </TableCell>

                      <TableCell>
                        <Badge className={`text-xs ${getMimeBadgeClass(f.mime_type)}`}>
                          {getMimeLabel(f.mime_type, f.file_name)}
                        </Badge>
                      </TableCell>

                      <TableCell className="text-sm text-slate-400">
                        {formatBytes(f.size_bytes)}
                      </TableCell>

                      <TableCell className="text-sm text-slate-400">
                        {formatDate(f.uploaded_at)}
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {isPreviewable(f.mime_type) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-slate-400 hover:bg-slate-700/60 hover:text-slate-200"
                              onClick={() => handleView(f)}
                              title="Visualizar"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-slate-400 hover:bg-slate-700/60 hover:text-slate-200"
                            onClick={() => handleDownload(f)}
                            title="Descargar"
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            onClick={() => handleDelete(f)}
                            disabled={deletingId === f.id}
                            title="Eliminar"
                          >
                            {deletingId === f.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
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
      </div>

      {/* Visor de archivo */}
      <Dialog open={viewOpen} onOpenChange={(v) => { if (!viewingLoading) { setViewOpen(v); if (!v) setViewingUrl(null) } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="truncate pr-8 text-slate-100">{viewingFile?.file_name}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-hidden mt-2 min-h-[400px] flex items-center justify-center bg-slate-900 rounded-md">
            {viewingLoading ? (
              <div className="flex flex-col items-center gap-2 text-slate-500">
                <Loader2 className="w-8 h-8 animate-spin" />
                <p className="text-sm">Generando enlace seguro...</p>
              </div>
            ) : viewingUrl ? (
              viewingFile?.mime_type?.startsWith("image/") ? (
                <img
                  src={viewingUrl}
                  alt={viewingFile?.file_name}
                  className="max-w-full max-h-[65vh] object-contain rounded-md shadow"
                />
              ) : (
                <iframe
                  src={viewingUrl}
                  className="w-full h-[65vh] rounded-md border-0"
                  title={viewingFile?.file_name}
                />
              )
            ) : (
              <p className="text-sm text-slate-500">No se pudo cargar la vista previa.</p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-700 mt-3">
            {viewingFile && (
              <Button
                variant="outline"
                className="border-slate-700 text-slate-400 hover:bg-slate-700/60 hover:text-slate-200"
                onClick={() => handleDownload(viewingFile)}
              >
                <Download className="w-4 h-4 mr-2" />
                Descargar
              </Button>
            )}
            <Button
              variant="outline"
              className="border-slate-700 text-slate-400 hover:bg-slate-700/60 hover:text-slate-200"
              onClick={() => { setViewOpen(false); setViewingUrl(null) }}
            >
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
