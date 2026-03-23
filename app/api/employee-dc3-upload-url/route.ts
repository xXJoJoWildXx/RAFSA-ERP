import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

// Este endpoint genera URLs firmadas para subir documentos DC3 de cada empleado. El cliente debe enviar employeeId y fileName, y se devuelve una URL de subida válida por 30 minutos.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const BUCKET_DC3 = "employee-documents"
const DC3_FOLDER_PREFIX = "dc3"

function safeFileExt(fileName: string) {
  const parts = fileName.split(".")
  if (parts.length <= 1) return ""
  const ext = parts[parts.length - 1]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
  return ext ? `.${ext}` : ""
}

function sanitizeFileBaseName(fileName: string) {
  const base = fileName.replace(/\.[^/.]+$/, "")
  return (
    base
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-_]/g, "")
      .slice(0, 80) || "archivo"
  )
}

function buildDc3Path(employeeId: string, fileName: string) {
  const ts = Date.now()
  const ext = safeFileExt(fileName)
  const base = sanitizeFileBaseName(fileName)
  return `employees/${employeeId}/${DC3_FOLDER_PREFIX}/${ts}-${base}${ext}`
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const employeeId = body?.employeeId as string | undefined
    const fileName = body?.fileName as string | undefined

    if (!employeeId || !fileName) {
      return NextResponse.json(
        { error: "Faltan employeeId y/o fileName." },
        { status: 400 },
      )
    }

    const path = buildDc3Path(employeeId, fileName)

    const { data, error } = await supabase.storage
      .from(BUCKET_DC3)
      .createSignedUploadUrl(path)

    if (error || !data) {
      console.error("createSignedUploadUrl error:", error)
      return NextResponse.json(
        {
          error: "No se pudo generar la URL de subida.",
          details: error?.message,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({
      bucket: BUCKET_DC3,
      path,
      token: data.token,
      signedUrl: data.signedUrl ?? null,
    })
  } catch (err: any) {
    console.error("POST /api/employee-dc3-upload-url unexpected error:", err)
    return NextResponse.json(
      {
        error: "Error inesperado generando URL de subida.",
        message: err?.message,
      },
      { status: 500 },
    )
  }
}