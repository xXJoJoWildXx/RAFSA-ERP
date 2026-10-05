"use client"

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
import {
  Check,
  X,
  Clock,
  CalendarCheck,
  CalendarDays,
  Loader2,
  Building2,
  Users,
  Search,
  CheckCheck,
  Plus,
  Minus,
  ChevronRight,
} from "lucide-react"

type ObraOpt = { id: string; name: string; status: string }
type TeamMember = {
  id: string
  full_name: string
  position_title: string | null
  role_on_site: string | null
}
type AttStatus = "present" | "absent" | "half_day" | "justified" | "bajada"
type AttRecord = {
  id: string
  employee_id: string
  date: string
  status: AttStatus
  overtime_hours: number
}

// Orden del ciclo al hacer clic: Asistió → Falta → ½ día → Justificada → (repite)
const CYCLE: ("present" | "absent" | "half_day" | "justified")[] = [
  "present",
  "absent",
  "half_day",
  "justified",
]

const SQ: Record<AttStatus, { label: string; icon: typeof Check; cls: string }> = {
  present: { label: "Asistió", icon: Check, cls: "bg-emerald-500 border-emerald-500 text-white" },
  absent: { label: "Falta", icon: X, cls: "bg-red-500 border-red-500 text-white" },
  half_day: { label: "½ día", icon: Clock, cls: "bg-amber-500 border-amber-500 text-white" },
  justified: { label: "Justif.", icon: CalendarCheck, cls: "bg-blue-500 border-blue-500 text-white" },
  bajada: { label: "Bajada", icon: CalendarDays, cls: "bg-purple-500 border-purple-500 text-white" },
}

const DAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

function fmtLocal(d: Date): string {
  const tz = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - tz).toISOString().split("T")[0]
}
function todayStr(): string {
  return fmtLocal(new Date())
}
function mondayOf(d: Date): Date {
  const x = new Date(d)
  const day = x.getDay() // 0=Dom..6=Sáb
  const diff = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + diff)
  x.setHours(0, 0, 0, 0)
  return x
}

type MondayWeek = { weekStart: string; weekEnd: string; label: string }
function listMondayWeeks(count: number): MondayWeek[] {
  const base = mondayOf(new Date())
  const out: MondayWeek[] = []
  for (let i = 0; i < count; i++) {
    const mon = new Date(base)
    mon.setDate(base.getDate() - i * 7)
    const sun = new Date(mon)
    sun.setDate(mon.getDate() + 6)
    const ws = fmtLocal(mon)
    const we = fmtLocal(sun)
    const dd = (s: string) => {
      const d = new Date(s + "T00:00:00")
      return `${d.getDate()} ${MONTHS[d.getMonth()]}`
    }
    out.push({ weekStart: ws, weekEnd: we, label: `${dd(ws)} – ${dd(we)}` })
  }
  return out
}

type WeekCell = { date: string; dayName: string; dayNum: string; month: string; isSunday: boolean }
function weekCells(weekStart: string): WeekCell[] {
  const start = new Date(weekStart + "T00:00:00Z")
  const cells: WeekCell[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(start)
    d.setUTCDate(start.getUTCDate() + i)
    const date = d.toISOString().split("T")[0]
    const dow = d.getUTCDay()
    cells.push({
      date,
      dayName: DAY_NAMES[dow],
      dayNum: date.slice(8),
      month: MONTHS[d.getUTCMonth()],
      isSunday: dow === 0,
    })
  }
  return cells
}

const STATUS_RANK: Record<string, number> = { in_progress: 0, planned: 1, paused: 2, closed: 3 }

export function AdminAttendance() {
  const weeks = useMemo(() => listMondayWeeks(8), [])
  const [obras, setObras] = useState<ObraOpt[]>([])
  const [obraId, setObraId] = useState<string>("")
  const [week, setWeek] = useState<string>(weeks[0]?.weekStart ?? "")
  const [team, setTeam] = useState<TeamMember[]>([])
  const [selectedEmp, setSelectedEmp] = useState<string | null>(null)
  const [attendance, setAttendance] = useState<AttRecord[]>([])
  const [loadingTeam, setLoadingTeam] = useState(false)
  const [savingCell, setSavingCell] = useState<string | null>(null)
  const [savingAll, setSavingAll] = useState(false)
  const [query, setQuery] = useState("")

  const period = weeks.find((p) => p.weekStart === week)
  const cells = useMemo(() => (week ? weekCells(week) : []), [week])
  const workCells = useMemo(() => cells.filter((c) => !c.isSunday), [cells]) // Lun–Sáb

  // Obras
  useEffect(() => {
    supabase
      .from("obras")
      .select("id, name, status")
      .then(({ data }) => {
        const rows = (data as ObraOpt[]) ?? []
        rows.sort((a, b) => {
          const r = (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9)
          return r !== 0 ? r : a.name.localeCompare(b.name)
        })
        setObras(rows)
      })
  }, [])

  // Equipo de la obra
  useEffect(() => {
    if (!obraId) {
      setTeam([])
      setSelectedEmp(null)
      return
    }
    let cancelled = false
    setLoadingTeam(true)
    ;(async () => {
      const { data: assigns } = await supabase
        .from("obra_assignments")
        .select("employee_id, role_on_site")
        .eq("obra_id", obraId)
        .is("assigned_to", null)
      const ids = Array.from(new Set((assigns ?? []).map((a: any) => a.employee_id).filter(Boolean)))
      if (ids.length === 0) {
        if (!cancelled) { setTeam([]); setSelectedEmp(null); setLoadingTeam(false) }
        return
      }
      const { data: emps } = await supabase
        .from("employees")
        .select("id, full_name, position_title")
        .in("id", ids)
      const roleMap = new Map((assigns ?? []).map((a: any) => [a.employee_id, a.role_on_site]))
      const list: TeamMember[] = (emps ?? []).map((e: any) => ({
        id: e.id,
        full_name: e.full_name,
        position_title: e.position_title,
        role_on_site: roleMap.get(e.id) ?? null,
      }))
      list.sort((a, b) => {
        const ad = a.role_on_site === "director_obra" ? 0 : 1
        const bd = b.role_on_site === "director_obra" ? 0 : 1
        return ad !== bd ? ad - bd : a.full_name.localeCompare(b.full_name)
      })
      if (!cancelled) {
        setTeam(list)
        setSelectedEmp((prev) => (prev && list.some((m) => m.id === prev) ? prev : list[0]?.id ?? null))
        setLoadingTeam(false)
      }
    })()
    return () => { cancelled = true }
  }, [obraId])

  // Asistencia de la semana (toda la obra)
  const fetchAttendance = useCallback(async () => {
    if (!obraId || !period) { setAttendance([]); return }
    const { data } = await supabase
      .from("obra_attendance")
      .select("id, employee_id, date, status, overtime_hours")
      .eq("obra_id", obraId)
      .gte("date", period.weekStart)
      .lte("date", period.weekEnd)
    setAttendance((data as AttRecord[]) ?? [])
  }, [obraId, period])

  useEffect(() => { fetchAttendance() }, [fetchAttendance])

  const recOf = (empId: string, date: string) =>
    attendance.find((a) => a.employee_id === empId && a.date === date)

  async function setStatus(empId: string, date: string, status: AttStatus) {
    if (!obraId) return
    const key = `${empId}-${date}`
    setSavingCell(key)
    try {
      const { data: auth } = await supabase.auth.getUser()
      const existing = recOf(empId, date)
      if (existing) {
        const { data } = await supabase
          .from("obra_attendance")
          .update({ status, updated_at: new Date().toISOString() })
          .eq("id", existing.id)
          .select("id, employee_id, date, status, overtime_hours")
          .single()
        if (data) setAttendance((p) => p.map((a) => (a.id === existing.id ? (data as AttRecord) : a)))
      } else {
        const { data } = await supabase
          .from("obra_attendance")
          .insert({ obra_id: obraId, employee_id: empId, date, status, recorded_by: auth?.user?.id ?? null })
          .select("id, employee_id, date, status, overtime_hours")
          .single()
        if (data) setAttendance((p) => [...p, data as AttRecord])
      }
    } finally {
      setSavingCell(null)
    }
  }

  // Un clic cicla el estado del día
  function cycleStatus(empId: string, date: string) {
    const ex = recOf(empId, date)
    let next: AttStatus
    if (!ex) next = "present"
    else {
      const idx = CYCLE.indexOf(ex.status as any)
      next = idx === -1 ? "present" : CYCLE[(idx + 1) % CYCLE.length]
    }
    setStatus(empId, date, next)
  }

  async function setOvertime(empId: string, date: string, hours: number) {
    if (!obraId) return
    const clamped = Math.max(0, Math.min(24, Math.round(hours)))
    const { data: auth } = await supabase.auth.getUser()
    const existing = recOf(empId, date)
    if (existing) {
      const { data } = await supabase
        .from("obra_attendance")
        .update({ overtime_hours: clamped, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .select("id, employee_id, date, status, overtime_hours")
        .single()
      if (data) setAttendance((p) => p.map((a) => (a.id === existing.id ? (data as AttRecord) : a)))
    } else {
      const { data } = await supabase
        .from("obra_attendance")
        .insert({ obra_id: obraId, employee_id: empId, date, status: "present", overtime_hours: clamped, recorded_by: auth?.user?.id ?? null })
        .select("id, employee_id, date, status, overtime_hours")
        .single()
      if (data) setAttendance((p) => [...p, data as AttRecord])
    }
  }

  // Marcar a TODOS los de la obra, en TODA la semana (Lun–Sáb) como "Asistió"
  async function markAllWeekPresent() {
    if (!obraId || team.length === 0) return
    setSavingAll(true)
    try {
      const { data: auth } = await supabase.auth.getUser()
      const uid = auth?.user?.id ?? null
      const toInsert: any[] = []
      const toUpdate: string[] = []
      for (const m of team) {
        for (const c of workCells) {
          const ex = recOf(m.id, c.date)
          if (!ex) toInsert.push({ obra_id: obraId, employee_id: m.id, date: c.date, status: "present", recorded_by: uid })
          else if (ex.status !== "present" && ex.status !== "bajada") toUpdate.push(ex.id)
        }
      }
      if (toInsert.length) await supabase.from("obra_attendance").insert(toInsert)
      for (let i = 0; i < toUpdate.length; i += 25) {
        const chunk = toUpdate.slice(i, i + 25)
        await Promise.all(
          chunk.map((idv) =>
            supabase.from("obra_attendance").update({ status: "present", updated_at: new Date().toISOString() }).eq("id", idv),
          ),
        )
      }
      await fetchAttendance()
    } finally {
      setSavingAll(false)
    }
  }

  const filteredTeam = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return team
    return team.filter((m) => m.full_name.toLowerCase().includes(q))
  }, [team, query])

  function weekSummary(empId: string) {
    const c = { present: 0, absent: 0, half_day: 0, justified: 0, bajada: 0, sin: 0 }
    for (const cell of workCells) {
      const r = recOf(empId, cell.date)
      if (!r) c.sin++
      else c[r.status] = (c[r.status] ?? 0) + 1
    }
    return c
  }

  const selectedMember = team.find((m) => m.id === selectedEmp) ?? null
  const inputCls =
    "bg-slate-900 border-slate-700 text-slate-200 placeholder:text-slate-600 focus:border-[#0174bd]/60"

  return (
    <div className="space-y-5">
      {/* Controles */}
      <div className="rounded-2xl border border-slate-700/60 bg-slate-800 p-5">
        <div className="flex flex-col lg:flex-row lg:items-end gap-4">
          <div className="flex flex-col gap-1.5 flex-1">
            <label className="text-xs font-medium text-slate-400">Obra</label>
            <Select value={obraId} onValueChange={setObraId}>
              <SelectTrigger className={`w-full lg:w-80 cursor-pointer ${inputCls}`}>
                <SelectValue placeholder="Selecciona una obra" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700 text-slate-200 max-h-80">
                {obras.map((o) => (
                  <SelectItem key={o.id} value={o.id} className="focus:bg-slate-700 focus:text-slate-100">
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-400">Semana (Lun – Dom)</label>
            <Select value={week} onValueChange={setWeek}>
              <SelectTrigger className={`w-full lg:w-64 cursor-pointer ${inputCls}`}>
                <SelectValue placeholder="Selecciona la semana" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                {weeks.map((p) => (
                  <SelectItem key={p.weekStart} value={p.weekStart} className="focus:bg-slate-700 focus:text-slate-100">
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {obraId && team.length > 0 && (
            <Button onClick={markAllWeekPresent} disabled={savingAll}
              className="cursor-pointer bg-emerald-600 hover:bg-emerald-500 text-white font-semibold disabled:opacity-40">
              {savingAll ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCheck className="w-4 h-4 mr-2" />}
              Marcar toda la semana: Asistió
            </Button>
          )}
        </div>
      </div>

      {/* Sin obra */}
      {!obraId && (
        <div className="rounded-2xl border border-slate-700/60 bg-slate-800 py-16 flex flex-col items-center gap-2 text-slate-500">
          <Building2 className="w-10 h-10 text-slate-700" />
          <p className="text-sm font-medium text-slate-400">Selecciona una obra para tomar asistencia</p>
          <p className="text-xs text-slate-600">Puedes registrar la asistencia de cualquier trabajador de cualquier obra.</p>
        </div>
      )}

      {/* Zona de trabajo: 2 columnas */}
      {obraId && (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(260px,340px)_1fr] gap-5">
          {/* Izquierda: trabajadores */}
          <div className="rounded-2xl border border-slate-700/60 bg-slate-800 overflow-hidden self-start">
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-700/60 bg-slate-900/40">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[#4da8e8]" />
                <span className="font-semibold text-slate-100 text-sm">Trabajadores</span>
                <span className="text-xs text-slate-500">({team.length})</span>
              </div>
            </div>
            <div className="p-2 border-b border-slate-700/60">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar trabajador..."
                  className={`pl-8 h-8 ${inputCls}`} />
              </div>
            </div>

            {loadingTeam ? (
              <div className="py-14 flex justify-center text-slate-500"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : team.length === 0 ? (
              <div className="py-14 flex flex-col items-center gap-2 text-slate-500 px-4 text-center">
                <Users className="w-9 h-9 text-slate-700" />
                <p className="text-sm font-medium text-slate-400">Sin trabajadores asignados</p>
              </div>
            ) : (
              <div className="max-h-[70vh] overflow-y-auto divide-y divide-slate-700/40">
                {filteredTeam.map((m) => {
                  const s = weekSummary(m.id)
                  const active = selectedEmp === m.id
                  return (
                    <button
                      key={m.id}
                      onClick={() => setSelectedEmp(m.id)}
                      className={`w-full text-left px-4 py-2.5 flex items-center gap-2 cursor-pointer transition-colors ${
                        active ? "bg-[#0174bd]/15" : "hover:bg-slate-700/30"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-sm font-medium truncate ${active ? "text-white" : "text-slate-200"}`}>{m.full_name}</span>
                          {m.role_on_site === "director_obra" && (
                            <span className="text-[9px] font-semibold text-[#4da8e8] bg-[#0174bd]/15 px-1 py-0.5 rounded-full shrink-0">Dir</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          {s.present > 0 && <Mini dot="bg-emerald-400">{s.present}</Mini>}
                          {s.absent > 0 && <Mini dot="bg-red-400">{s.absent}</Mini>}
                          {s.half_day > 0 && <Mini dot="bg-amber-400">{s.half_day}</Mini>}
                          {s.justified > 0 && <Mini dot="bg-blue-400">{s.justified}</Mini>}
                          {s.sin > 0 && <span className="text-[10px] text-slate-500">· {s.sin} sin marcar</span>}
                        </div>
                      </div>
                      {active && <ChevronRight className="w-4 h-4 text-[#4da8e8] shrink-0" />}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Derecha: calendario del trabajador seleccionado */}
          <div className="rounded-2xl border border-slate-700/60 bg-slate-800 overflow-hidden self-start">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-700/60 bg-slate-900/40">
              <CalendarDays className="w-4 h-4 text-[#4da8e8]" />
              <span className="font-semibold text-slate-100">
                {selectedMember ? selectedMember.full_name : "Selecciona un trabajador"}
              </span>
              {period && <span className="text-xs text-slate-500 ml-auto">{period.label}</span>}
            </div>

            {!selectedMember ? (
              <div className="py-16 flex flex-col items-center gap-2 text-slate-500">
                <Users className="w-10 h-10 text-slate-700" />
                <p className="text-sm text-slate-400">Elige un trabajador de la lista para ver y marcar su semana.</p>
              </div>
            ) : (
              <div className="p-4">
                <p className="text-xs text-slate-500 mb-3">
                  Haz clic en cada cuadro para cambiar el estado: <span className="text-emerald-400 font-medium">Asistió</span> →{" "}
                  <span className="text-red-400 font-medium">Falta</span> →{" "}
                  <span className="text-amber-400 font-medium">½ día</span> →{" "}
                  <span className="text-blue-400 font-medium">Justificada</span>.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
                  {cells.map((c) => {
                    const rec = recOf(selectedMember.id, c.date)
                    const ot = rec?.overtime_hours ?? 0
                    const key = `${selectedMember.id}-${c.date}`
                    const busy = savingCell === key
                    const isToday = c.date === todayStr()
                    const cfg = rec ? SQ[rec.status] : null
                    const Icon = cfg?.icon

                    return (
                      <div key={c.date}
                        className={`rounded-xl border overflow-hidden ${
                          isToday ? "border-[#0174bd]/50" : "border-slate-700/50"
                        }`}>
                        {/* Cabecera día */}
                        <div className={`px-2 py-1.5 text-center ${isToday ? "bg-[#0174bd]/15" : "bg-slate-900/40"}`}>
                          <p className="text-[11px] font-semibold text-slate-300">
                            {c.dayName}{isToday && <span className="text-[#4da8e8]"> · hoy</span>}
                          </p>
                          <p className="text-[10px] text-slate-500">{c.dayNum} {c.month}</p>
                        </div>

                        {/* Cuadrito clickeable */}
                        {c.isSunday ? (
                          <div className="h-20 flex items-center justify-center bg-slate-900/20 text-[11px] text-slate-600">
                            Descanso
                          </div>
                        ) : (
                          <button
                            onClick={() => cycleStatus(selectedMember.id, c.date)}
                            disabled={busy}
                            title="Clic para cambiar estado"
                            className={`w-full h-20 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-default ${
                              cfg ? cfg.cls : "bg-slate-900/30 text-slate-500 border-t border-dashed border-slate-700 hover:bg-slate-700/30"
                            }`}
                          >
                            {busy ? (
                              <Loader2 className="w-5 h-5 animate-spin" />
                            ) : cfg && Icon ? (
                              <>
                                <Icon className="w-5 h-5" />
                                <span className="text-xs font-semibold">{cfg.label}</span>
                              </>
                            ) : (
                              <>
                                <Plus className="w-4 h-4" />
                                <span className="text-xs font-medium">Marcar</span>
                              </>
                            )}
                          </button>
                        )}

                        {/* Horas extra */}
                        {!c.isSunday && (
                          <div className="flex items-center justify-center gap-1.5 px-2 py-1.5 bg-slate-900/40 border-t border-slate-700/50">
                            <button onClick={() => setOvertime(selectedMember.id, c.date, ot - 1)} disabled={busy || ot <= 0}
                              className="w-7 h-7 rounded-md border border-slate-600 text-slate-300 hover:bg-slate-700/60 flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-default">
                              <Minus className="w-4 h-4" />
                            </button>
                            <input
                              key={`${selectedMember.id}-${c.date}-${ot}`}
                              type="number"
                              min={0}
                              max={24}
                              defaultValue={ot}
                              disabled={busy}
                              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }}
                              onBlur={(e) => {
                                const v = parseInt(e.target.value, 10)
                                if (!Number.isNaN(v) && v !== ot) setOvertime(selectedMember.id, c.date, v)
                                else if (e.target.value === "" && ot !== 0) setOvertime(selectedMember.id, c.date, 0)
                              }}
                              className={`w-11 h-7 text-center text-base font-bold tabular-nums rounded-md bg-slate-900 border border-slate-600 focus:border-[#0174bd] outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${ot > 0 ? "text-orange-400" : "text-slate-400"}`}
                            />
                            <span className="text-xs text-slate-500">h</span>
                            <button onClick={() => setOvertime(selectedMember.id, c.date, ot + 1)} disabled={busy}
                              className="w-7 h-7 rounded-md border border-slate-600 text-slate-300 hover:bg-slate-700/60 flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-default">
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Mini({ children, dot }: { children: React.ReactNode; dot: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {children}
    </span>
  )
}
