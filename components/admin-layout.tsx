"use client"

import type React from "react"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  LayoutDashboard,
  Building2,
  FileText,
  Users,
  Bell,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Settings,
  Search,
  Truck,
} from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { useState, useEffect, useCallback } from "react"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabaseClient"

/* ───────────────────────────────────────────
   Navigation Config (badges are fetched live)
   ─────────────────────────────────────────── */
type NavItem = {
  name: string
  href: string
  icon: typeof LayoutDashboard
  badgeKey: "obras" | "empleados" | null
}

const navigation: NavItem[] = [
  { name: "Dashboard", href: "/admin", icon: LayoutDashboard, badgeKey: null },
  { name: "Obras", href: "/admin/projects", icon: Building2, badgeKey: "obras" },
  { name: "Empleados", href: "/admin/employees", icon: Users, badgeKey: "empleados" },
  { name: "Proveedores", href: "/admin/proveedores", icon: Truck, badgeKey: null },
]

/* ───────────────────────────────────────────
   Animated Grid Background (matches Login)
   ─────────────────────────────────────────── */
function SidebarGridBg() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Subtle grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(1,116,189,0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(1,116,189,0.5) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
      />
      {/* Top glow */}
      <div
        className="absolute -top-20 left-1/2 -translate-x-1/2 w-80 h-40 rounded-full blur-[80px]"
        style={{ background: "radial-gradient(ellipse, rgba(1,116,189,0.12) 0%, transparent 70%)" }}
      />
      {/* Bottom accent line */}
      <div
        className="absolute bottom-0 left-6 right-6 h-px"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(1,116,189,0.2), transparent)",
        }}
      />
    </div>
  )
}

/* ───────────────────────────────────────────
   Pulse Dot Component
   ─────────────────────────────────────────── */
function PulseDot({ color = "#0174bd" }: { color?: string }) {
  return (
    <span className="relative flex h-2 w-2">
      <span
        className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
        style={{ backgroundColor: color }}
      />
      <span
        className="relative inline-flex rounded-full h-2 w-2"
        style={{ backgroundColor: color }}
      />
    </span>
  )
}

/* ───────────────────────────────────────────
   Admin Layout
   ─────────────────────────────────────────── */
export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [searchFocused, setSearchFocused] = useState(false)
  const [badgeCounts, setBadgeCounts] = useState<Record<string, number | null>>({
    obras: null,
    empleados: null,
  })

  useEffect(() => {
    setMounted(true)
  }, [])

  // Fetch live counts from Supabase
  const fetchBadgeCounts = useCallback(async () => {
    try {
      const [obrasRes, empleadosRes] = await Promise.all([
        supabase
          .from("obras")
          .select("id", { count: "exact", head: true })
          .in("status", ["in_progress", "planned"]),
        supabase
          .from("employees")
          .select("id", { count: "exact", head: true })
          .eq("status", "active"),
      ])

      setBadgeCounts({
        obras: obrasRes.count ?? 0,
        empleados: empleadosRes.count ?? 0,
      })
    } catch (error) {
      console.error("Error fetching badge counts:", error)
    }
  }, [])

  useEffect(() => {
    fetchBadgeCounts()
    // Refresh counts every 60 seconds
    const interval = setInterval(fetchBadgeCounts, 60_000)
    return () => clearInterval(interval)
  }, [fetchBadgeCounts])

  const initials =
    user?.email
      ?.split("@")[0]
      .split(/[.\s_]/)
      .filter(Boolean)
      .map((n) => n[0]?.toUpperCase())
      .join("") || "U"

  const userMetadata = (user as any)?.user_metadata
  const displayName = userMetadata?.display_name || user?.email || "Usuario"

  const roleLabel =
    user?.role === "admin"
      ? "Administrador"
      : user?.role === "user"
        ? "Usuario de oficina"
        : user?.role === "worker"
          ? "Trabajador de obra"
          : ""

  return (
    <div className="min-h-screen bg-[#f0f2f5]">
      {/* ═══════════════════════════════════════
          Inline Styles for animations
         ═══════════════════════════════════════ */}
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');

        /* ── Nav item hover glow ── */
        .nav-item-glow {
          position: relative;
          overflow: hidden;
        }
        .nav-item-glow::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(1, 116, 189, 0.06),
            transparent
          );
          transition: left 0.5s ease;
        }
        .nav-item-glow:hover::before {
          left: 100%;
        }

        /* ── Active nav indicator slide-in ── */
        .nav-active-bar {
          animation: slideInBar 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        @keyframes slideInBar {
          from { transform: translateY(-50%) scaleY(0); opacity: 0; }
          to   { transform: translateY(-50%) scaleY(1); opacity: 1; }
        }

        /* ── Badge pulse ── */
        .badge-glow {
          animation: badgePulse 2s ease-in-out infinite;
        }
        @keyframes badgePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(1, 116, 189, 0.3); }
          50%      { box-shadow: 0 0 0 4px rgba(1, 116, 189, 0); }
        }

        /* ── Stagger fade-in for nav items ── */
        .nav-stagger {
          opacity: 0;
          transform: translateX(-8px);
          animation: navFadeIn 0.4s ease forwards;
        }
        @keyframes navFadeIn {
          to { opacity: 1; transform: translateX(0); }
        }

        /* ── Header search expand ── */
        .search-expand {
          transition: width 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
                      background-color 0.2s ease,
                      border-color 0.2s ease;
        }

        /* ── Notification dot bounce ── */
        .notif-dot {
          animation: notifBounce 1.5s ease-in-out infinite;
        }
        @keyframes notifBounce {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.3); }
        }

        /* ── Card hover lift ── */
        .header-action-btn {
          transition: transform 0.2s ease, background-color 0.2s ease;
        }
        .header-action-btn:hover {
          transform: translateY(-1px);
        }
        .header-action-btn:active {
          transform: translateY(0) scale(0.97);
        }

        /* ── Sidebar user card hover ── */
        .user-card-hover {
          transition: background-color 0.3s ease, transform 0.2s ease;
        }
        .user-card-hover:hover {
          background-color: rgba(1, 116, 189, 0.08);
          transform: translateX(2px);
        }

        /* ── Logo float animation ── */
        .logo-float {
          animation: logoFloat 6s ease-in-out infinite;
        }
        @keyframes logoFloat {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-2px); }
        }

        /* ── Sidebar border shimmer ── */
        .sidebar-border-shimmer::after {
          content: '';
          position: absolute;
          top: 0;
          right: -1px;
          width: 1px;
          height: 100%;
          background: linear-gradient(
            180deg,
            transparent 0%,
            rgba(1, 116, 189, 0.3) 30%,
            rgba(1, 116, 189, 0.5) 50%,
            rgba(1, 116, 189, 0.3) 70%,
            transparent 100%
          );
          animation: shimmer 4s ease-in-out infinite;
        }
        @keyframes shimmer {
          0%, 100% { opacity: 0.3; }
          50%      { opacity: 1; }
        }
      `}</style>

      {/* ═══════════════════════════════════════
          Mobile backdrop
         ═══════════════════════════════════════ */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-[#003353]/80 backdrop-blur-sm z-40 lg:hidden"
          style={{ animation: "navFadeIn 0.2s ease forwards" }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ═══════════════════════════════════════
          SIDEBAR — Dark, matching Login aesthetic
         ═══════════════════════════════════════ */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-50 h-full w-[280px] transition-transform duration-300 ease-out lg:translate-x-0 sidebar-border-shimmer",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{
          background: "linear-gradient(175deg, #002740 0%, #001520 50%, #000d14 100%)",
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        }}
      >
        <SidebarGridBg />

        <div className="relative flex flex-col h-full z-10">
          {/* ── Logo ── */}
          <div className="flex items-center justify-between h-[88px] px-6 border-b border-white/[0.06]">
            <Link href="/admin" className="flex items-center gap-3 group logo-float">
              <div className="relative w-[150px] h-[45px] flex-shrink-0">
                <Image
                  src="/brand/icon-rafsa.png"
                  alt="RAFSA Industrial Coatings"
                  fill
                  className="object-contain transition-all duration-500 group-hover:brightness-125 group-hover:drop-shadow-[0_0_12px_rgba(1,116,189,0.4)]"
                  priority
                />
              </div>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all duration-200"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* ── ERP System Label ── */}
          <div className="px-6 py-4 border-b border-white/[0.04]">
            <div className="flex items-center gap-2.5">
              <PulseDot color="#10b981" />
              <span
                className="text-[10px] font-semibold tracking-[0.25em] uppercase"
                style={{ color: "rgba(1,116,189,0.7)" }}
              >
                Sistema ERP · V2.0
              </span>
            </div>
          </div>

          {/* ── Navigation ── */}
          <nav className="flex-1 px-3 py-6 overflow-y-auto">
            <p className="px-4 mb-4 text-[9px] font-bold tracking-[0.3em] uppercase text-slate-600">
              Navegación
            </p>

            <div className="space-y-1">
              {navigation.map((item, index) => {
                const Icon = item.icon
                const isActive = pathname === item.href

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      "nav-item-glow nav-stagger group relative flex items-center gap-3 px-4 py-3 rounded-xl text-[13px] font-medium transition-all duration-200",
                      isActive
                        ? "bg-[#0174bd]/10 text-white"
                        : "text-slate-400 hover:text-slate-200"
                    )}
                    style={{
                      animationDelay: mounted ? `${index * 80}ms` : "0ms",
                    }}
                    onClick={() => setSidebarOpen(false)}
                  >
                    {/* Active bar */}
                    {isActive && (
                      <span
                        className="nav-active-bar absolute left-0 top-1/2 w-[3px] h-7 rounded-r-full"
                        style={{
                          background: "linear-gradient(180deg, #0174bd, #4da8e8)",
                          boxShadow: "0 0 8px rgba(1,116,189,0.5)",
                        }}
                      />
                    )}

                    {/* Icon container */}
                    <span
                      className={cn(
                        "flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-300",
                        isActive
                          ? "bg-[#0174bd]/15 shadow-[0_0_12px_rgba(1,116,189,0.15)]"
                          : "bg-white/[0.03] group-hover:bg-white/[0.06] group-hover:shadow-[0_0_8px_rgba(1,116,189,0.08)]"
                      )}
                    >
                      <Icon
                        className={cn(
                          "w-[18px] h-[18px] transition-all duration-300",
                          isActive
                            ? "text-[#4da8e8] drop-shadow-[0_0_4px_rgba(77,168,232,0.5)]"
                            : "text-slate-500 group-hover:text-slate-300"
                        )}
                      />
                    </span>

                    {item.name}

                    {/* Badge — live count from DB */}
                    {item.badgeKey && badgeCounts[item.badgeKey] !== null && (
                      <span
                        className={cn(
                          "ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full transition-all duration-300",
                          isActive
                            ? "bg-[#0174bd]/20 text-[#4da8e8] badge-glow"
                            : "bg-white/[0.05] text-slate-500 group-hover:bg-white/[0.08] group-hover:text-slate-400"
                        )}
                      >
                        {badgeCounts[item.badgeKey]}
                      </span>
                    )}

                    {/* Active chevron */}
                    {isActive && (
                      <ChevronRight className="w-4 h-4 ml-auto text-[#0174bd]/50" />
                    )}
                  </Link>
                )
              })}
            </div>
          </nav>

          {/* ── Sidebar Footer: User ── */}
          <div className="px-3 pb-3">
            {/* Mini divider */}
            <div
              className="mx-4 mb-3 h-px"
              style={{ background: "linear-gradient(90deg, transparent, rgba(1,116,189,0.15), transparent)" }}
            />

            <div className="user-card-hover flex items-center gap-3 px-4 py-3 rounded-xl cursor-default">
              {/* Avatar */}
              <div
                className="relative w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                style={{
                  background: "linear-gradient(135deg, rgba(1,116,189,0.2), rgba(1,116,189,0.05))",
                  border: "1px solid rgba(1,116,189,0.2)",
                  color: "#4da8e8",
                  boxShadow: "0 0 12px rgba(1,116,189,0.1)",
                }}
              >
                {initials}
                {/* Online indicator */}
                <span
                  className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
                  style={{
                    backgroundColor: "#10b981",
                    borderColor: "#001520",
                    boxShadow: "0 0 6px rgba(16,185,129,0.4)",
                  }}
                />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-slate-200 truncate">
                  {displayName}
                </p>
                <p className="text-[11px] text-slate-500 truncate">
                  {roleLabel}
                </p>
              </div>

              <button
                onClick={logout}
                className="p-2 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
                title="Cerrar sesión"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>

            {/* Brand footer */}
            <div className="mt-2 px-4">
              <p
                className="text-[9px] font-medium tracking-[0.2em] uppercase"
                style={{ color: "rgba(100,116,139,0.4)" }}
              >
                RAFSA Industrial Coatings
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* ═══════════════════════════════════════
          MAIN CONTENT AREA — Light, clean
         ═══════════════════════════════════════ */}
      <div className="lg:pl-[280px]" style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
        {/* ── Header ── */}
        <header
          className="sticky top-0 z-30 h-16 bg-white/70 backdrop-blur-xl border-b border-slate-200/60"
          style={{
            boxShadow: "0 1px 3px rgba(0,51,83,0.04)",
          }}
        >
          <div className="flex items-center justify-between h-full px-6">
            {/* Mobile hamburger */}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden rounded-lg text-slate-600 hover:text-[#003353] hover:bg-[#0174bd]/5 header-action-btn"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </Button>

            {/* Page title + breadcrumb */}
            <div className="flex-1 lg:flex-none flex items-center gap-3">
              <h2 className="hidden lg:block text-[15px] font-semibold text-[#003353] tracking-tight">
                {navigation.find((n) => n.href === pathname)?.name || "RAFSA ERP"}
              </h2>
              <span className="hidden lg:block text-[10px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                Admin
              </span>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-1">
              {/* Search bar */}
              <div
                className={cn(
                  "search-expand relative flex items-center rounded-xl border overflow-hidden",
                  searchFocused
                    ? "w-64 bg-white border-[#0174bd]/30 shadow-[0_0_0_3px_rgba(1,116,189,0.08)]"
                    : "w-40 bg-slate-50 border-slate-200/60 hover:border-slate-300"
                )}
              >
                <Search className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Buscar..."
                  className="w-full h-9 pl-9 pr-3 text-[13px] bg-transparent outline-none text-slate-700 placeholder:text-slate-400"
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                />
              </div>

              {/* Settings */}
              <Button
                variant="ghost"
                size="icon"
                className="rounded-xl text-slate-400 hover:text-[#003353] hover:bg-[#0174bd]/5 header-action-btn hidden md:flex"
              >
                <Settings className="w-[18px] h-[18px]" />
              </Button>

              {/* Notifications */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative rounded-xl text-slate-400 hover:text-[#003353] hover:bg-[#0174bd]/5 header-action-btn"
                  >
                    <Bell className="w-[18px] h-[18px]" />
                    <span
                      className="notif-dot absolute top-2 right-2 w-2 h-2 rounded-full"
                      style={{
                        backgroundColor: "#ef4444",
                        boxShadow: "0 0 6px rgba(239,68,68,0.4)",
                      }}
                    />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-80 rounded-2xl shadow-xl border-slate-200/80 bg-white p-0 overflow-hidden"
                >
                  {/* Notification header with dark accent */}
                  <div
                    className="px-4 py-3 border-b border-slate-100"
                    style={{
                      background: "linear-gradient(135deg, #003353, #002740)",
                    }}
                  >
                    <p className="text-sm font-semibold text-white">Notificaciones</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">2 nuevas</p>
                  </div>
                  <div className="p-2 space-y-1">
                    <div className="p-3 rounded-xl bg-[#0174bd]/[0.04] border border-[#0174bd]/10 hover:bg-[#0174bd]/[0.07] transition-colors duration-200 cursor-pointer">
                      <p className="text-sm font-medium text-[#003353]">
                        Nuevo documento subido
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Planos_Estructura_Q4.pdf — Carlos M.
                      </p>
                      <p className="text-[10px] text-[#0174bd] mt-1.5 font-medium">
                        Hace 5 min
                      </p>
                    </div>
                    <div className="p-3 rounded-xl hover:bg-slate-50 transition-colors duration-200 cursor-pointer">
                      <p className="text-sm font-medium text-[#003353]">
                        Estatus de obra actualizado
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Nave Industrial Apodaca → En Progreso
                      </p>
                      <p className="text-[10px] text-slate-400 mt-1.5 font-medium">
                        Hace 1 hora
                      </p>
                    </div>
                  </div>
                  <div className="px-4 py-2.5 border-t border-slate-100">
                    <button className="text-xs font-semibold text-[#0174bd] hover:text-[#003353] transition-colors duration-200 w-full text-center">
                      Ver todas las notificaciones
                    </button>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Divider */}
              <div className="hidden md:block w-px h-8 mx-2 bg-slate-200" />

              {/* User menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="gap-2.5 rounded-xl px-2 hover:bg-[#0174bd]/5 header-action-btn"
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold transition-all duration-300 hover:shadow-[0_0_12px_rgba(1,116,189,0.15)]"
                      style={{
                        background: "linear-gradient(135deg, #003353, #002740)",
                        color: "#4da8e8",
                        border: "1px solid rgba(1,116,189,0.2)",
                      }}
                    >
                      {initials}
                    </div>
                    <div className="hidden md:flex flex-col items-start">
                      <span className="text-[13px] font-semibold text-[#003353] leading-tight">
                        {displayName}
                      </span>
                      <span className="text-[10px] text-slate-400 leading-tight">
                        {roleLabel}
                      </span>
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-56 rounded-2xl shadow-xl border-slate-200/80"
                >
                  <DropdownMenuLabel className="text-sm text-[#003353]">
                    Mi cuenta
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="rounded-lg cursor-pointer text-slate-600 hover:text-[#003353] focus:bg-[#0174bd]/5">
                    <Settings className="w-4 h-4 mr-2" />
                    Configuración
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={logout}
                    className="rounded-lg cursor-pointer text-red-500 focus:text-red-600 focus:bg-red-50"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Cerrar sesión
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {/* ── Page Content ── */}
        <main className="p-6 text-slate-800">
          {children}
        </main>
      </div>
    </div>
  )
}