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
  LogOut,
  Menu,
  X,
  ChevronRight,
  HardHat,
} from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"

/* ───────────────────────────────────────────
   Navigation — kept minimal for workers
   ─────────────────────────────────────────── */
type NavItem = {
  name: string
  href: string
  icon: typeof LayoutDashboard
  label: string // short label for bottom nav
}

const navigation: NavItem[] = [
  { name: "Inicio", href: "/worker", icon: LayoutDashboard, label: "Inicio" },
  { name: "Mis Obras", href: "/worker/obras", icon: Building2, label: "Obras" },
]

/* ───────────────────────────────────────────
   Worker Layout — Mobile-first
   Bottom tab bar on mobile, sidebar on desktop
   ─────────────────────────────────────────── */
export function WorkerLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const initials =
    user?.display_name
      ?.split(/[\s._]/)
      .filter(Boolean)
      .map((n: string) => n[0]?.toUpperCase())
      .join("")
      .slice(0, 2) ||
    user?.email
      ?.split("@")[0]
      .split(/[.\s_]/)
      .filter(Boolean)
      .map((n: string) => n[0]?.toUpperCase())
      .join("") || "U"

  const displayName = user?.display_name || user?.email || "Director"

  // Check if current path is active (exact or starts with for sub-routes)
  const isActive = (href: string) => {
    if (href === "/worker") return pathname === "/worker"
    return pathname.startsWith(href)
  }

  return (
    <div className="min-h-screen bg-[#0f172a]">
      {/* ═══════════════════════════════════════
          Inline Styles
         ═══════════════════════════════════════ */}
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');

        /* Bottom nav safe area for iOS */
        .worker-bottom-nav {
          padding-bottom: max(env(safe-area-inset-bottom, 0px), 8px);
        }

        /* Nav item tap animation */
        .worker-nav-tap {
          transition: transform 0.1s ease, background-color 0.15s ease;
        }
        .worker-nav-tap:active {
          transform: scale(0.92);
        }

        /* Sidebar animations */
        .worker-sidebar-item {
          opacity: 0;
          transform: translateX(-8px);
          animation: workerNavFadeIn 0.4s ease forwards;
        }
        @keyframes workerNavFadeIn {
          to { opacity: 1; transform: translateX(0); }
        }

        /* Active indicator */
        .worker-active-dot {
          animation: workerPulse 2s ease-in-out infinite;
        }
        @keyframes workerPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(1, 116, 189, 0.4); }
          50%      { box-shadow: 0 0 0 6px rgba(1, 116, 189, 0); }
        }
      `}</style>

      {/* ═══════════════════════════════════════
          Mobile backdrop
         ═══════════════════════════════════════ */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ═══════════════════════════════════════
          SIDEBAR — Only visible on desktop (lg+)
         ═══════════════════════════════════════ */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-50 h-full w-[260px] transition-transform duration-300 ease-out lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{
          background: "linear-gradient(175deg, #1e293b 0%, #0f172a 50%, #0a1120 100%)",
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
          borderRight: "1px solid rgba(1,116,189,0.1)",
        }}
      >
        <div className="relative flex flex-col h-full z-10">
          {/* ── Logo ── */}
          <div className="flex items-center justify-between h-[80px] px-5 border-b border-white/[0.06]">
            <Link href="/worker" className="flex items-center gap-3">
              <div className="relative w-[130px] h-[40px] flex-shrink-0">
                <Image
                  src="/brand/icon-rafsa.png"
                  alt="RAFSA"
                  fill
                  className="object-contain"
                  priority
                />
              </div>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* ── Role badge ── */}
          <div className="px-5 py-3 border-b border-white/[0.04]">
            <div className="flex items-center gap-2.5">
              <HardHat className="w-4 h-4 text-amber-500" />
              <span
                className="text-[10px] font-semibold tracking-[0.2em] uppercase text-amber-500/80"
              >
                Director de Obra
              </span>
            </div>
          </div>

          {/* ── Navigation ── */}
          <nav className="flex-1 px-3 py-6 overflow-y-auto">
            <div className="space-y-1.5">
              {navigation.map((item, index) => {
                const Icon = item.icon
                const active = isActive(item.href)

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      "worker-sidebar-item group relative flex items-center gap-3 px-4 py-3.5 rounded-xl text-[14px] font-medium transition-all duration-200",
                      active
                        ? "bg-[#0174bd]/10 text-white"
                        : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
                    )}
                    style={{ animationDelay: mounted ? `${index * 80}ms` : "0ms" }}
                    onClick={() => setSidebarOpen(false)}
                  >
                    {/* Active bar */}
                    {active && (
                      <span
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-7 rounded-r-full"
                        style={{
                          background: "linear-gradient(180deg, #0174bd, #4da8e8)",
                          boxShadow: "0 0 8px rgba(1,116,189,0.5)",
                        }}
                      />
                    )}

                    <span
                      className={cn(
                        "flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-300",
                        active
                          ? "bg-[#0174bd]/15 shadow-[0_0_12px_rgba(1,116,189,0.15)]"
                          : "bg-white/[0.03] group-hover:bg-white/[0.06]"
                      )}
                    >
                      <Icon
                        className={cn(
                          "w-5 h-5 transition-all duration-300",
                          active
                            ? "text-[#4da8e8]"
                            : "text-slate-500 group-hover:text-slate-300"
                        )}
                      />
                    </span>

                    {item.name}

                    {active && (
                      <ChevronRight className="w-4 h-4 ml-auto text-[#0174bd]/50" />
                    )}
                  </Link>
                )
              })}
            </div>
          </nav>

          {/* ── User footer ── */}
          <div className="px-3 pb-4">
            <div className="mx-3 mb-3 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(1,116,189,0.15), transparent)" }} />

            <div className="flex items-center gap-3 px-4 py-3 rounded-xl">
              <div
                className="relative w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                style={{
                  background: "linear-gradient(135deg, rgba(245,158,11,0.2), rgba(245,158,11,0.05))",
                  border: "1px solid rgba(245,158,11,0.25)",
                  color: "#f59e0b",
                }}
              >
                {initials}
                <span
                  className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
                  style={{ backgroundColor: "#10b981", borderColor: "#0a1120" }}
                />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-slate-200 truncate">{displayName}</p>
                <p className="text-[11px] text-slate-500 truncate">Director de obra</p>
              </div>

              <button
                onClick={logout}
                className="p-2 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
                title="Cerrar sesión"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* ═══════════════════════════════════════
          MAIN CONTENT
         ═══════════════════════════════════════ */}
      <div className="lg:pl-[260px] pb-20 lg:pb-0" style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
        {/* ── Header (mobile) ── */}
        <header
          className="sticky top-0 z-30 h-14 lg:h-16 bg-[#1e293b]/95 border-b border-slate-700/60 backdrop-blur-xl"
          style={{ boxShadow: "0 1px 0 rgba(0,0,0,0.2)" }}
        >
          <div className="flex items-center justify-between h-full px-4 lg:px-6">
            {/* Mobile: hamburger (hidden on lg since sidebar is visible) */}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700/60"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </Button>

            {/* Page title */}
            <div className="flex-1 flex items-center justify-center lg:justify-start gap-2">
              {/* Mobile: show RAFSA logo centered */}
              <div className="lg:hidden relative w-[100px] h-[30px]">
                <Image
                  src="/brand/icon-rafsa.png"
                  alt="RAFSA"
                  fill
                  className="object-contain"
                  priority
                />
              </div>
              {/* Desktop: page title */}
              <h2 className="hidden lg:block text-[15px] font-semibold text-slate-200 tracking-tight">
                {navigation.find((n) => isActive(n.href))?.name || "RAFSA"}
              </h2>
              <span className="hidden lg:block text-[10px] font-medium text-amber-400 bg-amber-500/15 border border-amber-500/20 px-2 py-0.5 rounded-full">
                Obra
              </span>
            </div>

            {/* User menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full hover:bg-slate-700/60">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{
                      background: "linear-gradient(135deg, #92400e, #b45309)",
                      color: "#ffffff",
                    }}
                  >
                    {initials}
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-56 rounded-2xl shadow-2xl bg-slate-800 border-slate-700"
              >
                <DropdownMenuLabel className="text-sm text-slate-300">
                  <p className="font-semibold">{displayName}</p>
                  <p className="text-xs text-slate-500 font-normal mt-0.5">Director de obra</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-slate-700" />
                <DropdownMenuItem
                  onClick={logout}
                  className="rounded-lg cursor-pointer text-red-400 focus:text-red-300 focus:bg-red-500/10"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Cerrar sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* ── Page Content ── */}
        <main className="p-4 lg:p-6">
          {children}
        </main>
      </div>

      {/* ═══════════════════════════════════════
          BOTTOM TAB BAR — Mobile only
          Large touch targets, clear labels
         ═══════════════════════════════════════ */}
      <nav
        className="worker-bottom-nav fixed bottom-0 left-0 right-0 z-40 lg:hidden border-t border-slate-700/60"
        style={{
          background: "linear-gradient(to top, #0f172a 0%, #1e293b 100%)",
          boxShadow: "0 -4px 20px rgba(0,0,0,0.4)",
        }}
      >
        <div className="flex items-center justify-around px-2 pt-2">
          {navigation.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)

            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "worker-nav-tap relative flex flex-col items-center gap-1 py-2 px-6 rounded-xl min-w-[80px]",
                  active ? "text-[#4da8e8]" : "text-slate-500"
                )}
              >
                {/* Active indicator dot */}
                {active && (
                  <span
                    className="worker-active-dot absolute -top-1 w-1.5 h-1.5 rounded-full bg-[#0174bd]"
                  />
                )}

                <div
                  className={cn(
                    "flex items-center justify-center w-11 h-11 rounded-2xl transition-all duration-200",
                    active
                      ? "bg-[#0174bd]/15"
                      : "bg-transparent"
                  )}
                >
                  <Icon
                    className={cn(
                      "w-6 h-6 transition-colors duration-200",
                      active ? "text-[#4da8e8]" : "text-slate-500"
                    )}
                  />
                </div>

                <span
                  className={cn(
                    "text-[11px] font-semibold tracking-wide transition-colors duration-200",
                    active ? "text-[#4da8e8]" : "text-slate-500"
                  )}
                >
                  {item.label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
