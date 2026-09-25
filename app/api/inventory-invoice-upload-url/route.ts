import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const BUCKET_INVOICES = "inventory-invoices"

function safeFileExt(fileName: string) {
  const parts = fileName.split(".")
  if (parts.length <= 1) return ""
  const ext = parts[parts.length - 1].toLowerCase().replace(/[^a-z0-9]/g, "")
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
      .slice(0, 80) || "factura"
  )
}

function buildInvoicePath(orderId: string, fileName: string) {
  const ts = Date.now()
  const ext = safeFileExt(fileName)
  const base = sanitizeFileBaseName(fileName)
  return `orders/${orderId}/${ts}-${base}${ext}`
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const orderId = body?.orderId as string | undefined
    const fileName = body?.fileName as string | undefined

    if (!orderId || !fileName) {
      return NextResponse.json(
        { error: "Faltan orderId y/o fileName." },
        { status: 400 },
      )
    }

    const path = buildInvoicePath(orderId, fileName)

    const { data, error } = await supabase.storage
      .from(BUCKET_INVOICES)
      .createSignedUploadUrl(path)

    if (error || !data) {
      console.error("createSignedUploadUrl error:", error)
      return NextResponse.json(
        { error: "No se pudo generar la URL de subida.", details: error?.message },
        { status: 500 },
      )
    }

    return NextResponse.json({
      bucket: BUCKET_INVOICES,
      path,
      token: data.token,
      signedUrl: data.signedUrl ?? null,
    })
  } catch (err: any) {
    console.error("POST /api/inventory-invoice-upload-url error:", err)
    return NextResponse.json(
      { error: "Error inesperado generando URL de subida.", message: err?.message },
      { status: 500 },
    )
  }
}
