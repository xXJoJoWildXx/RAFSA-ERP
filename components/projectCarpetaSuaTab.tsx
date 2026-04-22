"use client"

import { useEffect, useRef, useState, type DragEvent } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  if (!mime) return "bg-slate-100 text-slate-600"
  if (mime.startsWith("image/")) return "bg-purple-100 text-purple-700"
  if (mime === "application/pdf") return "bg-red-100 text-red-700"
  if (mime.includes("word")) return "bg-blue-100 text-blue-700"
  if (mime.includes("excel") || mime.includes("spreadsheet")) return "bg-green-100 text-green-700"
  return "bg-slate-100 text-slate-600"
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
}

export function ProjectCarpetaSuaTab({ obraId }: Props) {
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
      .createSignedUrl(file.file_url, 300)

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Carpeta SUA</h2>
          <p className="text-sm text-slate-600">
            Documentos SUA y archivos de seguridad social de esta obra.
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={loadFiles} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refrescar
          </Button>
          <Button onClick={() => inputRef.current?.click()} disabled={uploading}>
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
            ? "border-blue-400 bg-blue-50"
            : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100"
        } ${uploading ? "pointer-events-none opacity-60" : ""}`}
      >
        {uploading ? (
          <>
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            <p className="text-sm text-slate-600 font-medium">Subiendo archivo...</p>
          </>
        ) : (
          <>
            <div className="p-3 rounded-full bg-white border border-slate-200 shadow-sm">
              <FolderOpen className="w-6 h-6 text-slate-400" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-slate-700">
                Arrastra un archivo aqui o haz clic para seleccionar
              </p>
              <p className="text-xs text-slate-400 mt-1">
                PDF, imagenes, Word, Excel — cualquier formato
              </p>
            </div>
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Buscador y conteo */}
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <Input
            placeholder="Buscar por nombre de archivo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:w-72"
          />
          <p className="text-sm text-slate-500">
            {filtered.length} {filtered.length === 1 ? "archivo" : "archivos"}
          </p>
        </CardContent>
      </Card>

      {/* Tabla de archivos */}
      <Card>
        <CardHeader>
          <CardTitle>Archivos</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 flex items-center justify-center gap-2 text-slate-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Cargando archivos...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center">
              <FolderOpen className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500">
                {search ? "No se encontraron archivos con ese nombre." : "No hay archivos en la Carpeta SUA todavia."}
              </p>
              {!search && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => inputRef.current?.click()}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Subir el primero
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Archivo</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Tamano</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-0">
                          <FileIcon mime={f.mime_type} />
                          <span className="font-medium text-slate-800 truncate max-w-xs">
                            {f.file_name}
                          </span>
                        </div>
                      </TableCell>

                      <TableCell>
                        <Badge className={`text-xs ${getMimeBadgeClass(f.mime_type)}`}>
                          {getMimeLabel(f.mime_type, f.file_name)}
                        </Badge>
                      </TableCell>

                      <TableCell className="text-sm text-slate-500">
                        {formatBytes(f.size_bytes)}
                      </TableCell>

                      <TableCell className="text-sm text-slate-500">
                        {formatDate(f.uploaded_at)}
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {isPreviewable(f.mime_type) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleView(f)}
                              title="Visualizar"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDownload(f)}
                            title="Descargar"
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
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
        </CardContent>
      </Card>

      {/* Visor de archivo */}
      <Dialog open={viewOpen} onOpenChange={(v) => { if (!viewingLoading) { setViewOpen(v); if (!v) setViewingUrl(null) } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="truncate pr-8">{viewingFile?.file_name}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-hidden mt-2 min-h-[400px] flex items-center justify-center">
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
                  className="w-full h-[65vh] rounded-md border"
                  title={viewingFile?.file_name}
                />
              )
            ) : (
              <p className="text-sm text-slate-500">No se pudo cargar la vista previa.</p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t mt-3">
            {viewingFile && (
              <Button variant="outline" onClick={() => handleDownload(viewingFile)}>
                <Download className="w-4 h-4 mr-2" />
                Descargar
              </Button>
            )}
            <Button variant="outline" onClick={() => { setViewOpen(false); setViewingUrl(null) }}>
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
