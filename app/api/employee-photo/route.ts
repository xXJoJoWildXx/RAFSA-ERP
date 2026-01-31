import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const BUCKET_EMPLOYEE_DOCS = "employee-documents"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const path = searchParams.get("path") // storage_path guardado en employees.photo_url
    const expiresIn = Number(searchParams.get("expiresIn") || "3600")

    if (!path) {
      return NextResponse.json({ error: "Missing path" }, { status: 400 })
    }

    const { data, error } = await supabase.storage
      .from(BUCKET_EMPLOYEE_DOCS)
      .createSignedUrl(path, expiresIn)

    if (error) {
      return NextResponse.json(
        { error: "Could not create signed url", details: error.message },
        { status: 500 },
      )
    }

    return NextResponse.json({ signedUrl: data.signedUrl })
  } catch (err: any) {
    return NextResponse.json(
      { error: "Unexpected error", message: err?.message },
      { status: 500 },
    )
  }
}
