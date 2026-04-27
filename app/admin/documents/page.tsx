"use client"

import { AdminLayout } from "@/components/admin-layout"
import { RoleGuard } from "@/lib/role-guard"

export default function ProveedoresPage() {
  return (
    <RoleGuard allowed={["admin"]}>
      <AdminLayout>
        <div className="min-h-[70vh] flex flex-col items-center justify-center select-none">

          {/* Animated icon */}
          <div className="relative mb-8">
            <span className="absolute inset-0 rounded-full bg-blue-400/20 animate-ping" />
            <span className="absolute inset-2 rounded-full bg-blue-400/10 animate-ping [animation-delay:300ms]" />
            <div className="relative w-28 h-28 rounded-full bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 flex items-center justify-center shadow-2xl">
              <svg
                viewBox="0 0 64 64"
                className="w-14 h-14"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* Truck body */}
                <rect x="4" y="22" width="36" height="24" rx="3" fill="#334155" stroke="#64748b" strokeWidth="1.5" />
                {/* Cab */}
                <path d="M40 30 L40 46 L56 46 L56 36 L50 28 L40 28 Z" fill="#334155" stroke="#64748b" strokeWidth="1.5" />
                {/* Windshield */}
                <path d="M42 30 L42 35 L53 35 L49 29 Z" fill="#38bdf8" opacity="0.7" />
                {/* Cargo lines */}
                <line x1="16" y1="22" x2="16" y2="46" stroke="#64748b" strokeWidth="1" strokeDasharray="2 2" />
                <line x1="4" y1="34" x2="40" y2="34" stroke="#64748b" strokeWidth="1" strokeDasharray="2 2" />
                {/* Wheels */}
                <circle cx="16" cy="47" r="5" fill="#1e293b" stroke="#94a3b8" strokeWidth="1.5" />
                <circle cx="16" cy="47" r="2" fill="#64748b" />
                <circle cx="48" cy="47" r="5" fill="#1e293b" stroke="#94a3b8" strokeWidth="1.5" />
                <circle cx="48" cy="47" r="2" fill="#64748b" />
                {/* Sparkles */}
                <circle cx="8" cy="14" r="1.5" fill="#38bdf8" />
                <circle cx="58" cy="18" r="1" fill="#818cf8" />
                <circle cx="30" cy="8" r="1" fill="#34d399" />
              </svg>
            </div>
          </div>

          {/* Title */}
          <h1 className="text-3xl font-bold text-slate-900 mb-3 tracking-tight">
            Proveedores
          </h1>

          {/* Badge */}
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 border border-amber-300 px-3 py-1 text-sm font-semibold text-amber-700">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse inline-block" />
              En desarrollo
            </span>
          </div>

          {/* Description */}
          <p className="text-slate-500 text-base text-center max-w-sm leading-relaxed">
            Este modulo esta siendo construido. Pronto podras gestionar proveedores, cotizaciones y ordenes de compra desde aqui.
          </p>

          {/* Shimmer bar */}
          <div className="mt-8 w-48 h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                background: "linear-gradient(90deg, #93c5fd 0%, #2563eb 50%, #93c5fd 100%)",
                backgroundSize: "200% 100%",
                animation: "shimmer 2s ease-in-out infinite",
              }}
            />
          </div>

          <style>{`
            @keyframes shimmer {
              0%   { background-position: 200% center; }
              100% { background-position: -200% center; }
            }
          `}</style>

        </div>
      </AdminLayout>
    </RoleGuard>
  )
}
