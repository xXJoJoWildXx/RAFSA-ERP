import { createBrowserClient } from "@supabase/ssr"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL is required (env var is missing)")
}

if (!supabaseAnonKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY is required (env var is missing)",
  )
}

// createBrowserClient persiste la sesión tanto en localStorage como en cookies,
// lo que permite que el middleware de Next.js la lea server-side.
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)
