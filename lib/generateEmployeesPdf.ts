// Requires: npm install jspdf

export type SalaryPdfData = {
  real_salary: number | null
  payroll_salary: number | null
  bonus_amount: number | null
  overtime_hour_cost: number | null
  viatics_amount: number | null
}

export type EmployeePdfData = {
  id: string
  full_name: string
  status: string // "active" | "inactive"
  hire_date: string | null
  termination_date: string | null
  roles: { name: string }[]
  signedPhotoUrl: string | null
  salary: SalaryPdfData | null
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function imageUrlToBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function fmtMXN(val: number | null | undefined): string {
  const n = typeof val === "number" ? val : 0
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(n)
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "No especificado"
  try {
    return new Date(d + "T12:00:00").toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
  } catch {
    return d
  }
}

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen - 1) + "..." : text
}

// ── Cover page ─────────────────────────────────────────────────────────────

async function drawCoverPage(
  doc: InstanceType<typeof import("jspdf").default>,
  activeCount: number,
  inactiveCount: number,
): Promise<void> {
  const PW = 210
  const PH = 297

  // Top bar
  doc.setFillColor(30, 41, 59)           // slate-800
  doc.rect(0, 0, PW, 22, "F")

  // Bottom bar
  doc.setFillColor(30, 41, 59)
  doc.rect(0, PH - 14, PW, 14, "F")

  // Logo from public folder
  try {
    const logoBase64 = await imageUrlToBase64("/brand/rafsa-logo.png")
    if (logoBase64) {
      // Logo original: 1748 x 1241 → scale to ~90mm wide
      const logoW = 90
      const logoH = Math.round((1241 / 1748) * logoW)  // ~63.7mm
      doc.addImage(logoBase64, "PNG", (PW - logoW) / 2, 32, logoW, logoH)
    }
  } catch {
    // fallback: just print company name
    doc.setFont("helvetica", "bold")
    doc.setFontSize(28)
    doc.setTextColor(30, 41, 59)
    doc.text("RAFSA", PW / 2, 70, { align: "center" })
  }

  // Divider line
  doc.setDrawColor(203, 213, 225)        // slate-300
  doc.setLineWidth(0.5)
  doc.line(25, 106, PW - 25, 106)

  // Document title
  doc.setFont("helvetica", "bold")
  doc.setFontSize(20)
  doc.setTextColor(15, 23, 42)           // slate-950
  doc.text("DIRECTORIO DE EMPLEADOS", PW / 2, 120, { align: "center" })

  // Subtitle
  doc.setFont("helvetica", "normal")
  doc.setFontSize(10.5)
  doc.setTextColor(100, 116, 139)        // slate-500
  doc.text("Registro de personal, roles y datos salariales", PW / 2, 130, { align: "center" })

  // Generation date
  const today = new Date()
  const dateStr = today.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  })
  doc.setFontSize(9.5)
  doc.setTextColor(148, 163, 184)        // slate-400
  doc.text(`Generado el ${dateStr}`, PW / 2, 141, { align: "center" })

  // Stats card background
  const cardX = 30
  const cardY = 155
  const cardW = PW - 60
  const cardH = 62
  doc.setFillColor(248, 250, 252)        // slate-50
  doc.roundedRect(cardX, cardY, cardW, cardH, 3, 3, "F")
  doc.setDrawColor(226, 232, 240)        // slate-200
  doc.setLineWidth(0.3)
  doc.roundedRect(cardX, cardY, cardW, cardH, 3, 3, "S")

  // "RESUMEN" label
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8)
  doc.setTextColor(100, 116, 139)
  doc.text("RESUMEN", cardX + cardW / 2, cardY + 9, { align: "center" })

  // Vertical divider inside card
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.3)
  doc.line(PW / 2, cardY + 14, PW / 2, cardY + cardH - 8)

  // Active employees
  const col1X = cardX + cardW / 4
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(100, 116, 139)
  doc.text("EMPLEADOS ACTIVOS", col1X, cardY + 21, { align: "center" })
  doc.setFont("helvetica", "bold")
  doc.setFontSize(30)
  doc.setTextColor(34, 197, 94)          // green-500
  doc.text(String(activeCount), col1X, cardY + 44, { align: "center" })

  // Inactive employees
  const col2X = cardX + (cardW * 3) / 4
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(100, 116, 139)
  doc.text("EMPLEADOS INACTIVOS", col2X, cardY + 21, { align: "center" })
  doc.setFont("helvetica", "bold")
  doc.setFontSize(30)
  doc.setTextColor(239, 68, 68)          // red-500
  doc.text(String(inactiveCount), col2X, cardY + 44, { align: "center" })

  // Total line at bottom of card
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)
  doc.setTextColor(100, 116, 139)
  doc.text(
    `Total: ${activeCount + inactiveCount} empleados registrados`,
    PW / 2,
    cardY + cardH - 3,
    { align: "center" }
  )

  // Confidentiality note above bottom bar
  doc.setFont("helvetica", "normal")
  doc.setFontSize(7.5)
  doc.setTextColor(148, 163, 184)
  doc.text("Documento de uso interno y confidencial", PW / 2, PH - 18, { align: "center" })

  // White text in bottom bar
  doc.setFont("helvetica", "normal")
  doc.setFontSize(7.5)
  doc.setTextColor(255, 255, 255)
  doc.text("RAFSA  |  Recursos Humanos", PW / 2, PH - 5, { align: "center" })
}

// ── Main export ────────────────────────────────────────────────────────────

export async function generateEmployeesPdf(
  employees: EmployeePdfData[],
  activeCount: number,
  inactiveCount: number,
): Promise<void> {
  // Dynamic import so Next.js doesn't try to SSR jsPDF
  const { default: jsPDF } = await import("jspdf")

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })

  // Layout constants
  const PW = 210
  const MT = 12        // margin top / bottom
  const ML = 12        // margin left / right
  const CW = PW - ML * 2   // content width = 186
  const EPP = 3              // employees per page
  const BH = (297 - MT * 2) / EPP  // block height ~91mm

  const PHOTO_SIZE = 36
  const PHOTO_X = ML
  const INFO_X = ML + PHOTO_SIZE + 7   // 55
  const INFO_W = CW - PHOTO_SIZE - 7   // 143

  // ── Cover page (first page) ──────────────────────────────────────────────
  await drawCoverPage(doc, activeCount, inactiveCount)

  // ── Convert all photos to base64 in parallel ─────────────────────────────
  const photos = await Promise.all(
    employees.map((e) =>
      e.signedPhotoUrl ? imageUrlToBase64(e.signedPhotoUrl) : Promise.resolve(null)
    )
  )

  // ── Draw each employee (always starts on a new page after cover) ──────────
  for (let i = 0; i < employees.length; i++) {
    const emp = employees[i]
    const blockIndex = i % EPP

    // New page: first employee gets a new page after cover, then every 3
    if (blockIndex === 0) {
      doc.addPage()
    }

    const yB = MT + blockIndex * BH   // top of this block

    // ── Photo ────────────────────────────────────────────────────────────
    const photoB64 = photos[i]
    if (photoB64) {
      try {
        doc.addImage(photoB64, "JPEG", PHOTO_X, yB + 4, PHOTO_SIZE, PHOTO_SIZE)
      } catch {
        // If format is unexpected, draw placeholder
        doc.setFillColor(220, 220, 220)
        doc.rect(PHOTO_X, yB + 4, PHOTO_SIZE, PHOTO_SIZE, "F")
      }
    } else {
      // Grey placeholder
      doc.setFillColor(220, 220, 220)
      doc.rect(PHOTO_X, yB + 4, PHOTO_SIZE, PHOTO_SIZE, "F")
      doc.setFontSize(7.5)
      doc.setTextColor(140, 140, 140)
      doc.text("Sin foto", PHOTO_X + PHOTO_SIZE / 2, yB + 4 + PHOTO_SIZE / 2 + 1, { align: "center" })
    }

    // ── Name ─────────────────────────────────────────────────────────────
    doc.setFont("helvetica", "bold")
    doc.setFontSize(13)
    doc.setTextColor(20, 20, 20)
    doc.text(truncate(emp.full_name, 38), INFO_X, yB + 11)

    // ── Status badge ─────────────────────────────────────────────────────
    const isActive = (emp.status || "").toLowerCase() === "active"
    const badgeLabel = isActive ? "Activo" : "Inactivo"
    const badgeBg: [number, number, number] = isActive ? [34, 197, 94] : [239, 68, 68]
    const badgeW = 22
    doc.setFillColor(...badgeBg)
    doc.roundedRect(INFO_X, yB + 14, badgeW, 5.5, 1.5, 1.5, "F")
    doc.setFontSize(7.5)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(255, 255, 255)
    doc.text(badgeLabel, INFO_X + badgeW / 2, yB + 18.1, { align: "center" })

    // ── Roles ─────────────────────────────────────────────────────────────
    const rolesText =
      emp.roles.length > 0
        ? emp.roles.map((r) => r.name).join(", ")
        : "Sin roles asignados"
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(80, 80, 80)
    const roleLines = doc.splitTextToSize(truncate(rolesText, 90), INFO_W)
    doc.text(roleLines.slice(0, 2), INFO_X, yB + 24)

    // ── Dates ─────────────────────────────────────────────────────────────
    const labelW = 27
    doc.setFontSize(8.5)

    doc.setFont("helvetica", "bold")
    doc.setTextColor(100, 100, 100)
    doc.text("Contratacion:", INFO_X, yB + 33)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(30, 30, 30)
    doc.text(fmtDate(emp.hire_date), INFO_X + labelW, yB + 33)

    doc.setFont("helvetica", "bold")
    doc.setTextColor(100, 100, 100)
    doc.text("Fecha de baja:", INFO_X, yB + 39)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(30, 30, 30)
    doc.text(fmtDate(emp.termination_date), INFO_X + labelW, yB + 39)

    // ── Salary section ────────────────────────────────────────────────────
    const salaryY = yB + 45

    // Light background
    doc.setFillColor(248, 250, 252)
    doc.rect(ML, salaryY, CW, 37, "F")

    // Subtle top border
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.2)
    doc.line(ML, salaryY, ML + CW, salaryY)

    // Section title
    doc.setFont("helvetica", "bold")
    doc.setFontSize(7.5)
    doc.setTextColor(100, 116, 139)
    doc.text("SALARIOS", ML + 3, salaryY + 5.5)

    // 4 fields: 2 on first row, 2 on second row
    const s = emp.salary
    const fields = [
      { label: "Sueldo Real",    value: fmtMXN(s?.real_salary) },
      { label: "Bonificacion",   value: fmtMXN(s?.bonus_amount) },
      { label: "Hora Extra",     value: fmtMXN(s?.overtime_hour_cost) },
      { label: "Viaticos",       value: fmtMXN(s?.viatics_amount) },
    ]

    const colW = CW / 2   // ~93mm per column
    fields.forEach((field, idx) => {
      const col = idx % 2
      const row = Math.floor(idx / 2)
      const fx = ML + col * colW + 3
      const fy = salaryY + 10 + row * 14

      doc.setFontSize(7.5)
      doc.setFont("helvetica", "normal")
      doc.setTextColor(120, 120, 120)
      doc.text(field.label, fx, fy)

      doc.setFontSize(10)
      doc.setFont("helvetica", "bold")
      doc.setTextColor(30, 30, 30)
      doc.text(field.value, fx, fy + 5.5)
    })

    // ── Divider between employees ─────────────────────────────────────────
    if (blockIndex < EPP - 1) {
      doc.setDrawColor(203, 213, 225)
      doc.setLineWidth(0.4)
      doc.line(ML, yB + BH - 1.5, PW - ML, yB + BH - 1.5)
    }
  }

  // Page numbers
  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7.5)
    doc.setTextColor(160, 160, 160)
    doc.text(
      `Pagina ${p} de ${totalPages}`,
      PW / 2,
      297 - 5,
      { align: "center" }
    )
  }

  doc.save("empleados-rafsa.pdf")
}
