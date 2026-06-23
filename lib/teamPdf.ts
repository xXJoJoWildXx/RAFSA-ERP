import jsPDF from "jspdf"

// ─── Paleta ────────────────────────────────────────────────────────────────
const NAVY   = [8,   18,  42 ] as const
const BLUE   = [1,   116, 189] as const
const GOLD   = [190, 145, 30 ] as const
const INK    = [28,  28,  28 ] as const
const MUTED  = [100, 120, 155] as const
const LIGHT_BG = [246, 248, 252] as const
const WHITE  = [255, 255, 255] as const
const DARK_BLUE_MID = [22, 58, 100] as const

// ─── Constantes de página ──────────────────────────────────────────────────
const PAGE_W  = 210
const PAGE_H  = 297
const MARGIN  = 14
const CONTENT_W = PAGE_W - MARGIN * 2   // 182

// ─── Tipos exportados ──────────────────────────────────────────────────────
export type TeamMemberPDF = {
  employee_id:   string
  full_name:     string
  position_title: string | null
  role_on_site:  string | null
  birth_date:    string | null   // YYYY-MM-DD
  hire_date:     string | null   // YYYY-MM-DD
  photoDataUrl:  string | null
}

export type ObraInfoPDF = {
  name:          string
  code:          string | null
  client_name:   string | null
  location_text: string | null
  status:        string
  start_date:    string | null
  end_date:      string | null
  notes:         string | null
}

// ─── Helpers ───────────────────────────────────────────────────────────────
const ROLE_LABELS: Record<string, string> = {
  director_obra:        "Director de Obra",
  pintor_muros_tiltup:  "Pintor de muros tilt-up",
  pintor_estructura:    "Pintor de estructura",
  oficial_pastero:      "Oficial Pastero",
  pintor_tablaroca:     "Pintor de Tablaroca",
  ayudante_obra:        "Ayudante de Obra",
}

function roleLabel(v: string | null): string {
  if (!v) return "Sin rol"
  return ROLE_LABELS[v] ?? v
}

function calcAge(birthDate: string | null): string {
  if (!birthDate) return "-"
  const today = new Date()
  const bd    = new Date(birthDate + "T00:00:00")
  let age = today.getFullYear() - bd.getFullYear()
  const m = today.getMonth() - bd.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--
  return `${age} años`
}

function fmtDate(d: string | null): string {
  if (!d) return "-"
  const [y, mo, day] = d.split("-")
  const months = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]
  return `${Number(day)} ${months[Number(mo) - 1]} ${y}`
}

function statusLabel(s: string): string {
  const m: Record<string, string> = {
    planned: "Planeado", in_progress: "En Progreso", paused: "Pausado", closed: "Cerrado",
  }
  return m[s] ?? s
}

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader()
      fr.onload  = () => resolve(fr.result as string)
      fr.onerror = reject
      fr.readAsDataURL(blob)
    })
  } catch { return null }
}

// ─── Header (solo página 1) ────────────────────────────────────────────────
// Devuelve la Y donde termina el bloque completo (header + nombre de obra)
function drawHeader(
  doc: jsPDF,
  logoDataUrl: string | null,
  date: Date,
  generatedBy: string,
  obraName: string,
): number {
  // Banda navy
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, PAGE_W, 30, "F")
  // Línea azul
  doc.setFillColor(...BLUE)
  doc.rect(0, 30, PAGE_W, 1.2, "F")

  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "PNG", MARGIN, 4, 26, 21)
  }

  // Título principal: DIRECTORIO DE EQUIPO DE OBRA (grande, blanco)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(15)
  doc.setTextColor(...WHITE)
  doc.text("DIRECTORIO DE EQUIPO DE OBRA", PAGE_W / 2, 11, { align: "center" })

  // Subtítulo: RAFSA INDUSTRIAL COATINGS (más pequeño, azul claro)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(155, 190, 240)
  doc.text("RAFSA INDUSTRIAL COATINGS", PAGE_W / 2, 18, { align: "center" })

  // Metadata: ciudad · generado por
  doc.setFontSize(6.5)
  doc.setTextColor(110, 150, 210)
  doc.text(`Guadalajara, Jalisco  ·  Generado por: ${generatedBy}`, PAGE_W / 2, 24, { align: "center" })

  // Fecha (derecha)
  doc.setFontSize(6.5)
  doc.setTextColor(110, 150, 210)
  doc.text(fmtDate(date.toISOString().slice(0, 10)), PAGE_W - MARGIN, 28.5, { align: "right" })

  // ── Bloque nombre de la obra (debajo de la banda) ──
  const obraBlockY = 32.2
  const obraBlockH = 22

  doc.setFillColor(245, 248, 253)
  doc.rect(0, obraBlockY, PAGE_W, obraBlockH, "F")

  // Etiqueta "Obra:"
  doc.setFont("helvetica", "normal")
  doc.setFontSize(7)
  doc.setTextColor(...MUTED)
  doc.text("Obra:", PAGE_W / 2, obraBlockY + 6, { align: "center" })

  // Nombre de la obra en grande
  doc.setFont("helvetica", "bold")
  doc.setFontSize(16)
  doc.setTextColor(...NAVY)
  const nameLines = doc.splitTextToSize(obraName, CONTENT_W - 10)
  doc.text(nameLines[0], PAGE_W / 2, obraBlockY + 16, { align: "center" })

  // Línea separadora bajo el bloque
  doc.setFillColor(...BLUE)
  doc.rect(0, obraBlockY + obraBlockH, PAGE_W, 0.6, "F")

  return obraBlockY + obraBlockH + 0.6 + 5  // y inicial del contenido
}

// ─── PÁGINA 1 — Información de la obra ────────────────────────────────────
function drawObraInfoPage(
  doc: jsPDF,
  obra: ObraInfoPDF,
  members: TeamMemberPDF[],
  logoDataUrl: string | null,
  date: Date,
  generatedBy: string,
) {
  let y = drawHeader(doc, logoDataUrl, date, generatedBy, obra.name)

  // ── Sección: Información de la Obra ──
  doc.setFillColor(12, 40, 78)
  doc.rect(MARGIN, y, CONTENT_W, 10, "F")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.setTextColor(...WHITE)
  doc.text("INFORMACIÓN DE LA OBRA", MARGIN + 4, y + 6.8)
  y += 10

  const col1x = MARGIN + 4
  const col2x = MARGIN + CONTENT_W / 2 + 2
  const lineH  = 9

  const infoRows: [string, string, string, string][] = [
    ["Nombre",        obra.name,                        "Código",   obra.code ?? "-"],
    ["Cliente",       obra.client_name ?? "-",           "Estatus",  statusLabel(obra.status)],
    ["Ubicación",     obra.location_text ?? "-",         "Inicio",   fmtDate(obra.start_date)],
    ["Total equipo",  `${members.length} persona(s)`,   "Cierre",   fmtDate(obra.end_date)],
  ]

  infoRows.forEach((row, i) => {
    const bg: [number,number,number] = i % 2 === 0 ? [245, 247, 252] : [255, 255, 255]
    doc.setFillColor(...bg); doc.rect(MARGIN, y, CONTENT_W, lineH, "F")

    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(...MUTED)
    doc.text(row[0].toUpperCase(), col1x, y + 3.2)
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...INK)
    doc.text(doc.splitTextToSize(row[1], CONTENT_W / 2 - 10)[0], col1x, y + 7.2)

    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(...MUTED)
    doc.text(row[2].toUpperCase(), col2x, y + 3.2)
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...INK)
    doc.text(row[3], col2x, y + 7.2)
    y += lineH
  })

  if (obra.notes) {
    y += 3
    doc.setFillColor(245, 247, 252); doc.rect(MARGIN, y, CONTENT_W, 15, "F")
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(...MUTED)
    doc.text("NOTAS", MARGIN + 4, y + 4)
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...INK)
    const noteLines = doc.splitTextToSize(obra.notes, CONTENT_W - 8)
    doc.text(noteLines.slice(0, 2), MARGIN + 4, y + 9)
    y += 18
  }

  y += 8

  // ── Sección: Puestos laborales ──
  doc.setFillColor(...DARK_BLUE_MID)
  doc.rect(MARGIN, y, CONTENT_W, 10, "F")
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...WHITE)
  doc.text("PUESTOS LABORALES EN LA OBRA", MARGIN + 4, y + 6.8)
  y += 10

  // Cabecera de tabla
  doc.setFillColor(30, 70, 115); doc.rect(MARGIN, y, CONTENT_W, 8, "F")
  doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...WHITE)
  doc.text("ROL / ACTIVIDAD",        MARGIN + 4,            y + 5.5)
  doc.text("MIEMBROS",              PAGE_W - MARGIN - 30,  y + 5.5)
  doc.text("NOMBRES",               MARGIN + 65,           y + 5.5)
  y += 8

  // Agrupamos por role
  type RoleGroup = { role: string; members: TeamMemberPDF[] }
  const groups: RoleGroup[] = []
  const seen = new Set<string>()

  // Directores primero
  const dirMembers = members.filter(m => m.role_on_site === "director_obra")
  if (dirMembers.length > 0) {
    groups.push({ role: "director_obra", members: dirMembers })
    seen.add("director_obra")
  }
  members.forEach(m => {
    const k = m.role_on_site ?? "sin_rol"
    if (!seen.has(k)) { seen.add(k); groups.push({ role: k, members: [] }) }
    if (k !== "director_obra") groups.find(g => g.role === k)!.members.push(m)
  })

  groups.forEach((g, gi) => {
    const isDir = g.role === "director_obra"
    const rowH  = Math.max(8, 7 + (g.members.length - 1) * 5.5)

    const bg: [number,number,number] = isDir
      ? [255, 248, 225]
      : (gi % 2 === 0 ? [248, 248, 248] : [255, 255, 255])

    doc.setFillColor(...bg)
    doc.rect(MARGIN, y, CONTENT_W, rowH, "F")

    // Rol
    doc.setFont("helvetica", isDir ? "bold" : "normal")
    doc.setFontSize(8)
    doc.setTextColor(isDir ? 140 : 28, isDir ? 90 : 28, isDir ? 10 : 28)
    doc.text(roleLabel(g.role), MARGIN + 4, y + 5.5)

    // Cantidad
    doc.setFont("helvetica", "bold"); doc.setFontSize(8)
    doc.setTextColor(...INK)
    doc.text(String(g.members.length), PAGE_W - MARGIN - 25, y + 5.5)

    // Nombres en columna
    g.members.forEach((m, mi) => {
      doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...INK)
      doc.text(`· ${m.full_name}`, MARGIN + 65, y + 5.5 + mi * 5.5)
    })

    y += rowH
  })

  // Fila total
  doc.setFillColor(...NAVY); doc.rect(MARGIN, y, CONTENT_W, 9, "F")
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...WHITE)
  doc.text("TOTAL EQUIPO DE LA OBRA", MARGIN + 4, y + 6.2)
  doc.text(String(members.length), PAGE_W - MARGIN - 25, y + 6.2)
  y += 9
}

// ─── TARJETA — Director de Obra ────────────────────────────────────────────
const DIR_H = 58

function drawDirectorCard(
  doc: jsPDF,
  m: TeamMemberPDF,
  x: number,
  y: number,
  w: number,
) {
  // Fondo gris claro (igual que tarjetas regulares)
  doc.setFillColor(...LIGHT_BG)
  doc.rect(x, y, w, DIR_H, "F")

  // Franja dorada arriba
  doc.setFillColor(...GOLD)
  doc.rect(x, y, w, 1.5, "F")

  // Franja dorada izquierda
  doc.setFillColor(...GOLD)
  doc.rect(x, y + 1.5, 1, DIR_H - 1.5, "F")

  // ── Foto ──
  const PHOTO = 34
  const px = x + 7
  const py = y + 8

  if (m.photoDataUrl) {
    doc.setFillColor(215, 200, 160)
    doc.rect(px - 1.5, py - 1.5, PHOTO + 3, PHOTO + 3, "F")
    doc.addImage(m.photoDataUrl, "JPEG", px, py, PHOTO, PHOTO)
  } else {
    doc.setFillColor(235, 225, 195)
    doc.rect(px, py, PHOTO, PHOTO, "F")
    doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.setTextColor(160, 130, 60)
    const ini = m.full_name.split(" ").slice(0, 2).map(p => p[0] ?? "").join("")
    doc.text(ini, px + PHOTO / 2, py + PHOTO / 2 + 3, { align: "center" })
  }

  // ── Info (derecha de la foto) ──
  const infoX = px + PHOTO + 6
  const infoW = w - (PHOTO + 6 + 7 + 5)

  // Badge dorado "DIRECTOR DE OBRA"
  doc.setFillColor(...GOLD)
  doc.rect(infoX, py, infoW, 6, "F")
  doc.setFont("helvetica", "bold"); doc.setFontSize(5.5); doc.setTextColor(...INK)
  doc.text("DIRECTOR DE OBRA", infoX + infoW / 2, py + 4.2, { align: "center" })

  // Nombre
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...INK)
  const nameLines = doc.splitTextToSize(m.full_name, infoW)
  doc.text(nameLines.slice(0, 2), infoX, py + 13)

  // Puesto
  if (m.position_title) {
    doc.setFont("helvetica", "italic"); doc.setFontSize(7); doc.setTextColor(90, 110, 145)
    doc.text(m.position_title, infoX, py + 13 + nameLines.slice(0, 2).length * 5.5)
  }

  // ── Detalles bajo la foto ──
  const detY = py + PHOTO + 5

  // Separador dorado tenue
  doc.setDrawColor(200, 170, 80); doc.setLineWidth(0.4)
  doc.line(x + 4, detY, x + w - 4, detY)

  const dLY = detY + 4

  // Edad
  doc.setFont("helvetica", "bold"); doc.setFontSize(6); doc.setTextColor(...MUTED)
  doc.text("EDAD", infoX, dLY)
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...INK)
  doc.text(calcAge(m.birth_date), infoX, dLY + 4.5)

  // Contratación
  const colB = infoX + infoW / 2
  doc.setFont("helvetica", "bold"); doc.setFontSize(6); doc.setTextColor(...MUTED)
  doc.text("CONTRATACIÓN", colB, dLY)
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...INK)
  doc.text(fmtDate(m.hire_date), colB, dLY + 4.5)

  // Actividades bajo la info
  const actY = py + 13 + nameLines.slice(0, 2).length * 5.5 + (m.position_title ? 8 : 5)
  if (actY < detY - 1) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(6); doc.setTextColor(...MUTED)
    doc.text("ACTIVIDADES", infoX, actY)
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...INK)
    doc.text(roleLabel(m.role_on_site), infoX, actY + 4)
  }
}

// ─── TARJETA — Miembro regular ─────────────────────────────────────────────
const CARD_W  = 88
const CARD_H  = 72
const CARD_GAP = 6
const COL1_X  = MARGIN
const COL2_X  = MARGIN + CARD_W + CARD_GAP

function drawRegularCard(
  doc: jsPDF,
  m: TeamMemberPDF,
  x: number,
  y: number,
) {
  // Fondo
  doc.setFillColor(...LIGHT_BG)
  doc.rect(x, y, CARD_W, CARD_H, "F")

  // Franja azul arriba
  doc.setFillColor(...BLUE)
  doc.rect(x, y, CARD_W, 1.5, "F")

  // Franja azul izquierda delgada
  doc.setFillColor(...BLUE)
  doc.rect(x, y + 1.5, 1, CARD_H - 1.5, "F")

  // ── Foto ──
  const PHOTO = 24
  const px = x + 6
  const py = y + 7

  if (m.photoDataUrl) {
    doc.setFillColor(180, 205, 235)
    doc.rect(px - 1, py - 1, PHOTO + 2, PHOTO + 2, "F")
    doc.addImage(m.photoDataUrl, "JPEG", px, py, PHOTO, PHOTO)
  } else {
    doc.setFillColor(220, 232, 248)
    doc.rect(px, py, PHOTO, PHOTO, "F")
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(100, 145, 200)
    const ini = m.full_name.split(" ").slice(0, 2).map(p => p[0] ?? "").join("")
    doc.text(ini, px + PHOTO / 2, py + PHOTO / 2 + 2.5, { align: "center" })
  }

  // ── Info ──
  const infoX = px + PHOTO + 5
  const infoW = CARD_W - PHOTO - 13

  // Badge rol azul
  doc.setFillColor(...BLUE)
  doc.rect(infoX, py, infoW, 5.5, "F")
  doc.setFont("helvetica", "bold"); doc.setFontSize(4.8); doc.setTextColor(...WHITE)
  const roleTxt = roleLabel(m.role_on_site).toUpperCase()
  const roleLines = doc.splitTextToSize(roleTxt, infoW - 2)
  doc.text(roleLines[0], infoX + infoW / 2, py + 3.8, { align: "center" })

  // Nombre
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...INK)
  const nameLines = doc.splitTextToSize(m.full_name, infoW)
  doc.text(nameLines.slice(0, 2), infoX, py + 11.5)

  // Puesto
  if (m.position_title) {
    doc.setFont("helvetica", "italic"); doc.setFontSize(6); doc.setTextColor(90, 110, 145)
    doc.text(m.position_title, infoX, py + 11.5 + nameLines.slice(0, 2).length * 4.5 + 1)
  }

  // ── Separador ──
  const sepY = py + PHOTO + 4
  doc.setDrawColor(210, 220, 235); doc.setLineWidth(0.4)
  doc.line(x + 4, sepY, x + CARD_W - 4, sepY)

  // ── Detalles ──
  const dY = sepY + 5

  doc.setFont("helvetica", "bold"); doc.setFontSize(5.5); doc.setTextColor(...MUTED)
  doc.text("EDAD", x + 6, dY)
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...INK)
  doc.text(calcAge(m.birth_date), x + 6, dY + 4.2)

  doc.setFont("helvetica", "bold"); doc.setFontSize(5.5); doc.setTextColor(...MUTED)
  doc.text("CONTRATACIÓN", x + 6, dY + 9)
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...INK)
  doc.text(fmtDate(m.hire_date), x + 6, dY + 13)

  // Actividades (debajo de la foto, a la izquierda)
  doc.setFont("helvetica", "bold"); doc.setFontSize(5.5); doc.setTextColor(...MUTED)
  doc.text("ACTIVIDADES", x + 6, dY + 18.5)
  doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(...INK)
  const actLines = doc.splitTextToSize(roleLabel(m.role_on_site), CARD_W - 12)
  doc.text(actLines.slice(0, 2), x + 6, dY + 22.5)
}

// ─── FUNCIÓN PRINCIPAL ─────────────────────────────────────────────────────
export async function generateTeamPdf(
  obra: ObraInfoPDF,
  members: TeamMemberPDF[],
  date: Date = new Date(),
  generatedBy = "Sistema",
): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })

  // Logo
  let logoDataUrl: string | null = null
  try {
    const res  = await fetch("/brand/rafsa-logo.png")
    const blob = await res.blob()
    logoDataUrl = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader()
      fr.onload  = () => resolve(fr.result as string)
      fr.onerror = reject
      fr.readAsDataURL(blob)
    })
  } catch { /* opcional */ }

  // ── Página 1: info de la obra ──────────────────────────────────────────
  drawObraInfoPage(doc, obra, members, logoDataUrl, date, generatedBy)

  if (members.length === 0) {
    doc.save(`equipo-${obra.code ?? "obra"}.pdf`)
    return
  }

  // ── Páginas de credenciales ────────────────────────────────────────────
  const directors = members.filter(m => m.role_on_site === "director_obra")
  const regulars  = members.filter(m => m.role_on_site !== "director_obra")

  // Y inicial para páginas de credenciales (sin header)
  const CRED_START_Y = MARGIN

  // Helper: nueva página limpia para credenciales
  function newCredPage() {
    doc.addPage()
    return CRED_START_Y
  }

  doc.addPage()
  let y = CRED_START_Y

  // Título "Equipo de la obra" solo en la primera página de credenciales
  doc.setFont("helvetica", "bold")
  doc.setFontSize(20)
  doc.setTextColor(...NAVY)
  doc.text("Equipo de la obra", PAGE_W / 2, y + 12, { align: "center" })
  // Línea decorativa bajo el título
  doc.setFillColor(...BLUE)
  doc.rect(MARGIN + 30, y + 15, CONTENT_W - 60, 0.8, "F")
  y += 24

  // Separador de sección directores
  if (directors.length > 0) {
    doc.setFillColor(...GOLD)
    doc.rect(MARGIN, y, CONTENT_W, 0.8, "F")
    y += 1.5
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5)
    doc.setTextColor(140, 90, 10)
    doc.text("DIRECTORES DE OBRA", MARGIN + 2, y + 4.5)
    y += 8

    for (const dir of directors) {
      if (y + DIR_H > PAGE_H - MARGIN) {
        y = newCredPage()
      }
      drawDirectorCard(doc, dir, MARGIN, y, CONTENT_W)
      y += DIR_H + 5
    }
  }

  // Separador de sección equipo
  if (regulars.length > 0) {
    y += 4
    if (y + 15 > PAGE_H - MARGIN) {
      y = newCredPage()
    }
    doc.setFillColor(...BLUE)
    doc.rect(MARGIN, y, CONTENT_W, 0.8, "F")
    y += 1.5
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5)
    doc.setTextColor(...DARK_BLUE_MID)
    doc.text("EQUIPO DE OBRA", MARGIN + 2, y + 4.5)
    y += 8

    for (let i = 0; i < regulars.length; i += 2) {
      if (y + CARD_H > PAGE_H - MARGIN) {
        y = newCredPage()
      }
      drawRegularCard(doc, regulars[i], COL1_X, y)
      if (regulars[i + 1]) {
        drawRegularCard(doc, regulars[i + 1], COL2_X, y)
      }
      y += CARD_H + CARD_GAP
    }
  }

  const safeName = (obra.code ?? obra.name).replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 40)
  doc.save(`equipo-${safeName}.pdf`)
}

// ─── Utilidad para cargar fotos desde la API ───────────────────────────────
export async function loadPhotoDataUrl(photoPath: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/employee-photo?path=${encodeURIComponent(photoPath)}&expiresIn=120`)
    if (!res.ok) return null
    const { signedUrl } = await res.json() as { signedUrl?: string }
    if (!signedUrl) return null
    return await toDataUrl(signedUrl)
  } catch { return null }
}
