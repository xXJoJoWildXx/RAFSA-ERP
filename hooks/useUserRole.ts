// src/hooks/useUserRole.ts
"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabaseClient"

type Role = "admin" | "user" | "worker" | null

export function useUserRole() {
  const [role, setRole] = useState<Role>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setRole(null)
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from("app_users")      // tu tabla
        .select("role")
        .eq("id", user.id)
        .single()

      if (error || !data) {
        setRole(null)
      } else {
        setRole(data.role)
      }

      setLoading(false)
    }

    load()
  }, [])

  return { role, loading }
}
