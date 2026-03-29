import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type BankingPostBody = {
  employeeId?: string
  bank_name?: string | null
  account_number?: string | null
  interbank_clabe?: string | null
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const employeeId = searchParams.get("employeeId")

    if (!employeeId) {
      return NextResponse.json(
        { error: "employeeId es requerido." },
        { status: 400 },
      )
    }

    const { data, error } = await supabase
      .from("employees")
      .select(
        `
        id,
        bank_name,
        account_number,
        interbank_clabe
      `,
      )
      .eq("id", employeeId)
      .single()

    if (error || !data) {
      console.error("Error fetching employee banking data:", error)
      return NextResponse.json(
        { error: "No se pudieron cargar los datos bancarios." },
        { status: 404 },
      )
    }

    return NextResponse.json({
      ok: true,
      banking: {
        bank_name: data.bank_name ?? "",
        account_number: data.account_number ?? "",
        interbank_clabe: data.interbank_clabe ?? "",
      },
    })
  } catch (err: any) {
    console.error("GET employee-banking unexpected error:", err)
    return NextResponse.json(
      {
        error: "Error inesperado al cargar los datos bancarios.",
        details: err?.message,
      },
      { status: 500 },
    )
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as BankingPostBody

    const employeeId = body.employeeId?.trim()

    if (!employeeId) {
      return NextResponse.json(
        { error: "employeeId es requerido." },
        { status: 400 },
      )
    }

    const bankName = body.bank_name?.trim() || null
    const accountNumber = body.account_number?.trim() || null
    const interbankClabe = body.interbank_clabe?.trim() || null

    const { data, error } = await supabase
      .from("employees")
      .update({
        bank_name: bankName,
        account_number: accountNumber,
        interbank_clabe: interbankClabe,
      })
      .eq("id", employeeId)
      .select(
        `
        id,
        bank_name,
        account_number,
        interbank_clabe
      `,
      )
      .single()

    if (error || !data) {
      console.error("Error updating employee banking data:", error)
      return NextResponse.json(
        {
          error: "No se pudieron guardar los datos bancarios.",
          details: error?.message,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({
      ok: true,
      banking: {
        bank_name: data.bank_name ?? "",
        account_number: data.account_number ?? "",
        interbank_clabe: data.interbank_clabe ?? "",
      },
    })
  } catch (err: any) {
    console.error("POST employee-banking unexpected error:", err)
    return NextResponse.json(
      {
        error: "Error inesperado al guardar los datos bancarios.",
        details: err?.message,
      },
      { status: 500 },
    )
  }
}
