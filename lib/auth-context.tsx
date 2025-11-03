"use client"

import type React from "react"

import { createContext, useContext, useState, useEffect } from "react"
import { useRouter } from "next/navigation"

type UserRole = "admin" | "employee"

interface User {
  id: string
  email: string
  name: string
  role: UserRole
  avatar?: string
}

interface AuthContextType {
  user: User | null
  login: (email: string) => Promise<void>
  verifyCode: (code: string) => Promise<boolean>
  logout: () => void
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Mock user database
const MOCK_USERS: Record<string, User> = {
  "admin@construction.com": {
    id: "1",
    email: "admin@construction.com",
    name: "John Smith",
    role: "admin",
    avatar: "/professional-male-avatar.png",
  },
  "employee@construction.com": {
    id: "2",
    email: "employee@construction.com",
    name: "Sarah Johnson",
    role: "employee",
    avatar: "/professional-female-avatar.png",
  },
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    // Check for stored session
    const storedUser = localStorage.getItem("user")
    if (storedUser) {
      setUser(JSON.parse(storedUser))
    }
    setIsLoading(false)
  }, [])

  const login = async (email: string) => {
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 500))

    if (MOCK_USERS[email]) {
      setPendingEmail(email)
      router.push("/verify")
    } else {
      throw new Error("User not found")
    }
  }

  const verifyCode = async (code: string): Promise<boolean> => {
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Mock: accept code "123456" for demo
    if (code === "123456" && pendingEmail && MOCK_USERS[pendingEmail]) {
      const userData = MOCK_USERS[pendingEmail]
      setUser(userData)
      localStorage.setItem("user", JSON.stringify(userData))
      setPendingEmail(null)

      // Redirect based on role
      if (userData.role === "admin") {
        router.push("/admin")
      } else {
        router.push("/employee")
      }

      return true
    }

    return false
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem("user")
    router.push("/login")
  }

  return <AuthContext.Provider value={{ user, login, verifyCode, logout, isLoading }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
