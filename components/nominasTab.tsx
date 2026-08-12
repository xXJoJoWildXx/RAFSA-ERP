"use client"

import React, { useCallback, useEffect, useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  FileText,
  Download,
  Loader2,
  CalendarDays,
  DollarSign,
  Users,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from "lucide-react"
import jsPDF from "jspdf"

// ───── Types ─────

type NominaRow = {
  id: string
  obra_id: string
  week_start: string
  week_end: string
  name: string
  total_salarios: number
  total_bonificaciones: number
  total_viaticos: number
  total_overtime: number
  total_general: number
  employee_count: number
  pdf_object_path: string | null
  created_at: string
}

type NominaDetail = {
  id: string
  nomina_id: string
  employee_id: string
  full_name: string
  role_on_site: string | null
  days_worked: number
  days_absent: number
  days_bajada: number
  real_salary: number
  salary_paid: number
  bonus_amount: number
  viatics_amount: number
  overtime_hours: number
  overtime_rate: number
  overtime_pay: number
  total_paid: number
}

type TeamMemberForNomina = {
  assignment_id: string
  employee_id: string
  full_name: string
  role_on_site: string | null
  real_salary: number
  bonus_amount: number
  viatics_amount: number
  overtime_hour_cost: number
}

type AttendanceRecord = {
  employee_id: string
  date: string
  status: string
  overtime_hours: number
}

type MissingAttendance = {
  employee_name: string
  date: string
  date_display: string
}

// ───── Helpers ─────

/** Get Thursday of a given period offset (0 = current period, -1 = last, etc.) */
function getThursdayOfPeriod(offset: number = 0): Date {
  const now = new Date()
  const day = now.getDay() // 0=Sun..6=Sat
  // Thursday = 4. Calculate diff to most recent Thursday (or today if Thu)
  let diff = day - 4
  if (diff < 0) diff += 7 // if before Thu this week, go back to last Thu
  const thursday = new Date(now)
  thursday.setDate(now.getDate() - diff + offset * 7)
  thursday.setHours(0, 0, 0, 0)
  return thursday
}

function getWednesdayFromThursday(thursday: Date): Date {
  const wed = new Date(thursday)
  wed.setDate(thursday.getDate() + 6)
  return wed
}

/** Get the 6 work days (Thu-Sat + Mon-Wed), skipping Sunday */
function getWorkDates(thursday: Date): string[] {
  const dates: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(thursday)
    d.setDate(thursday.getDate() + i)
    if (d.getDay() !== 0) { // skip Sunday
      dates.push(fmtDate(d))
    }
  }
  return dates // 6 dates
}

/** Get all 7 calendar days Thu-Wed (including Sunday) for calendar display */
function getAllPeriodDates(thursday: Date): string[] {
  const dates: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(thursday)
    d.setDate(thursday.getDate() + i)
    dates.push(fmtDate(d))
  }
  return dates
}

function fmtDate(d: Date): string {
  return d.toISOString().split("T")[0]
}

function fmtDateDisplay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00")
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })
}

function fmtDateShort(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00")
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short" })
}

function getDayName(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00")
  const names = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]
  return names[d.getDay()]
}

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n)
}

function nominaName(weekStart: string): string {
  return `Nomina${weekStart.replace(/-/g, "")}`
}

// ───── Component ─────

export function NominasTab({ obraId }: { obraId: string }) {
  const [nominas, setNominas] = useState<NominaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [details, setDetails] = useState<Record<string, NominaDetail[]>>({})
  const [loadingDetails, setLoadingDetails] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [obraName, setObraName] = useState("")
  const [validationAlert, setValidationAlert] = useState<{ missing: MissingAttendance[]; directorName: string } | null>(null)

  // ── Fetch history ──
  const fetchNominas = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from("obra_nominas")
      .select("*")
      .eq("obra_id", obraId)
      .order("week_start", { ascending: false })
    setNominas((data as NominaRow[]) ?? [])
    setLoading(false)
  }, [obraId])

  useEffect(() => {
    fetchNominas()
    supabase.from("obras").select("name").eq("id", obraId).single().then(({ data }: { data: any }) => {
      if (data) setObraName((data as { name: string }).name)
    })
  }, [obraId, fetchNominas])

  // ── Fetch details for expanded row ──
  async function fetchDetails(nominaId: string) {
    if (details[nominaId]) return
    setLoadingDetails(nominaId)
    const { data } = await supabase
      .from("obra_nomina_details")
      .select("*")
      .eq("nomina_id", nominaId)
      .order("full_name")
    setDetails((prev: Record<string, NominaDetail[]>) => ({ ...prev, [nominaId]: (data as NominaDetail[]) ?? [] }))
    setLoadingDetails(null)
  }

  function toggleExpand(nominaId: string) {
    if (expandedId === nominaId) {
      setExpandedId(null)
    } else {
      setExpandedId(nominaId)
      fetchDetails(nominaId)
    }
  }

  // ── Available periods ──
  function getAvailablePeriods(): { thursday: Date; wednesday: Date; label: string }[] {
    const periods: { thursday: Date; wednesday: Date; label: string }[] = []
    for (let i = 0; i >= -4; i--) {
      const thursday = getThursdayOfPeriod(i)
      const wednesday = getWednesdayFromThursday(thursday)
      const startStr = fmtDate(thursday)
      const alreadyGenerated = nominas.some((n: NominaRow) => n.week_start === startStr)
      if (!alreadyGenerated) {
        const label = `${fmtDateDisplay(startStr)} – ${fmtDateDisplay(fmtDate(wednesday))}`
        periods.push({ thursday, wednesday, label })
      }
    }
    return periods
  }

  // ── Generate nomina ──
  async function handleGenerate(thursday: Date, wednesday: Date) {
    setGenerating(true)
    setValidationAlert(null)
    try {
      const weekStartStr = fmtDate(thursday)
      const weekEndStr = fmtDate(wednesday)
      const workDates = getWorkDates(thursday)
      const allDates = getAllPeriodDates(thursday)

      // 1. Get team
      const { data: assignments } = await supabase
        .from("obra_assignments")
        .select(`
          id,
          employee_id,
          role_on_site,
          employees(full_name, real_salary, bonus_amount, viatics_amount, overtime_hour_cost)
        `)
        .eq("obra_id", obraId)
        .is("assigned_to", null)

      if (!assignments || assignments.length === 0) {
        alert("No hay empleados asignados a esta obra.")
        setGenerating(false)
        return
      }

      const team: TeamMemberForNomina[] = assignments.map((a: any) => {
        const emp = Array.isArray(a.employees) ? a.employees[0] : a.employees
        return {
          assignment_id: a.id,
          employee_id: a.employee_id,
          full_name: emp?.full_name ?? "Sin nombre",
          role_on_site: a.role_on_site,
          real_salary: Number(emp?.real_salary) || 0,
          bonus_amount: Number(emp?.bonus_amount) || 0,
          viatics_amount: Number(emp?.viatics_amount) || 0,
          overtime_hour_cost: Number(emp?.overtime_hour_cost) || 0,
        }
      })

      // 2. Get attendance for period (Thu-Wed)
      const employeeIds = team.map((t: TeamMemberForNomina) => t.employee_id)
      const { data: attendanceData } = await supabase
        .from("obra_attendance")
        .select("employee_id, date, status, overtime_hours")
        .eq("obra_id", obraId)
        .in("employee_id", employeeIds)
        .gte("date", weekStartStr)
        .lte("date", weekEndStr)

      const attendance = (attendanceData as AttendanceRecord[]) ?? []

      // 3. VALIDATION: check all work days have attendance for all employees
      const directorAssignment = assignments.find((a: any) => a.role_on_site === "director_obra")
      const directorEmp = directorAssignment
        ? (Array.isArray(directorAssignment.employees) ? directorAssignment.employees[0] : directorAssignment.employees)
        : null
      const directorName: string = directorEmp?.full_name ?? "Sin asignar"

      const missing: MissingAttendance[] = []
      for (const member of team) {
        for (const workDate of workDates) {
          const hasRecord = attendance.some(
            (a: AttendanceRecord) => a.employee_id === member.employee_id && a.date === workDate
          )
          if (!hasRecord) {
            missing.push({
              employee_name: member.full_name,
              date: workDate,
              date_display: `${getDayName(workDate)} ${fmtDateShort(workDate)}`,
            })
          }
        }
      }

      if (missing.length > 0) {
        setValidationAlert({ missing, directorName })
        setGenerating(false)
        return
      }

      // 4. Calculate each employee
      let totalSalarios = 0
      let totalBonificaciones = 0
      let totalViaticos = 0
      let totalOvertime = 0
      let totalGeneral = 0

      const nominaDetails: Omit<NominaDetail, "id" | "nomina_id">[] = team.map((member: TeamMemberForNomina) => {
        const empAttendance = attendance.filter((a: AttendanceRecord) => a.employee_id === member.employee_id)

        let daysWorked = 0
        let daysBajada = 0
        let daysAbsent = 0
        let overtimeHours = 0

        for (const workDate of workDates) {
          const rec = empAttendance.find((a: AttendanceRecord) => a.date === workDate)
          if (!rec || rec.status === "absent" || rec.status === "justified") {
            daysAbsent += 1
          } else if (rec.status === "present") {
            daysWorked += 1
          } else if (rec.status === "half_day") {
            daysWorked += 0.5
            daysAbsent += 0.5
          } else if (rec.status === "bajada") {
            daysWorked += 1
            daysBajada += 1
          }
          if (rec) overtimeHours += Number(rec.overtime_hours) || 0
        }

        // Salary: full salary minus deduction per falta
        let salaryPaid: number
        if (daysAbsent === 0) {
          salaryPaid = member.real_salary
        } else {
          salaryPaid = member.real_salary - (member.real_salary / 7) * daysAbsent
        }
        salaryPaid = Math.round(salaryPaid * 100) / 100

        const bonus = member.bonus_amount
        const viatics = member.viatics_amount
        const overtimePay = Math.round(overtimeHours * member.overtime_hour_cost * 100) / 100
        const total = salaryPaid + bonus + viatics + overtimePay

        totalSalarios += salaryPaid
        totalBonificaciones += bonus
        totalViaticos += viatics
        totalOvertime += overtimePay
        totalGeneral += total

        return {
          employee_id: member.employee_id,
          full_name: member.full_name,
          role_on_site: member.role_on_site,
          days_worked: daysWorked,
          days_absent: daysAbsent,
          days_bajada: daysBajada,
          real_salary: member.real_salary,
          salary_paid: salaryPaid,
          bonus_amount: bonus,
          viatics_amount: viatics,
          overtime_hours: overtimeHours,
          overtime_rate: member.overtime_hour_cost,
          overtime_pay: overtimePay,
          total_paid: total,
        }
      })

      // Round totals
      totalSalarios = Math.round(totalSalarios * 100) / 100
      totalBonificaciones = Math.round(totalBonificaciones * 100) / 100
      totalViaticos = Math.round(totalViaticos * 100) / 100
      totalOvertime = Math.round(totalOvertime * 100) / 100
      totalGeneral = Math.round(totalGeneral * 100) / 100

      const name = nominaName(weekStartStr)

      // 5. Generate PDF (with calendar and attendance data)
      const pdfBlob = generatePDF({
        obraName,
        name,
        weekStart: weekStartStr,
        weekEnd: weekEndStr,
        details: nominaDetails,
        totalSalarios,
        totalBonificaciones,
        totalViaticos,
        totalOvertime,
        totalGeneral,
        attendance,
        allDates,
      })

      // 6. Upload PDF
      const pdfPath = `${obraId}/${name}.pdf`
      const { error: uploadError } = await supabase.storage
        .from("obra-nominas")
        .upload(pdfPath, pdfBlob, { contentType: "application/pdf", upsert: true })

      if (uploadError) {
        alert("Error al subir el PDF: " + uploadError.message)
        setGenerating(false)
        return
      }

      // 7. Get current user
      const { data: { user } } = await supabase.auth.getUser()

      // 8. Insert nomina record
      const { data: nominaInsert, error: nominaError } = await supabase
        .from("obra_nominas")
        .insert({
          obra_id: obraId,
          week_start: weekStartStr,
          week_end: weekEndStr,
          name,
          total_salarios: totalSalarios,
          total_bonificaciones: totalBonificaciones,
          total_viaticos: totalViaticos,
          total_overtime: totalOvertime,
          total_general: totalGeneral,
          employee_count: team.length,
          pdf_object_path: pdfPath,
          generated_by: user?.id ?? null,
        })
        .select("id")
        .single()

      if (nominaError || !nominaInsert) {
        alert("Error al guardar la nómina: " + (nominaError?.message ?? "Unknown"))
        setGenerating(false)
        return
      }

      // 9. Insert detail rows
      const detailRows = nominaDetails.map((d: Omit<NominaDetail, "id" | "nomina_id">) => ({
        ...d,
        nomina_id: (nominaInsert as { id: string }).id,
      }))

      await supabase.from("obra_nomina_details").insert(detailRows)
      await fetchNominas()
    } catch (err) {
      console.error("Error generating nomina:", err)
      alert("Error inesperado al generar la nómina.")
    } finally {
      setGenerating(false)
    }
  }

  // ── Download PDF ──
  async function handleDownload(nomina: NominaRow) {
    if (!nomina.pdf_object_path) return
    setDownloading(nomina.id)
    try {
      const { data, error } = await supabase.storage
        .from("obra-nominas")
        .download(nomina.pdf_object_path)
      if (error || !data) {
        alert("Error al descargar: " + (error?.message ?? ""))
        return
      }
      const url = URL.createObjectURL(data)
      const a = document.createElement("a")
      a.href = url
      a.download = `${nomina.name}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(null)
    }
  }

  // ── Render ──
  const availablePeriods = getAvailablePeriods()

  return (
    <div className="space-y-6">
      {/* Validation alert modal */}
      {validationAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 border border-red-500/30 rounded-2xl shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-700 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/15">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-slate-100 font-semibold">Asistencias Incompletas</h3>
                <p className="text-xs text-slate-400">
                  Director responsable: <span className="text-amber-400 font-medium">{validationAlert.directorName}</span>
                </p>
              </div>
            </div>
            <div className="px-5 py-4 max-h-[50vh] overflow-y-auto space-y-2">
              <p className="text-sm text-slate-300 mb-3">
                No se puede generar la nómina. Faltan {validationAlert.missing.length} registro{validationAlert.missing.length !== 1 ? "s" : ""} de asistencia:
              </p>
              {validationAlert.missing.map((m: MissingAttendance, i: number) => (
                <div key={i} className="flex items-center justify-between bg-slate-900/60 rounded-lg px-3 py-2 border border-slate-700/50">
                  <span className="text-sm text-slate-200">{m.employee_name}</span>
                  <span className="text-xs text-red-400 font-medium">{m.date_display}</span>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-slate-700 flex justify-end">
              <Button
                onClick={() => setValidationAlert(null)}
                className="bg-slate-700 hover:bg-slate-600 text-slate-200"
              >
                Entendido
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Generate section */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[#0174bd]/15">
              <DollarSign className="w-4.5 h-4.5 text-[#4da8e8]" />
            </div>
            <div>
              <CardTitle className="text-slate-100">Generar Nomina</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Periodo: Jueves a Miércoles (6 días laborales + Domingo descanso)
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {availablePeriods.length === 0 ? (
            <p className="text-sm text-slate-400">
              Todas las semanas recientes ya tienen nómina generada.
            </p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {availablePeriods.map(({ thursday, wednesday, label }) => (
                <Button
                  key={fmtDate(thursday)}
                  onClick={() => handleGenerate(thursday, wednesday)}
                  disabled={generating}
                  className="bg-[#0174bd] hover:bg-[#015a94] text-white"
                >
                  {generating ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <FileText className="w-4 h-4 mr-2" />
                  )}
                  {label}
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* History */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[#0174bd]/15">
              <CalendarDays className="w-4.5 h-4.5 text-[#4da8e8]" />
            </div>
            <div>
              <CardTitle className="text-slate-100">Historial de Nóminas</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                {nominas.length} nómina{nominas.length !== 1 ? "s" : ""} generada{nominas.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
            </div>
          ) : nominas.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-400">Aún no se han generado nóminas para esta obra.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {nominas.map((nomina: NominaRow) => {
                const isExpanded = expandedId === nomina.id
                const dets = details[nomina.id]
                const isLoadingDets = loadingDetails === nomina.id
                const isDl = downloading === nomina.id

                return (
                  <div key={nomina.id} className="border border-slate-700 rounded-xl overflow-hidden">
                    {/* Summary row */}
                    <div
                      className="flex items-center justify-between px-4 py-3 hover:bg-slate-700/30 cursor-pointer transition-colors"
                      onClick={() => toggleExpand(nomina.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-700/50 rounded-lg">
                          <FileText className="w-4 h-4 text-[#4da8e8]" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-100">{nomina.name}</p>
                          <p className="text-xs text-slate-500">
                            {fmtDateDisplay(nomina.week_start)} – {fmtDateDisplay(nomina.week_end)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="hidden sm:flex items-center gap-4 text-xs text-slate-400">
                          <span className="flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" />
                            {nomina.employee_count}
                          </span>
                          <span className="font-medium text-slate-200">{fmtCurrency(nomina.total_general)}</span>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-slate-400 hover:text-slate-200"
                          onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleDownload(nomina) }}
                          disabled={isDl || !nomina.pdf_object_path}
                        >
                          {isDl ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        </Button>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="border-t border-slate-700 bg-slate-900/50 px-4 py-4">
                        {isLoadingDets ? (
                          <div className="flex justify-center py-6">
                            <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
                          </div>
                        ) : dets && dets.length > 0 ? (
                          <>
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow className="border-slate-700">
                                    <TableHead className="text-slate-400 text-xs">Empleado</TableHead>
                                    <TableHead className="text-slate-400 text-xs">Puesto</TableHead>
                                    <TableHead className="text-slate-400 text-xs text-center">Faltas</TableHead>
                                    <TableHead className="text-slate-400 text-xs text-center">FB</TableHead>
                                    <TableHead className="text-slate-400 text-xs text-right">H. Extras</TableHead>
                                    <TableHead className="text-slate-400 text-xs text-right">Sueldo Base</TableHead>
                                    <TableHead className="text-slate-400 text-xs text-right">Salario Pagado</TableHead>
                                    <TableHead className="text-slate-400 text-xs text-right">Bonificación</TableHead>
                                    <TableHead className="text-slate-400 text-xs text-right">Viáticos</TableHead>
                                    <TableHead className="text-slate-400 text-xs text-right">Pago H.E.</TableHead>
                                    <TableHead className="text-slate-400 text-xs text-right font-semibold">Total</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {dets.map((d: NominaDetail) => (
                                    <TableRow key={d.id} className="border-slate-700/50">
                                      <TableCell className="text-sm text-slate-200">{d.full_name}</TableCell>
                                      <TableCell className="text-xs text-slate-400">{d.role_on_site?.replace(/_/g, " ") ?? "—"}</TableCell>
                                      <TableCell className="text-sm text-center">
                                        {d.days_absent > 0 ? (
                                          <span className="text-amber-400 font-medium">{d.days_absent} <AlertTriangle className="w-3 h-3 inline ml-0.5" /></span>
                                        ) : (
                                          <span className="text-emerald-400">0</span>
                                        )}
                                      </TableCell>
                                      <TableCell className="text-sm text-center">
                                        {d.days_bajada > 0 ? (
                                          <Badge className="bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs">{d.days_bajada}</Badge>
                                        ) : <span className="text-slate-600">—</span>}
                                      </TableCell>
                                      <TableCell className="text-sm text-right">
                                        {d.overtime_hours > 0 ? <span className="text-orange-400">{d.overtime_hours}h</span> : <span className="text-slate-600">—</span>}
                                      </TableCell>
                                      <TableCell className="text-sm text-slate-400 text-right">{fmtCurrency(d.real_salary)}</TableCell>
                                      <TableCell className="text-sm text-slate-200 text-right">{fmtCurrency(d.salary_paid)}</TableCell>
                                      <TableCell className="text-sm text-right">
                                        {d.bonus_amount > 0 ? <span className="text-emerald-400">{fmtCurrency(d.bonus_amount)}</span> : <span className="text-slate-600">—</span>}
                                      </TableCell>
                                      <TableCell className="text-sm text-right">
                                        {d.viatics_amount > 0 ? <span className="text-sky-400">{fmtCurrency(d.viatics_amount)}</span> : <span className="text-slate-600">—</span>}
                                      </TableCell>
                                      <TableCell className="text-sm text-right">
                                        {d.overtime_pay > 0 ? <span className="text-orange-400">{fmtCurrency(d.overtime_pay)}</span> : <span className="text-slate-600">—</span>}
                                      </TableCell>
                                      <TableCell className="text-sm text-slate-100 text-right font-semibold">{fmtCurrency(d.total_paid)}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                            {/* Totals */}
                            <div className="mt-4 flex flex-wrap gap-4 justify-end text-sm">
                              <div className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2">
                                <span className="text-slate-500 text-xs">Salarios</span>
                                <p className="text-slate-200 font-medium">{fmtCurrency(nomina.total_salarios)}</p>
                              </div>
                              <div className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2">
                                <span className="text-slate-500 text-xs">Bonificaciones</span>
                                <p className="text-emerald-400 font-medium">{fmtCurrency(nomina.total_bonificaciones)}</p>
                              </div>
                              <div className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2">
                                <span className="text-slate-500 text-xs">Viáticos</span>
                                <p className="text-sky-400 font-medium">{fmtCurrency(nomina.total_viaticos)}</p>
                              </div>
                              <div className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2">
                                <span className="text-slate-500 text-xs">Horas Extras</span>
                                <p className="text-orange-400 font-medium">{fmtCurrency(nomina.total_overtime)}</p>
                              </div>
                              <div className="bg-[#0174bd]/10 border border-[#0174bd]/30 rounded-lg px-4 py-2">
                                <span className="text-[#4da8e8] text-xs">Total General</span>
                                <p className="text-slate-100 font-bold">{fmtCurrency(nomina.total_general)}</p>
                              </div>
                            </div>
                          </>
                        ) : (
                          <p className="text-sm text-slate-500 text-center py-4">Sin detalles disponibles.</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ───── PDF Generation ─────

const STATUS_LABELS: Record<string, { short: string; color: [number, number, number]; bg: [number, number, number] }> = {
  present:   { short: "A",  color: [52, 211, 153],  bg: [20, 40, 35] },
  absent:    { short: "F",  color: [248, 113, 113],  bg: [45, 22, 22] },
  half_day:  { short: "½",  color: [251, 191, 36],   bg: [45, 38, 18] },
  justified: { short: "J",  color: [96, 165, 250],   bg: [20, 30, 50] },
  bajada:    { short: "FB", color: [168, 85, 247],    bg: [35, 22, 50] },
}

function generatePDF(params: {
  obraName: string
  name: string
  weekStart: string
  weekEnd: string
  details: Omit<NominaDetail, "id" | "nomina_id">[]
  totalSalarios: number
  totalBonificaciones: number
  totalViaticos: number
  totalOvertime: number
  totalGeneral: number
  attendance: AttendanceRecord[]
  allDates: string[]
}): Blob {
  const {
    obraName, name, weekStart, weekEnd, details,
    totalSalarios, totalBonificaciones, totalViaticos, totalOvertime, totalGeneral,
    attendance, allDates,
  } = params

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()

  // Colors
  const darkBg: [number, number, number] = [15, 23, 42]
  const cardBg: [number, number, number] = [30, 41, 59]
  const accent: [number, number, number] = [1, 116, 189]
  const headerText: [number, number, number] = [241, 245, 249]
  const bodyText: [number, number, number] = [203, 213, 225]
  const mutedText: [number, number, number] = [100, 116, 139]
  const borderColor: [number, number, number] = [51, 65, 85]
  const greenText: [number, number, number] = [52, 211, 153]
  const purpleText: [number, number, number] = [168, 85, 247]
  const skyText: [number, number, number] = [56, 189, 248]
  const orangeText: [number, number, number] = [251, 146, 60]

  // ── PAGE 1: Financial table ──
  doc.setFillColor(...darkBg)
  doc.rect(0, 0, pageW, pageH, "F")

  // Header bar
  doc.setFillColor(...accent)
  doc.rect(0, 0, pageW, 18, "F")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(14)
  doc.setTextColor(...headerText)
  doc.text("RAFSA - Reporte de Nómina", 10, 12)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.text(name, pageW - 10, 8, { align: "right" })
  doc.text(`Generado: ${new Date().toLocaleDateString("es-MX")}`, pageW - 10, 14, { align: "right" })

  let y = 24
  doc.setFontSize(11)
  doc.setTextColor(...headerText)
  doc.text(`Obra: ${obraName}`, 10, y)
  doc.setFontSize(9)
  doc.setTextColor(...mutedText)
  doc.text(`Periodo: ${fmtDateDisplay(weekStart)} – ${fmtDateDisplay(weekEnd)} (Jue – Mié)`, 10, y + 6)
  y += 14

  // Table columns
  const cols = [
    { label: "Empleado", x: 10, w: 42 },
    { label: "Puesto", x: 52, w: 28 },
    { label: "Faltas", x: 80, w: 14 },
    { label: "FB", x: 94, w: 10 },
    { label: "H. Extras", x: 104, w: 16 },
    { label: "Sueldo Base", x: 120, w: 26 },
    { label: "Sal. Pagado", x: 146, w: 26 },
    { label: "Bonificación", x: 172, w: 24 },
    { label: "Viáticos", x: 196, w: 22 },
    { label: "Pago H.E.", x: 218, w: 22 },
    { label: "Total", x: 240, w: 26 },
  ]

  function drawTableHeader() {
    doc.setFillColor(...cardBg)
    doc.roundedRect(8, y, pageW - 16, 8, 1, 1, "F")
    doc.setFont("helvetica", "bold")
    doc.setFontSize(7)
    doc.setTextColor(...mutedText)
    for (const col of cols) {
      doc.text(col.label.toUpperCase(), col.x, y + 5.5)
    }
    y += 10
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
  }

  drawTableHeader()

  const sortedDetails = [...details].sort((a, b) => a.full_name.localeCompare(b.full_name))

  for (let i = 0; i < sortedDetails.length; i++) {
    if (y > pageH - 30) {
      doc.addPage()
      doc.setFillColor(...darkBg)
      doc.rect(0, 0, pageW, pageH, "F")
      y = 10
      drawTableHeader()
    }

    const d = sortedDetails[i]

    if (i % 2 === 0) {
      doc.setFillColor(20, 30, 48)
      doc.rect(8, y - 1, pageW - 16, 7, "F")
    }

    doc.setDrawColor(...borderColor)
    doc.setLineWidth(0.1)
    doc.line(8, y + 6, pageW - 8, y + 6)

    doc.setTextColor(...bodyText)
    doc.text(d.full_name.substring(0, 24), cols[0].x, y + 4)
    doc.setTextColor(...mutedText)
    doc.text((d.role_on_site?.replace(/_/g, " ") ?? "—").substring(0, 15), cols[1].x, y + 4)

    // Faltas
    if (d.days_absent > 0) {
      doc.setTextColor(...orangeText)
      doc.text(String(d.days_absent), cols[2].x, y + 4)
    } else {
      doc.setTextColor(...greenText)
      doc.text("0", cols[2].x, y + 4)
    }

    // FB
    if (d.days_bajada > 0) { doc.setTextColor(...purpleText); doc.text(String(d.days_bajada), cols[3].x, y + 4) }
    else { doc.setTextColor(...mutedText); doc.text("—", cols[3].x, y + 4) }

    // H. Extras
    if (d.overtime_hours > 0) { doc.setTextColor(...orangeText); doc.text(`${d.overtime_hours}h`, cols[4].x, y + 4) }
    else { doc.setTextColor(...mutedText); doc.text("—", cols[4].x, y + 4) }

    doc.setTextColor(...mutedText)
    doc.text(fmtCurrency(d.real_salary), cols[5].x, y + 4)
    doc.setTextColor(...bodyText)
    doc.text(fmtCurrency(d.salary_paid), cols[6].x, y + 4)

    if (d.bonus_amount > 0) { doc.setTextColor(...greenText); doc.text(fmtCurrency(d.bonus_amount), cols[7].x, y + 4) }
    else { doc.setTextColor(...mutedText); doc.text("—", cols[7].x, y + 4) }

    if (d.viatics_amount > 0) { doc.setTextColor(...skyText); doc.text(fmtCurrency(d.viatics_amount), cols[8].x, y + 4) }
    else { doc.setTextColor(...mutedText); doc.text("—", cols[8].x, y + 4) }

    if (d.overtime_pay > 0) { doc.setTextColor(...orangeText); doc.text(fmtCurrency(d.overtime_pay), cols[9].x, y + 4) }
    else { doc.setTextColor(...mutedText); doc.text("—", cols[9].x, y + 4) }

    doc.setTextColor(...headerText)
    doc.setFont("helvetica", "bold")
    doc.text(fmtCurrency(d.total_paid), cols[10].x, y + 4)
    doc.setFont("helvetica", "normal")

    y += 7
  }

  // Totals bar
  y += 4
  doc.setFillColor(...cardBg)
  doc.roundedRect(8, y, pageW - 16, 14, 2, 2, "F")

  doc.setFontSize(7)
  doc.setTextColor(...mutedText)
  doc.text("TOTALES:", 14, y + 6)
  doc.setTextColor(...bodyText)
  doc.text(`Salarios: ${fmtCurrency(totalSalarios)}`, 45, y + 6)
  doc.setTextColor(...greenText)
  doc.text(`Bonif.: ${fmtCurrency(totalBonificaciones)}`, 100, y + 6)
  doc.setTextColor(...skyText)
  doc.text(`Viáticos: ${fmtCurrency(totalViaticos)}`, 145, y + 6)
  doc.setTextColor(...orangeText)
  doc.text(`H. Extras: ${fmtCurrency(totalOvertime)}`, 190, y + 6)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.setTextColor(...headerText)
  doc.text(`TOTAL: ${fmtCurrency(totalGeneral)}`, pageW - 14, y + 10, { align: "right" })

  // ── PAGE 2: Attendance Calendar ──
  doc.addPage()
  doc.setFillColor(...darkBg)
  doc.rect(0, 0, pageW, pageH, "F")

  // Header bar
  doc.setFillColor(...accent)
  doc.rect(0, 0, pageW, 14, "F")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(12)
  doc.setTextColor(...headerText)
  doc.text("Calendario de Asistencias", 10, 10)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.text(`${fmtDateDisplay(weekStart)} – ${fmtDateDisplay(weekEnd)}`, pageW - 10, 10, { align: "right" })

  y = 20

  // Day headers
  const calNameW = 50
  const calCellW = 28
  const calStartX = calNameW + 10

  // Day names row
  doc.setFillColor(...cardBg)
  doc.roundedRect(8, y, pageW - 16, 10, 1, 1, "F")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7)
  doc.setTextColor(...mutedText)
  doc.text("EMPLEADO", 10, y + 7)

  for (let i = 0; i < allDates.length; i++) {
    const dateStr = allDates[i]
    const dayN = getDayName(dateStr)
    const dayNum = fmtDateShort(dateStr)
    const isSunday = new Date(dateStr + "T00:00:00").getDay() === 0
    const cx = calStartX + i * calCellW

    if (isSunday) doc.setTextColor(100, 116, 139)
    else doc.setTextColor(...bodyText)

    doc.text(dayN, cx + 2, y + 4)
    doc.setFontSize(6)
    doc.text(dayNum, cx + 2, y + 8)
    doc.setFontSize(7)
  }

  y += 12

  // Employee rows
  doc.setFont("helvetica", "normal")

  for (let ei = 0; ei < sortedDetails.length; ei++) {
    if (y > pageH - 15) {
      doc.addPage()
      doc.setFillColor(...darkBg)
      doc.rect(0, 0, pageW, pageH, "F")
      y = 10
      // Repeat header
      doc.setFillColor(...cardBg)
      doc.roundedRect(8, y, pageW - 16, 10, 1, 1, "F")
      doc.setFont("helvetica", "bold")
      doc.setFontSize(7)
      doc.setTextColor(...mutedText)
      doc.text("EMPLEADO", 10, y + 7)
      for (let i = 0; i < allDates.length; i++) {
        const dateStr = allDates[i]
        const cx = calStartX + i * calCellW
        doc.setTextColor(...bodyText)
        doc.text(getDayName(dateStr), cx + 2, y + 4)
        doc.setFontSize(6)
        doc.text(fmtDateShort(dateStr), cx + 2, y + 8)
        doc.setFontSize(7)
      }
      y += 12
      doc.setFont("helvetica", "normal")
    }

    const emp = sortedDetails[ei]

    // Zebra
    if (ei % 2 === 0) {
      doc.setFillColor(20, 30, 48)
      doc.rect(8, y - 1, pageW - 16, 9, "F")
    }

    doc.setDrawColor(...borderColor)
    doc.setLineWidth(0.1)
    doc.line(8, y + 8, pageW - 8, y + 8)

    // Name
    doc.setFontSize(7)
    doc.setTextColor(...bodyText)
    doc.text(emp.full_name.substring(0, 28), 10, y + 4)

    // Each day cell
    for (let i = 0; i < allDates.length; i++) {
      const dateStr = allDates[i]
      const cx = calStartX + i * calCellW
      const isSunday = new Date(dateStr + "T00:00:00").getDay() === 0

      if (isSunday) {
        // Sunday = rest day
        doc.setFillColor(30, 41, 59)
        doc.roundedRect(cx, y - 0.5, calCellW - 2, 8, 1, 1, "F")
        doc.setFontSize(6)
        doc.setTextColor(...mutedText)
        doc.text("DESC", cx + 5, y + 4.5)
        continue
      }

      const rec = attendance.find(
        (a: AttendanceRecord) => a.employee_id === emp.employee_id && a.date === dateStr
      )

      if (rec) {
        const cfg = STATUS_LABELS[rec.status] ?? STATUS_LABELS.present
        // Status bg (pre-calculated dim color)
        doc.setFillColor(...cfg.bg)
        doc.roundedRect(cx, y - 0.5, calCellW - 2, 8, 1, 1, "F")

        doc.setFontSize(8)
        doc.setFont("helvetica", "bold")
        doc.setTextColor(...cfg.color)
        doc.text(cfg.short, cx + 3, y + 4.5)

        // Overtime indicator
        const ot = Number(rec.overtime_hours) || 0
        if (ot > 0) {
          doc.setFontSize(5)
          doc.setFont("helvetica", "normal")
          doc.setTextColor(...orangeText)
          doc.text(`+${ot}h`, cx + 14, y + 4.5)
        }

        doc.setFont("helvetica", "normal")
      } else {
        doc.setFontSize(7)
        doc.setTextColor(...mutedText)
        doc.text("—", cx + 5, y + 4.5)
      }
    }

    y += 9
  }

  // Legend
  y += 5
  if (y > pageH - 15) {
    doc.addPage()
    doc.setFillColor(...darkBg)
    doc.rect(0, 0, pageW, pageH, "F")
    y = 10
  }

  doc.setFillColor(...cardBg)
  doc.roundedRect(8, y, pageW - 16, 10, 1, 1, "F")
  doc.setFontSize(6)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...mutedText)
  doc.text("LEYENDA:", 12, y + 6)
  doc.setFont("helvetica", "normal")

  const legendItems = [
    { short: "A", label: "Asistió", color: STATUS_LABELS.present.color },
    { short: "F", label: "Falta", color: STATUS_LABELS.absent.color },
    { short: "½", label: "Medio día", color: STATUS_LABELS.half_day.color },
    { short: "J", label: "Justificada", color: STATUS_LABELS.justified.color },
    { short: "FB", label: "Bajada", color: STATUS_LABELS.bajada.color },
    { short: "DESC", label: "Descanso", color: mutedText },
  ]
  let lx = 38
  for (const item of legendItems) {
    doc.setTextColor(...item.color)
    doc.setFont("helvetica", "bold")
    doc.text(item.short, lx, y + 6)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(...mutedText)
    doc.text(`= ${item.label}`, lx + 8, y + 6)
    lx += 35
  }

  // Footer on all pages
  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(6)
    doc.setTextColor(...mutedText)
    doc.text("RAFSA Construction Management System", 10, pageH - 5)
    doc.text(`${details.length} empleados | ${name} | Pág ${p}/${totalPages}`, pageW - 10, pageH - 5, { align: "right" })
  }

  return doc.output("blob")
}
