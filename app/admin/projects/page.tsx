"use client"

import { useState, useEffect, FormEvent } from "react"
import Link from "next/link"
import { AdminLayout } from "@/components/admin-layout"
import { RoleGuard } from "@/lib/role-guard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Building2, Plus, ChevronRight, Loader2, FolderOpen, Pencil, Trash2, X, AlertTriangle, ChevronDown } from "lucide-react"
import { supabase } from "@/lib/supabaseClient"

type Empresa = {
  id: string
  name: string
  created_at: string
  obra_count: number
}

export default function EmpresasPage() {
  const [empresas, setEmpresas]   = useState<Empresa[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)

  const [editMode, setEditMode]   = useState(false)
  const [selected, setSelected]   = useState<Set<string>>(new Set())
  const [deleting, setDeleting]   = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [nombre, setNombre]         = useState("")
  const [saving, setSaving]         = useState(false)
  const [saveError, setSaveError]   = useState<string | null>(null)

  const [editOpen, setEditOpen]             = useState(false)
  const [editingEmpresa, setEditingEmpresa] = useState<Empresa | null>(null)
  const [editNombre, setEditNombre]         = useState("")
  const [editSaving, setEditSaving]         = useState(false)
  const [editError, setEditError]           = useState<string | null>(null)

  const [deleteDialogOpen, setDeleteDialogOpen]   = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState("")
  const [deleteObrasMap, setDeleteObrasMap]       = useState<Record<string, { id: string; name: string }[]>>({})
  const [expandedEmpresas, setExpandedEmpresas]   = useState<Set<string>>(new Set())
  const [loadingDeleteInfo, setLoadingDeleteInfo] = useState(false)

  async function fetchEmpresas() {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from("empresas")
      .select("id, name, created_at")
      .order("name", { ascending: true })

    if (error) { setError(error.message); setLoading(false); return }

    const rows = (data || []) as { id: string; name: string; created_at: string }[]
    if (rows.length === 0) { setEmpresas([]); setLoading(false); return }

    const { data: obraData } = await supabase
      .from("obras").select("empresa_id").in("empresa_id", rows.map((r) => r.id))

    const countMap: Record<string, number> = {}
    ;(obraData || []).forEach((o: { empresa_id: string }) => {
      countMap[o.empresa_id] = (countMap[o.empresa_id] || 0) + 1
    })

    setEmpresas(rows.map((r) => ({ ...r, obra_count: countMap[r.id] ?? 0 })))
    setLoading(false)
  }

  useEffect(() => { fetchEmpresas() }, [])

  function openCreate() { setNombre(""); setSaveError(null); setCreateOpen(true) }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) return
    setSaving(true); setSaveError(null)
    const { error } = await supabase.from("empresas").insert({ name: nombre.trim() })
    if (error) { setSaveError("No se pudo crear la empresa. Intenta de nuevo."); setSaving(false); return }
    setCreateOpen(false); setSaving(false); await fetchEmpresas()
  }

  function enterEditMode() { setSelected(new Set()); setEditMode(true) }
  function exitEditMode()  { setEditMode(false); setSelected(new Set()) }

  function toggleSelect(id: string) {
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }

  async function openDeleteDialog() {
    if (selected.size === 0) return
    setDeleteConfirmText(""); setLoadingDeleteInfo(true); setDeleteDialogOpen(true)

    const { data } = await supabase.from("obras").select("id, name, empresa_id").in("empresa_id", Array.from(selected))
    const map: Record<string, { id: string; name: string }[]> = {}
    Array.from(selected).forEach((id) => { map[id] = [] })
    ;(data || []).forEach((o: { id: string; name: string; empresa_id: string }) => {
      map[o.empresa_id] = [...(map[o.empresa_id] || []), { id: o.id, name: o.name }]
    })
    setDeleteObrasMap(map)
    setExpandedEmpresas(new Set(Object.entries(map).filter(([, obras]) => obras.length > 0).map(([id]) => id)))
    setLoadingDeleteInfo(false)
  }

  async function handleDelete() {
    if (deleteConfirmText !== "ELIMINAR") return
    setDeleting(true)
    const ids = Array.from(selected)
    const { error: obrasErr } = await supabase.from("obras").delete().in("empresa_id", ids)
    if (obrasErr) { alert("No se pudieron eliminar las obras asociadas."); setDeleting(false); return }
    const { error: empErr } = await supabase.from("empresas").delete().in("id", ids)
    if (empErr)  { alert("No se pudieron eliminar las empresas."); setDeleting(false); return }
    setDeleting(false); setDeleteDialogOpen(false); exitEditMode(); await fetchEmpresas()
  }

  function toggleExpanded(id: string) {
    setExpandedEmpresas((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }

  function openEdit(empresa: Empresa, e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation()
    setEditingEmpresa(empresa); setEditNombre(empresa.name); setEditError(null); setEditOpen(true)
  }

  async function handleEditSave(e: FormEvent) {
    e.preventDefault()
    if (!editNombre.trim() || !editingEmpresa) return
    setEditSaving(true); setEditError(null)
    const { error } = await supabase.from("empresas").update({ name: editNombre.trim() }).eq("id", editingEmpresa.id)
    if (error) { setEditError("No se pudo actualizar el nombre."); setEditSaving(false); return }
    setEditOpen(false); setEditSaving(false); await fetchEmpresas()
  }

  // ── Clases reutilizables ──
  const inputCls   = "bg-slate-900 border-slate-700 text-slate-200 placeholder:text-slate-600 focus:border-[#0174bd]/60 focus:ring-0"
  const btnOutline = "border-slate-700 text-slate-400 hover:bg-slate-700/60 hover:text-slate-200 hover:border-slate-600"

  return (
    <RoleGuard allowed={["admin"]}>
      <AdminLayout>
        <div className="space-y-6">

          {/* ── Header ── */}
          <div
            className="rounded-2xl border border-slate-700/60 p-6"
            style={{
              background: "linear-gradient(135deg, #1e293b 0%, #0f1e2e 50%, #162438 100%)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 20px rgba(0,0,0,0.3)",
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-slate-100">Empresas</h1>
                <p className="text-slate-400 text-sm mt-1">
                  {editMode
                    ? "Selecciona las empresas que deseas eliminar o edita su información"
                    : "Selecciona una empresa para ver y gestionar sus obras"}
                </p>
              </div>

              {!editMode ? (
                <div className="flex gap-2">
                  <Button variant="outline" onClick={enterEditMode} className={`font-semibold ${btnOutline}`}>
                    <Pencil className="w-4 h-4 mr-2" />Editar
                  </Button>
                  <Button onClick={openCreate} className="font-semibold bg-[#0174bd] hover:bg-[#0174bd]/90 text-white">
                    <Plus className="w-4 h-4 mr-2" />Nueva empresa
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button variant="outline" onClick={exitEditMode} disabled={deleting} className={btnOutline}>
                    <X className="w-4 h-4 mr-2" />Cancelar
                  </Button>
                  <Button variant="destructive" onClick={openDeleteDialog} disabled={selected.size === 0 || deleting}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    {`Eliminar${selected.size > 0 ? ` (${selected.size})` : ""}`}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* ── Loading / Error / Empty ── */}
          {loading && (
            <div className="py-20 flex flex-col items-center gap-3 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin text-[#0174bd]" />
              <span className="text-sm">Cargando empresas...</span>
            </div>
          )}
          {!loading && error && (
            <div className="py-10 text-center text-red-400 text-sm">Error al cargar: {error}</div>
          )}
          {!loading && !error && empresas.length === 0 && (
            <div className="py-20 flex flex-col items-center gap-3">
              <Building2 className="w-12 h-12 text-slate-700" />
              <p className="text-sm font-medium text-slate-400">No hay empresas registradas</p>
              <p className="text-xs text-slate-600">Crea la primera empresa para comenzar</p>
              <Button onClick={openCreate} size="sm" className="mt-2 bg-[#0174bd] hover:bg-[#0174bd]/90 text-white">
                <Plus className="w-4 h-4 mr-1" />Nueva empresa
              </Button>
            </div>
          )}

          {/* ── Grid ── */}
          {!loading && !error && empresas.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {empresas.map((empresa) => {
                const isSelected = selected.has(empresa.id)

                const card = (
                  <div
                    className={`group relative rounded-2xl border-2 p-6 flex flex-col gap-4 transition-all duration-200 overflow-hidden
                      ${editMode
                        ? isSelected
                          ? "border-red-500/70 shadow-lg shadow-red-950/40 -translate-y-0.5"
                          : "border-slate-700/60 hover:border-slate-600 cursor-pointer"
                        : "border-slate-700/60 hover:border-[#0174bd]/40 hover:shadow-xl hover:shadow-black/40 hover:-translate-y-1 cursor-pointer"
                      }`}
                    style={{
                      background: isSelected
                        ? "linear-gradient(135deg, #2d1515 0%, #1e0e0e 100%)"
                        : "linear-gradient(145deg, #1e293b 0%, #172030 60%, #1a2535 100%)",
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                    }}
                    onClick={editMode ? () => toggleSelect(empresa.id) : undefined}
                  >
                    {/* Acento top — solo en hover normal */}
                    {!editMode && (
                      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[#0174bd] to-[#4da8e8] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    )}

                    {/* Checkbox edición */}
                    {editMode && (
                      <div className="absolute top-4 right-4">
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all
                          ${isSelected ? "bg-red-500 border-red-500" : "bg-slate-700 border-slate-600"}`}>
                          {isSelected && (
                            <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex items-start justify-between gap-3">
                      <div className={`p-3 rounded-xl transition-colors duration-300
                        ${editMode ? "bg-slate-700/50" : "bg-slate-700/50 group-hover:bg-[#0174bd]/15"}`}>
                        <Building2 className={`w-6 h-6 transition-colors duration-300
                          ${editMode ? "text-slate-400" : "text-slate-400 group-hover:text-[#4da8e8]"}`} />
                      </div>
                      <span className={`text-xs font-semibold bg-slate-700/60 text-slate-400 px-2.5 py-1 rounded-full ${editMode ? "mr-7" : ""}`}>
                        {empresa.obra_count} {empresa.obra_count === 1 ? "obra" : "obras"}
                      </span>
                    </div>

                    <div>
                      <h3 className="font-bold text-slate-100 text-lg leading-tight group-hover:text-white transition-colors duration-200">
                        {empresa.name}
                      </h3>
                      <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                        <FolderOpen className="w-3 h-3" />
                        Registrada el{" "}
                        {new Date(empresa.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
                      </p>
                    </div>

                    {editMode && (
                      <button
                        onClick={(e) => openEdit(empresa, e)}
                        className="mt-1 flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-slate-100 bg-slate-700/50 hover:bg-slate-700 rounded-lg px-3 py-2 transition-colors w-fit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Editar información
                      </button>
                    )}

                    {!editMode && (
                      <div className="absolute bottom-5 right-5 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-1 group-hover:translate-x-0">
                        <ChevronRight className="w-5 h-5 text-[#4da8e8]" />
                      </div>
                    )}
                  </div>
                )

                return editMode
                  ? <div key={empresa.id}>{card}</div>
                  : <Link key={empresa.id} href={`/admin/projects/${empresa.id}`} className="block">{card}</Link>
              })}
            </div>
          )}

          {/* ── Dialog nueva empresa ── */}
          <Dialog open={createOpen} onOpenChange={(v) => saving ? null : setCreateOpen(v)}>
            <DialogContent className="max-w-sm bg-slate-800 border-slate-700 text-slate-100">
              <DialogHeader>
                <DialogTitle className="text-slate-100">Nueva empresa</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 mt-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-400">Nombre de la empresa *</label>
                  <Input value={nombre} onChange={(e) => setNombre(e.target.value)}
                    placeholder="Ej. Constructora Regio S.A." autoFocus required className={inputCls} />
                </div>
                {saveError && <p className="text-xs text-red-400">{saveError}</p>}
                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={saving} className={btnOutline}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={saving || !nombre.trim()} className="bg-[#0174bd] hover:bg-[#0174bd]/90 text-white">
                    {saving ? "Guardando..." : "Crear empresa"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          {/* ── Dialog eliminar ── */}
          <Dialog open={deleteDialogOpen} onOpenChange={(v) => deleting ? null : setDeleteDialogOpen(v)}>
            <DialogContent className="max-w-md bg-slate-800 border-slate-700 text-slate-100">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-red-400">
                  <AlertTriangle className="w-5 h-5" />Confirmar eliminación
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-1">
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-300">
                  Esta acción es <strong>irreversible</strong>. Se eliminarán las empresas y todas sus obras asociadas.
                </div>

                {loadingDeleteInfo ? (
                  <div className="flex items-center gap-2 text-slate-400 text-sm py-2">
                    <Loader2 className="w-4 h-4 animate-spin" />Cargando información...
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {Array.from(selected).map((id) => {
                      const empresa = empresas.find((e) => e.id === id)
                      const obras   = deleteObrasMap[id] || []
                      const isOpen  = expandedEmpresas.has(id)
                      return (
                        <div key={id} className="rounded-lg border border-slate-700 overflow-hidden">
                          <button type="button" onClick={() => toggleExpanded(id)}
                            className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-700/40 hover:bg-slate-700/70 transition-colors text-left">
                            <div className="flex items-center gap-2">
                              <Building2 className="w-4 h-4 text-red-400 shrink-0" />
                              <span className="text-sm font-semibold text-slate-100">{empresa?.name}</span>
                              <span className="text-xs text-slate-500">({obras.length} {obras.length === 1 ? "obra" : "obras"})</span>
                            </div>
                            <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                          </button>
                          {isOpen && (
                            <div className="px-3 py-2 border-t border-slate-700 space-y-1">
                              {obras.length === 0
                                ? <p className="text-xs text-slate-600 italic py-1">Sin obras registradas</p>
                                : obras.map((obra) => (
                                  <div key={obra.id} className="flex items-center gap-2 text-xs text-slate-400 py-0.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                                    {obra.name}
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400">
                    Escribe <strong className="text-red-400">ELIMINAR</strong> para confirmar
                  </label>
                  <Input value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="ELIMINAR" className={`font-mono ${inputCls}`}
                    onKeyDown={(e) => e.key === "Enter" && deleteConfirmText === "ELIMINAR" && handleDelete()} />
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleting} className={btnOutline}>
                    Cancelar
                  </Button>
                  <Button variant="destructive" onClick={handleDelete} disabled={deleteConfirmText !== "ELIMINAR" || deleting}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    {deleting ? "Eliminando..." : "Confirmar eliminación"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* ── Dialog editar ── */}
          <Dialog open={editOpen} onOpenChange={(v) => editSaving ? null : setEditOpen(v)}>
            <DialogContent className="max-w-sm bg-slate-800 border-slate-700 text-slate-100">
              <DialogHeader>
                <DialogTitle className="text-slate-100">Editar empresa</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleEditSave} className="space-y-4 mt-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-400">Nombre de la empresa *</label>
                  <Input value={editNombre} onChange={(e) => setEditNombre(e.target.value)} autoFocus required className={inputCls} />
                </div>
                {editError && <p className="text-xs text-red-400">{editError}</p>}
                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={editSaving} className={btnOutline}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={editSaving || !editNombre.trim()} className="bg-[#0174bd] hover:bg-[#0174bd]/90 text-white">
                    {editSaving ? "Guardando..." : "Guardar cambios"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

        </div>
      </AdminLayout>
    </RoleGuard>
  )
}
