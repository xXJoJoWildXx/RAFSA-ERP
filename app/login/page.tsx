"use client"

import type React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { supabase } from "@/lib/supabaseClient"

type UserRole = "admin" | "user" | "worker"

// ─── SVG Icons ────────────────────────────────────────────────────────────────

function IconMail() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="3" width="14" height="10" rx="2" stroke="white" strokeWidth="1.2" />
      <path d="M1 5.5l7 4 7-4" stroke="white" strokeWidth="1.2" fill="none" />
    </svg>
  )
}

function IconLock() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="3" y="7" width="10" height="8" rx="1.5" stroke="white" strokeWidth="1.2" />
      <path d="M5 7V5a3 3 0 016 0v2" stroke="white" strokeWidth="1.2" fill="none" />
    </svg>
  )
}

function IconArrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M1 7h12M8 3.5l4 3.5-4 3.5"
        stroke="white"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

function IconSpinner() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      style={{ animation: "rafsa-spin 0.8s linear infinite" }}
    >
      <path
        d="M7 1v2M7 11v2M1 7h2M11 7h2M2.9 2.9l1.4 1.4M9.7 9.7l1.4 1.4M2.9 11.1l1.4-1.4M9.7 4.3l1.4-1.4"
        stroke="white"
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}

function IconEye() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <ellipse cx="8" cy="8" rx="7" ry="5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function IconEyeOff() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path
        d="M2 2l12 12M6.5 6.6A2 2 0 0010 9.5M4 4.9C2.6 6 1.5 7.5 1.5 7.5S4.3 12 8 12c1 0 2-.3 2.8-.8"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M14.5 7.5S11.7 3 8 3c-.7 0-1.4.1-2 .3"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LoginPage() {
  const [email, setEmail]               = useState("")
  const [password, setPassword]         = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError]               = useState("")
  const [isLoading, setIsLoading]       = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    try {
      const { data, error: signError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (signError) {
        setError(signError.message || "Error al iniciar sesión.")
        return
      }

      const authUser = data.user
      if (!authUser) {
        setError("No se pudo obtener el usuario autenticado.")
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from("app_users")
        .select("role")
        .eq("id", authUser.id)
        .single()

      if (profileError || !profile) {
        setError("Tu cuenta no tiene un rol asignado. Contacta al administrador.")
        return
      }

      const role = profile.role as UserRole

      if (role === "admin")       router.push("/admin")
      else if (role === "user")   router.push("/employee")
      else if (role === "worker") router.push("/obras")
      else                        router.push("/dashboard")

    } catch (err) {
      console.error(err)
      setError("Error al conectar con el servidor. Intenta de nuevo.")
    } finally {
      setIsLoading(false)
    }
  }

  const onFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = "rgba(1,116,189,0.6)"
    e.target.style.background  = "rgba(1,116,189,0.05)"
  }
  const onBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = "rgba(180,180,180,0.12)"
    e.target.style.background  = "rgba(255,255,255,0.035)"
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&family=DM+Mono:wght@400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        /* ── Autofill override ── */
        .rl-input:-webkit-autofill,
        .rl-input:-webkit-autofill:hover,
        .rl-input:-webkit-autofill:focus {
          -webkit-box-shadow: 0 0 0px 1000px #051929 inset !important;
          -webkit-text-fill-color: #ffffff !important;
          border-color: rgba(1,116,189,0.6) !important;
          transition: background-color 5000s ease-in-out 0s;
        }

        /* ── Shimmer ── */
        @keyframes rl-shimmer {
          0%   { left: -100%; }
          100% { left: 200%;  }
        }
        .rl-shimmer {
          position: absolute; top: 0; left: -100%;
          width: 55%; height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
          animation: rl-shimmer 2.5s infinite;
          pointer-events: none;
        }

        /* ── Spinner ── */
        @keyframes rafsa-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }

        /* ── Entrance ── */
        @keyframes rl-fadeup {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        .rl-root { animation: rl-fadeup 0.4s ease; }

        /* ── Grid texture ── */
        .rl-grid-bg {
          position: absolute; inset: 0;
          background-image:
            linear-gradient(rgba(1,116,189,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(1,116,189,0.06) 1px, transparent 1px);
          background-size: 36px 36px;
        }

        /* ══════════════════════════════
           LAYOUT
        ══════════════════════════════ */

        .rl-root {
          font-family: 'DM Sans', sans-serif;
          min-height: 100svh;
          background: #020e1a;
        }

        /* Desktop: two columns */
        .rl-columns {
          display: grid;
          grid-template-columns: 1fr 1fr;
          min-height: 100svh;
        }

        /* ── Left panel ── */
        .rl-left {
          position: relative;
          padding: 48px 44px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          overflow: hidden;
          background: #041527;
        }

        .rl-left-inner {
          position: relative; z-index: 2;
          display: flex; flex-direction: column;
          height: 100%; justify-content: space-between;
        }

        /* ── Right panel ── */
        .rl-right {
          background: #051929;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          padding: 52px 48px;
          border-left: 0.5px solid rgba(1,116,189,0.12);
          position: relative;
        }

        .rl-corner {
          position: absolute; top: 0; right: 0;
          width: 100px; height: 100px;
          border-bottom-left-radius: 100%;
          background: rgba(1,116,189,0.04);
          border-left:   0.5px solid rgba(1,116,189,0.1);
          border-bottom: 0.5px solid rgba(1,116,189,0.1);
        }

        .rl-form-box {
          position: relative; z-index: 2;
          width: 100%; max-width: 360px;
        }

        /* ── Input base ── */
        .rl-input {
          width: 100%;
          height: 44px;
          background: rgba(255,255,255,0.035);
          border: 0.5px solid rgba(180,180,180,0.12);
          border-radius: 8px;
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          color: #ffffff;
          padding: 0 14px 0 40px;
          outline: none;
          transition: border-color 0.15s, background 0.15s;
        }
        .rl-input::placeholder { color: rgba(180,180,180,0.22); font-size: 13px; }
        .rl-input-pw { padding-right: 42px; }

        /* ══════════════════════════════
           RESPONSIVE
        ══════════════════════════════ */

        /* Tablet (≤900px): stack panels vertically */
        @media (max-width: 900px) {
          .rl-columns {
            grid-template-columns: 1fr;
            min-height: 100svh;
          }
          .rl-left {
            padding: 32px 32px 28px;
            min-height: auto;
          }
          .rl-left-inner {
            justify-content: flex-start;
            gap: 0;
          }
          .rl-hero-block  { display: none; }
          .rl-pills-block { display: none; }
          .rl-bottom-bar  { margin-top: 20px; }
          .rl-right {
            border-left: none;
            border-top: 0.5px solid rgba(1,116,189,0.12);
            padding: 44px 32px 52px;
          }
        }

        /* Mobile (≤600px): tighter, hide bottom bar */
        @media (max-width: 600px) {
          .rl-left     { padding: 22px 20px 18px; }
          .rl-bottom-bar { display: none !important; }
          .rl-right    { padding: 36px 20px 48px; }
          .rl-corner   { display: none; }
          .rl-form-box { max-width: 100%; }
        }
      `}</style>

      <div className="rl-root">
        <div className="rl-columns">

          {/* ══════════════════════════
              LEFT — Branding
          ══════════════════════════ */}
          <div className="rl-left">
            {/* Textures */}
            <div className="rl-grid-bg" />
            <div style={{
              position: "absolute", inset: 0,
              background: `
                radial-gradient(ellipse 90% 55% at 10% 90%, rgba(1,116,189,0.18) 0%, transparent 65%),
                radial-gradient(ellipse 60% 40% at 85% 5%,  rgba(0,51,83,0.5)    0%, transparent 55%)
              `,
            }} />
            {/* Left accent stripe */}
            <div style={{
              position: "absolute", top: 0, left: 0, bottom: 0, width: "3px",
              background: "linear-gradient(to bottom, transparent 0%, #0174bd 30%, #375b8c 70%, transparent 100%)",
              opacity: 0.7,
            }} />

            <div className="rl-left-inner">
              {/* Top section */}
              <div>
                {/* Badge */}
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: "8px",
                  fontFamily: "'DM Mono', monospace", fontSize: "10px",
                  fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase",
                  color: "rgba(1,116,189,0.85)", marginBottom: "26px",
                }}>
                  <span style={{
                    width: "6px", height: "6px", borderRadius: "50%",
                    background: "#0174bd", boxShadow: "0 0 8px rgba(1,116,189,0.9)",
                    display: "inline-block", flexShrink: 0,
                  }} />
                  Sistema ERP · v2.0
                </div>

                {/* ── Logo real con next/image ── */}
                <div style={{ position: "relative", width: "400px", height: "290px", marginBottom: "-10px", marginTop: "-30px", marginLeft: "-44px" }}>
                  <Image
                    src="/brand/rafsa-logo.png"
                    alt="RAFSA Industrial Coatings"
                    fill
                    priority
                    style={{ objectFit: "contain", objectPosition: "left center" }}
                  />
                </div>

                {/* Hero — oculto en tablet/mobile vía CSS */}
                <div className="rl-hero-block">
                  <h2 style={{
                    fontSize: "20px", fontWeight: 300,
                    color: "rgba(255,255,255,0.82)", lineHeight: 1.55,
                    letterSpacing: "-0.01em", marginBottom: "12px",
                  }}>
                    Gestión de obras,{" "}
                    <strong style={{ fontWeight: 600, color: "#fff" }}>
                      empleados y documentos
                    </strong>{" "}
                    desde un solo lugar.
                  </h2>
                  <p style={{
                    fontSize: "12px", color: "rgba(255,255,255,0.32)",
                    lineHeight: 1.65, maxWidth: "300px",
                  }}>
                    Accede al ERP corporativo de RAFSA para administrar todos los
                    procesos internos con precisión y eficiencia.
                  </p>
                </div>

                {/* Pills — ocultas en tablet/mobile vía CSS */}
                <div className="rl-pills-block" style={{
                  display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "28px",
                }}>
                  {["Empleados", "Obras", "Documentos", "Contratos"].map((label) => (
                    <span key={label} style={{
                      fontFamily: "'DM Mono', monospace", fontSize: "10px",
                      fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase",
                      padding: "5px 12px", borderRadius: "100px",
                      border: "0.5px solid rgba(1,116,189,0.35)",
                      color: "rgba(1,116,189,0.85)", background: "rgba(1,116,189,0.07)",
                    }}>
                      {label}
                    </span>
                  ))}
                </div>
              </div>

              {/* Bottom bar */}
              <div className="rl-bottom-bar" style={{
                display: "flex", alignItems: "center", gap: "10px",
                paddingTop: "28px",
                borderTop: "0.5px solid rgba(255,255,255,0.07)",
                marginTop: "40px",
              }}>
                <span style={{
                  width: "6px", height: "6px", borderRadius: "50%",
                  background: "#0174bd", boxShadow: "0 0 8px rgba(1,116,189,0.9)",
                  flexShrink: 0,
                }} />
                <span style={{
                  fontFamily: "'DM Mono', monospace", fontSize: "10px",
                  color: "rgba(255,255,255,0.22)", letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}>
                  RAFSA Industrial Coatings · Sistema ERP
                </span>
              </div>
            </div>
          </div>

          {/* ══════════════════════════
              RIGHT — Form
          ══════════════════════════ */}
          <div className="rl-right">
            <div className="rl-corner" />

            <div className="rl-form-box">
              {/* Eyebrow */}
              <p style={{
                fontFamily: "'DM Mono', monospace", fontSize: "10px",
                fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase",
                color: "#0174bd", marginBottom: "10px",
              }}>
                Acceso al sistema
              </p>

              <h1 style={{
                fontSize: "26px", fontWeight: 600, color: "#ffffff",
                letterSpacing: "-0.02em", marginBottom: "4px",
              }}>
                Bienvenido
              </h1>

              <p style={{
                fontSize: "13px", color: "rgba(180,180,180,0.45)", marginBottom: "32px",
              }}>
                Ingresa tus credenciales corporativas
              </p>

              <form onSubmit={handleSubmit}>

                {/* ── Email ── */}
                <div style={{ marginBottom: "18px" }}>
                  <label htmlFor="login-email" style={{
                    display: "block", fontFamily: "'DM Mono', monospace",
                    fontSize: "10px", fontWeight: 500, letterSpacing: "0.1em",
                    textTransform: "uppercase", color: "rgba(180,180,180,0.45)",
                    marginBottom: "7px",
                  }}>
                    Correo electrónico
                  </label>
                  <div style={{ position: "relative" }}>
                    <span style={{
                      position: "absolute", left: "13px", top: "50%",
                      transform: "translateY(-50%)", opacity: 0.3,
                      pointerEvents: "none", display: "flex", alignItems: "center",
                    }}>
                      <IconMail />
                    </span>
                    <input
                      id="login-email"
                      className="rl-input"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="usuario@rafsa.com.mx"
                      autoComplete="email"
                      required
                      onFocus={onFocus}
                      onBlur={onBlur}
                    />
                  </div>
                </div>

                {/* ── Password ── */}
                <div style={{ marginBottom: "20px" }}>
                  <label htmlFor="login-password" style={{
                    display: "block", fontFamily: "'DM Mono', monospace",
                    fontSize: "10px", fontWeight: 500, letterSpacing: "0.1em",
                    textTransform: "uppercase", color: "rgba(180,180,180,0.45)",
                    marginBottom: "7px",
                  }}>
                    Contraseña
                  </label>
                  <div style={{ position: "relative" }}>
                    <span style={{
                      position: "absolute", left: "13px", top: "50%",
                      transform: "translateY(-50%)", opacity: 0.3,
                      pointerEvents: "none", display: "flex", alignItems: "center",
                    }}>
                      <IconLock />
                    </span>
                    <input
                      id="login-password"
                      className="rl-input rl-input-pw"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••"
                      autoComplete="current-password"
                      required
                      onFocus={onFocus}
                      onBlur={onBlur}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                      style={{
                        position: "absolute", right: "11px", top: "50%",
                        transform: "translateY(-50%)", background: "none",
                        border: "none", cursor: "pointer",
                        color: "rgba(180,180,180,0.3)",
                        display: "flex", alignItems: "center", padding: "4px",
                        transition: "color 0.15s",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.color = "rgba(180,180,180,0.7)"
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.color = "rgba(180,180,180,0.3)"
                      }}
                    >
                      {showPassword ? <IconEyeOff /> : <IconEye />}
                    </button>
                  </div>
                </div>

                {/* ── Error ── */}
                {error && (
                  <div style={{
                    background: "rgba(200,40,40,0.07)",
                    border: "0.5px solid rgba(200,40,40,0.22)",
                    borderRadius: "7px", padding: "10px 14px",
                    fontSize: "12px", color: "rgba(255,100,100,0.9)",
                    marginBottom: "18px", lineHeight: 1.5,
                  }}>
                    {error}
                  </div>
                )}

                {/* ── Submit ── */}
                <button
                  type="submit"
                  disabled={isLoading}
                  style={{
                    width: "100%", height: "46px",
                    background: isLoading ? "#014f84" : "#0174bd",
                    border: "none", borderRadius: "8px",
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: "14px", fontWeight: 600, color: "#ffffff",
                    cursor: isLoading ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center",
                    justifyContent: "center", gap: "8px",
                    transition: "background 0.18s, transform 0.1s",
                    marginTop: "4px", position: "relative",
                    overflow: "hidden", opacity: isLoading ? 0.7 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!isLoading)
                      (e.currentTarget as HTMLButtonElement).style.background = "#015a96"
                  }}
                  onMouseLeave={(e) => {
                    if (!isLoading)
                      (e.currentTarget as HTMLButtonElement).style.background = "#0174bd"
                  }}
                  onMouseDown={(e) => {
                    if (!isLoading)
                      (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.99)"
                  }}
                  onMouseUp={(e) => {
                    if (!isLoading)
                      (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"
                  }}
                >
                  {!isLoading && <div className="rl-shimmer" />}
                  {isLoading ? <IconSpinner /> : <IconArrow />}
                  {isLoading ? "Verificando..." : "Iniciar sesión"}
                </button>

                {/* ── Divider ── */}
                <div style={{
                  height: "0.5px", background: "rgba(255,255,255,0.06)", margin: "24px 0",
                }} />

                {/* ── Footer note ── */}
                <div style={{
                  textAlign: "center", fontSize: "11px",
                  color: "rgba(180,180,180,0.2)", lineHeight: 1.6,
                }}>
                  <span style={{
                    fontFamily: "'DM Mono', monospace", fontSize: "10px",
                    color: "rgba(1,116,189,0.5)", letterSpacing: "0.06em",
                  }}>
                    Acceso exclusivo · Personal autorizado RAFSA
                  </span>
                  <br />
                  ¿Problemas de acceso? Contacta al administrador del sistema.
                </div>
              </form>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}