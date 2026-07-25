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
  Eye,
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
  days_bajada: number
  real_salary: number
  salary_paid: number
  bonus_amount: number
  viatics_amount: number
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
}

type AttendanceRecord = {
  employee_id: string
  date: string
  status: string
}

// ───── Helpers ─────

/** Get Monday of a given week offset (0 = current week, -1 = last week, etc.) */
function getMondayOfWeek(offset: number = 0): Date {
  const now = new Date()
  const day = now.getDay()
  const diff = day === 0 ? -6 : 1 - day // Monday = 1
  const monday = new Date(now)
  monday.setDate(now.getDate() + diff + offset * 7)
  monday.setHours(0, 0, 0, 0)
  return monday
}

function getSaturdayFromMonday(monday: Date): Date {
  const sat = new Date(monday)
  sat.setDate(monday.getDate() + 5)
  return sat
}

function fmtDate(d: Date): string {
  return d.toISOString().split("T")[0]
}

function fmtDateDisplay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00")
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })
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
    // fetch obra name for PDF header
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

  // ── Check which weeks are available to generate ──
  function getAvailableWeeks(): { monday: Date; saturday: Date; label: string }[] {
    const weeks: { monday: Date; saturday: Date; label: string }[] = []
    // Check current week and last 4 weeks
    for (let i = 0; i >= -4; i--) {
      const monday = getMondayOfWeek(i)
      const saturday = getSaturdayFromMonday(monday)
      const weekStartStr = fmtDate(monday)
      // Skip if already generated
      const alreadyGenerated = nominas.some((n: NominaRow) => n.week_start === weekStartStr)
      if (!alreadyGenerated) {
        const label = `${fmtDateDisplay(weekStartStr)} – ${fmtDateDisplay(fmtDate(saturday))}`
        weeks.push({ monday, saturday, label })
      }
    }
    return weeks
  }

  // ── Generate nomina ──
  async function handleGenerate(monday: Date, saturday: Date) {
    setGenerating(true)
    try {
      const weekStartStr = fmtDate(monday)
      const weekEndStr = fmtDate(saturday)

      // 1. Get team for this obra
      const { data: assignments } = await supabase
        .from("obra_assignments")
        .select(`
          id,
          employee_id,
          role_on_site,
          employees(full_name, real_salary, bonus_amount, viatics_amount)
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
        }
      })

      // 2. Get attendance for all employees this week (Mon-Sat)
      const employeeIds = team.map((t) => t.employee_id)
      const { data: attendanceData } = await supabase
        .from("obra_attendance")
        .select("employee_id, date, status")
        .eq("obra_id", obraId)
        .in("employee_id", employeeIds)
        .gte("date", weekStartStr)
        .lte("date", weekEndStr)

      const attendance = (attendanceData as AttendanceRecord[]) ?? []

      // 3. Calculate each employee
      let totalSalarios = 0
      let totalBonificaciones = 0
      let totalViaticos = 0
      let totalGeneral = 0

      const nominaDetails: Omit<NominaDetail, "id" | "nomina_id">[] = team.map((member) => {
        const empAttendance = attendance.filter((a) => a.employee_id === member.employee_id)

        let daysWorked = 0
        let daysBajada = 0

        for (const rec of empAttendance) {
          if (rec.status === "present") daysWorked += 1
          else if (rec.status === "half_day") daysWorked += 0.5
          else if (rec.status === "bajada") {
            daysWorked += 1
            daysBajada += 1
          }
          // absent and justified don't count
        }

        // Salary calculation
        let salaryPaid: number
        if (daysWorked >= 6) {
          salaryPaid = member.real_salary // full week
        } else {
          salaryPaid = (member.real_salary / 7) * daysWorked
        }
        salaryPaid = Math.round(salaryPaid * 100) / 100

        const bonus = member.bonus_amount
        const viatics = member.viatics_amount
        const total = salaryPaid + bonus + viatics

        totalSalarios += salaryPaid
        totalBonificaciones += bonus
        totalViaticos += viatics
        totalGeneral += total

        return {
          employee_id: member.employee_id,
          full_name: member.full_name,
          role_on_site: member.role_on_site,
          days_worked: daysWorked,
          days_bajada: daysBajada,
          real_salary: member.real_salary,
          salary_paid: salaryPaid,
          bonus_amount: bonus,
          viatics_amount: viatics,
          total_paid: total,
        }
      })

      // Round totals
      totalSalarios = Math.round(totalSalarios * 100) / 100
      totalBonificaciones = Math.round(totalBonificaciones * 100) / 100
      totalViaticos = Math.round(totalViaticos * 100) / 100
      totalGeneral = Math.round(totalGeneral * 100) / 100

      const name = nominaName(weekStartStr)

      // 4. Generate PDF
      const pdfBlob = generatePDF({
        obraName,
        name,
        weekStart: weekStartStr,
        weekEnd: weekEndStr,
        details: nominaDetails,
        totalSalarios,
        totalBonificaciones,
        totalViaticos,
        totalGeneral,
      })

      // 5. Upload PDF to Supabase storage
      const pdfPath = `${obraId}/${name}.pdf`
      const { error: uploadError } = await supabase.storage
        .from("obra-nominas")
        .upload(pdfPath, pdfBlob, {
          contentType: "application/pdf",
          upsert: true,
        })

      if (uploadError) {
        console.error("Error uploading PDF:", uploadError)
        alert("Error al subir el PDF: " + uploadError.message)
        setGenerating(false)
        return
      }

      // 6. Get current user
      const { data: { user } } = await supabase.auth.getUser()

      // 7. Insert nomina record
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
          total_general: totalGeneral,
          employee_count: team.length,
          pdf_object_path: pdfPath,
          generated_by: user?.id ?? null,
        })
        .select("id")
        .single()

      if (nominaError || !nominaInsert) {
        console.error("Error inserting nomina:", nominaError)
        alert("Error al guardar la nómina: " + (nominaError?.message ?? "Unknown"))
        setGenerating(false)
        return
      }

      // 8. Insert detail rows
      const detailRows = nominaDetails.map((d) => ({
        ...d,
        nomina_id: (nominaInsert as { id: string }).id,
      }))

      await supabase.from("obra_nomina_details").insert(detailRows)

      // 9. Refresh list
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
  const availableWeeks = getAvailableWeeks()

  return (
    <div className="space-y-6">
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
                Selecciona la semana para calcular y generar el reporte de nomina
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {availableWeeks.length === 0 ? (
            <p className="text-sm text-slate-400">
              Todas las semanas recientes ya tienen nomina generada.
            </p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {availableWeeks.map(({ monday, saturday, label }) => (
                <Button
                  key={fmtDate(monday)}
                  onClick={() => handleGenerate(monday, saturday)}
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
              <CardTitle className="text-slate-100">Historial de Nominas</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                {nominas.length} nomina{nominas.length !== 1 ? "s" : ""} generada{nominas.length !== 1 ? "s" : ""}
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
              <p className="text-sm text-slate-400">Aun no se han generado nominas para esta obra.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {nominas.map((nomina: NominaRow) => {
                const isExpanded = expandedId === nomina.id
                const dets = details[nomina.id]
                const isLoadingDets = loadingDetails === nomina.id
                const isDl = downloading === nomina.id

                return (
                  <div
                    key={nomina.id}
                    className="border border-slate-700 rounded-xl overflow-hidden"
                  >
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
                          <p className="text-sm font-medium text-slate-100">
                            {nomina.name}
                          </p>
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
                          <span className="font-medium text-slate-200">
                            {fmtCurrency(nomina.total_general)}
                          </span>
                        </div>

                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-slate-400 hover:text-slate-200"
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation()
                            handleDownload(nomina)
                          }}
                          disabled={isDl || !nomina.pdf_object_path}
                        >
                          {isDl ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                        </Button>

                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-slate-500" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-500" />
                        )}
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
                                    <TableHead className="text-slate-400 text-xs text-center">Dias</TableHead>
                                    <TableHead className="text-slate-400 text-xs text-center">FB</TableHead>
                                    <TableHead className="text-slate-400 text-xs text-right">Sueldo Base</TableHead>
                                    <TableHead className="text-slate-400 text-xs text-right">Salario Pagado</TableHead>
                                    <TableHead className="text-slate-400 text-xs text-right">Bonificacion</TableHead>
                                    <TableHead className="text-slate-400 text-xs text-right">Viaticos</TableHead>
                                    <TableHead className="text-slate-400 text-xs text-right font-semibold">Total</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {dets.map((d: NominaDetail) => (
                                    <TableRow key={d.id} className="border-slate-700/50">
                                      <TableCell className="text-sm text-slate-200">{d.full_name}</TableCell>
                                      <TableCell className="text-xs text-slate-400">
                                        {d.role_on_site?.replace(/_/g, " ") ?? "—"}
                                      </TableCell>
                                      <TableCell className="text-sm text-slate-300 text-center">
                                        {d.days_worked}
                                        {d.days_worked < 6 && (
                                          <span className="text-amber-400 ml-1">
                                            <AlertTriangle className="w-3 h-3 inline" />
                                          </span>
                                        )}
                                      </TableCell>
                                      <TableCell className="text-sm text-center">
                                        {d.days_bajada > 0 ? (
                                          <Badge className="bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs">
                                            {d.days_bajada}
                                          </Badge>
                                        ) : (
                                          <span className="text-slate-600">—</span>
                                        )}
                                      </TableCell>
                                      <TableCell className="text-sm text-slate-400 text-right">
                                        {fmtCurrency(d.real_salary)}
                                      </TableCell>
                                      <TableCell className="text-sm text-slate-200 text-right">
                                        {fmtCurrency(d.salary_paid)}
                                      </TableCell>
                                      <TableCell className="text-sm text-right">
                                        {d.bonus_amount > 0 ? (
                                          <span className="text-emerald-400">{fmtCurrency(d.bonus_amount)}</span>
                                        ) : (
                                          <span className="text-slate-600">—</span>
                                        )}
                                      </TableCell>
                                      <TableCell className="text-sm text-right">
                                        {d.viatics_amount > 0 ? (
                                          <span className="text-sky-400">{fmtCurrency(d.viatics_amount)}</span>
                                        ) : (
                                          <span className="text-slate-600">—</span>
                                        )}
                                      </TableCell>
                                      <TableCell className="text-sm text-slate-100 text-right font-semibold">
                                        {fmtCurrency(d.total_paid)}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>

                            {/* Totals row */}
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
                                <span className="text-slate-500 text-xs">Viaticos</span>
                                <p className="text-sky-400 font-medium">{fmtCurrency(nomina.total_viaticos)}</p>
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

function generatePDF(params: {
  obraName: string
  name: string
  weekStart: string
  weekEnd: string
  details: Omit<NominaDetail, "id" | "nomina_id">[]
  totalSalarios: number
  totalBonificaciones: number
  totalViaticos: number
  totalGeneral: number
}): Blob {
  const {
    obraName,
    name,
    weekStart,
    weekEnd,
    details,
    totalSalarios,
    totalBonificaciones,
    totalViaticos,
    totalGeneral,
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

  // Full page dark background
  doc.setFillColor(...darkBg)
  doc.rect(0, 0, pageW, pageH, "F")

  // Header bar
  doc.setFillColor(...accent)
  doc.rect(0, 0, pageW, 18, "F")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(14)
  doc.setTextColor(...headerText)
  doc.text("RAFSA - Reporte de Nomina", 10, 12)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.text(name, pageW - 10, 8, { align: "right" })
  doc.text(`Generado: ${new Date().toLocaleDateString("es-MX")}`, pageW - 10, 14, { align: "right" })

  // Sub-header
  let y = 24
  doc.setFontSize(11)
  doc.setTextColor(...headerText)
  doc.text(`Obra: ${obraName}`, 10, y)
  doc.setFontSize(9)
  doc.setTextColor(...mutedText)
  doc.text(`Periodo: ${fmtDateDisplay(weekStart)} – ${fmtDateDisplay(weekEnd)}`, 10, y + 6)
  y += 14

  // Table header
  const cols = [
    { label: "Empleado", x: 10, w: 50 },
    { label: "Puesto", x: 60, w: 35 },
    { label: "Dias", x: 95, w: 15 },
    { label: "FB", x: 110, w: 12 },
    { label: "Sueldo Base", x: 122, w: 30 },
    { label: "Salario Pagado", x: 152, w: 30 },
    { label: "Bonificacion", x: 182, w: 28 },
    { label: "Viaticos", x: 210, w: 25 },
    { label: "Total", x: 235, w: 30 },
  ]

  // Header row bg
  doc.setFillColor(...cardBg)
  doc.roundedRect(8, y, pageW - 16, 8, 1, 1, "F")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7)
  doc.setTextColor(...mutedText)
  for (const col of cols) {
    doc.text(col.label.toUpperCase(), col.x, y + 5.5)
  }
  y += 10

  // Data rows
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)

  const sortedDetails = [...details].sort((a, b) => a.full_name.localeCompare(b.full_name))

  for (let i = 0; i < sortedDetails.length; i++) {
    if (y > pageH - 30) {
      // New page
      doc.addPage()
      doc.setFillColor(...darkBg)
      doc.rect(0, 0, pageW, pageH, "F")
      y = 10
      // Repeat header
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

    const d = sortedDetails[i]

    // Zebra stripe
    if (i % 2 === 0) {
      doc.setFillColor(20, 30, 48)
      doc.rect(8, y - 1, pageW - 16, 7, "F")
    }

    // Row bottom border
    doc.setDrawColor(...borderColor)
    doc.setLineWidth(0.1)
    doc.line(8, y + 6, pageW - 8, y + 6)

    doc.setTextColor(...bodyText)
    doc.text(d.full_name.substring(0, 28), cols[0].x, y + 4)
    doc.setTextColor(...mutedText)
    doc.text((d.role_on_site?.replace(/_/g, " ") ?? "—").substring(0, 18), cols[1].x, y + 4)

    // Days
    doc.setTextColor(d.days_worked < 6 ? 251 : 203, d.days_worked < 6 ? 191 : 213, d.days_worked < 6 ? 36 : 225)
    doc.text(String(d.days_worked), cols[2].x, y + 4)

    // Bajada days
    if (d.days_bajada > 0) {
      doc.setTextColor(...purpleText)
      doc.text(String(d.days_bajada), cols[3].x, y + 4)
    } else {
      doc.setTextColor(...mutedText)
      doc.text("—", cols[3].x, y + 4)
    }

    doc.setTextColor(...mutedText)
    doc.text(fmtCurrency(d.real_salary), cols[4].x, y + 4)
    doc.setTextColor(...bodyText)
    doc.text(fmtCurrency(d.salary_paid), cols[5].x, y + 4)

    if (d.bonus_amount > 0) {
      doc.setTextColor(...greenText)
      doc.text(fmtCurrency(d.bonus_amount), cols[6].x, y + 4)
    } else {
      doc.setTextColor(...mutedText)
      doc.text("—", cols[6].x, y + 4)
    }

    if (d.viatics_amount > 0) {
      doc.setTextColor(...skyText)
      doc.text(fmtCurrency(d.viatics_amount), cols[7].x, y + 4)
    } else {
      doc.setTextColor(...mutedText)
      doc.text("—", cols[7].x, y + 4)
    }

    doc.setTextColor(...headerText)
    doc.setFont("helvetica", "bold")
    doc.text(fmtCurrency(d.total_paid), cols[8].x, y + 4)
    doc.setFont("helvetica", "normal")

    y += 7
  }

  // Totals bar
  y += 4
  doc.setFillColor(...cardBg)
  doc.roundedRect(8, y, pageW - 16, 14, 2, 2, "F")

  doc.setFontSize(8)
  doc.setTextColor(...mutedText)
  doc.text("TOTALES:", 14, y + 6)

  doc.setTextColor(...bodyText)
  doc.text(`Salarios: ${fmtCurrency(totalSalarios)}`, 50, y + 6)

  doc.setTextColor(...greenText)
  doc.text(`Bonificaciones: ${fmtCurrency(totalBonificaciones)}`, 110, y + 6)

  doc.setTextColor(...skyText)
  doc.text(`Viaticos: ${fmtCurrency(totalViaticos)}`, 170, y + 6)

  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.setTextColor(...headerText)
  doc.text(`TOTAL: ${fmtCurrency(totalGeneral)}`, pageW - 14, y + 10, { align: "right" })

  // Footer
  doc.setFont("helvetica", "normal")
  doc.setFontSize(6)
  doc.setTextColor(...mutedText)
  doc.text("RAFSA Construction Management System", 10, pageH - 5)
  doc.text(`${details.length} empleados | ${name}`, pageW - 10, pageH - 5, { align: "right" })

  return doc.output("blob")
}
