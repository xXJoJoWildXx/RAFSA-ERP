"use client"

export default function PageLoading() {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "linear-gradient(135deg, #0f172a 0%, #0d1526 50%, #0a1020 100%)" }}
    >
      {/* Subtle grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(#4da8e8 1px, transparent 1px), linear-gradient(90deg, #4da8e8 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Radial glow behind logo */}
      <div
        className="absolute w-64 h-64 rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(1,116,189,0.12) 0%, transparent 70%)",
        }}
      />

      <div className="relative flex flex-col items-center gap-8">
        {/* Logo + spinner ring */}
        <div className="relative flex items-center justify-center w-24 h-24">
          {/* Outer spinning ring */}
          <div
            className="absolute inset-0 rounded-full animate-spin"
            style={{
              background:
                "conic-gradient(from 0deg, transparent 0%, transparent 60%, #0174bd 85%, #4da8e8 100%)",
              padding: "2px",
              borderRadius: "9999px",
            }}
          >
            <div
              className="w-full h-full rounded-full"
              style={{ background: "linear-gradient(135deg, #0f172a 0%, #0d1526 100%)" }}
            />
          </div>

          {/* Inner slower ring */}
          <div
            className="absolute inset-2 rounded-full"
            style={{
              border: "1px solid rgba(1,116,189,0.25)",
              animation: "spin 3s linear infinite reverse",
            }}
          />

          {/* RAFSA "R" logo mark */}
          <div
            className="relative z-10 flex items-center justify-center w-14 h-14 rounded-2xl"
            style={{
              background: "linear-gradient(135deg, #0174bd 0%, #015fa3 100%)",
              boxShadow: "0 0 20px rgba(1,116,189,0.4), inset 0 1px 0 rgba(255,255,255,0.15)",
            }}
          >
            <img
              src="/brand/rafsa-r-icon.png"
              alt="RAFSA"
              className="w-8 h-8 object-contain"
              onError={(e) => {
                // fallback if image doesn't load
                const target = e.currentTarget
                target.style.display = "none"
                if (target.nextElementSibling) {
                  ;(target.nextElementSibling as HTMLElement).style.display = "flex"
                }
              }}
            />
            <span
              className="hidden text-white font-bold text-2xl"
              style={{ textShadow: "0 0 10px rgba(77,168,232,0.6)" }}
            >
              R
            </span>
          </div>
        </div>

        {/* Text */}
        <div className="flex flex-col items-center gap-2">
          <p
            className="text-sm font-medium tracking-widest uppercase"
            style={{
              color: "#4da8e8",
              animation: "pulse 2s ease-in-out infinite",
            }}
          >
            Cargando
          </p>

          {/* Animated dots */}
          <div className="flex items-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  backgroundColor: "#0174bd",
                  animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
