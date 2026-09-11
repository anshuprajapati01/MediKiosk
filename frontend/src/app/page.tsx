"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import Link from "next/link";

const modules = [
  {
    title: "Patient Intake Kiosk",
    description: "AI-assisted patient onboarding and symptom analysis.",
    route: "/patient",
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    hoverIconBg: "group-hover:bg-blue-200",
    arrowColor: "text-blue-500",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
  },
  {
    title: "Triage Command Center",
    description: "Severity assessment and smart doctor routing.",
    route: "/triage",
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
    hoverIconBg: "group-hover:bg-amber-200",
    arrowColor: "text-amber-500",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: "Doctor Review Portal",
    description: "Clinical sign-off, AI summaries, and evidence verification.",
    route: "/doctor/dashboard",
    iconBg: "bg-teal-100",
    iconColor: "text-teal-600",
    hoverIconBg: "group-hover:bg-teal-200",
    arrowColor: "text-teal-500",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15l2.55-2.55L15 14.25l-3.75 3.75L7.5 15z" />
        <circle cx={12} cy={12} r={9} />
      </svg>
    ),
  },
  {
    title: "Hospital Admin Console",
    description: "System analytics, staff management, and access control.",
    route: "/admin",
    iconBg: "bg-indigo-100",
    iconColor: "text-indigo-600",
    hoverIconBg: "group-hover:bg-indigo-200",
    arrowColor: "text-indigo-500",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h12A2.25 2.25 0 0120.25 6v12a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18V6zM7.5 10.5a.75.75 0 01.75-.75h6a.75.75 0 010 1.5h-6a.75.75 0 01-.75-.75zM7.5 15a.75.75 0 01.75-.75h4.5a.75.75 0 010 1.5h-4.5a.75.75 0 01-.75-.75z" />
      </svg>
    ),
  },
];

export default function Home() {
  const { theme, setTheme } = useTheme();
  const isDarkMode = theme === "dark";

  return (
    <main
      className={`relative min-h-screen flex flex-col items-center justify-center bg-cover bg-center bg-fixed ${isDarkMode ? "bg-black" : ""}`}
      style={
        !isDarkMode
          ? {
              backgroundImage: `linear-gradient(rgba(248, 250, 252, 0.88), rgba(248, 250, 252, 0.88)), url('https://images.unsplash.com/photo-1581594693702-fbdc51b2763b?q=80&w=2070&auto=format&fit=crop')`,
            }
          : undefined
      }
    >
      {isDarkMode && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-indigo-600/20 blur-[120px]" />
          <div className="absolute top-1/3 -right-40 h-[500px] w-[500px] rounded-full bg-purple-600/20 blur-[120px]" />
          <div className="absolute -bottom-40 left-1/3 h-[500px] w-[500px] rounded-full bg-emerald-600/15 blur-[120px]" />
        </div>
      )}

      <div className="relative z-10 w-full max-w-6xl mx-auto px-4 py-12">
        <div className="absolute top-0 left-0 right-0 z-50 h-1 bg-gradient-to-r from-teal-400 via-cyan-500 to-blue-500" />

        <header className={`flex items-center justify-between border-b px-8 py-4 ${isDarkMode ? "border-white/5 bg-white/5 backdrop-blur-xl" : "border-slate-200 bg-white/80 backdrop-blur-sm"}`}>
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-md ${isDarkMode ? "bg-gradient-to-br from-indigo-500 to-purple-600 shadow-[0_0_20px_rgba(99,102,241,0.5)]" : "bg-gradient-to-br from-teal-500 to-blue-600 shadow-md"}`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15l2.55-2.55L15 14.25l-3.75 3.75L7.5 15z" />
                <circle cx={12} cy={12} r={9} />
              </svg>
            </div>
            <span className={`text-xl font-bold ${isDarkMode ? "text-white" : "text-slate-900"}`}>MediKiosk</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`hidden items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold sm:inline-flex ${isDarkMode ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-teal-200 bg-teal-50 text-teal-700"}`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15l2.55-2.55L15 14.25l-3.75 3.75L7.5 15z" />
                <circle cx={12} cy={12} r={9} />
              </svg>
              Smart India Hackathon 2026
            </span>
            <button
              onClick={() => setTheme(isDarkMode ? "light" : "dark")}
              className={`p-2 rounded-full transition-all ${isDarkMode ? "bg-white/10 text-white hover:bg-white/20" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
            >
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
        </header>

        <div className={`flex flex-1 flex-col items-center justify-center px-6 py-20`}>
          <div className="w-full max-w-6xl">
            <div className="mb-16 text-center">
              <h1 className={`text-5xl font-bold sm:text-6xl lg:text-7xl ${isDarkMode ? "text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-emerald-400" : "text-slate-900"}`}>
                MediKiosk
              </h1>
              <p className={`mt-3 text-xl font-semibold sm:text-2xl ${isDarkMode ? "text-zinc-400" : "text-slate-600"}`}>
                AI-Driven Clinical Workflow Platform
              </p>
              <p className={`mx-auto mt-4 max-w-2xl text-base leading-relaxed sm:text-lg ${isDarkMode ? "text-zinc-400" : "text-slate-500"}`}>
                Transforming hospital intake with intelligent triage, automated AI evidence extraction, and seamless clinician handoffs.
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:gap-8">
              {modules.map((mod) => (
                <Link
                  key={mod.title}
                  href={mod.route}
                  className={`group relative block overflow-hidden rounded-2xl border p-6 transition-all duration-300 hover:-translate-y-1 ${isDarkMode ? "border-white/10 bg-white/5 shadow-2xl hover:shadow-white/10" : "border-slate-100 bg-white shadow-lg shadow-slate-200/50 hover:shadow-xl"}`}
                >
                  <div className="relative z-10 flex flex-col gap-4">
                    <div className={`flex h-14 w-14 items-center justify-center rounded-xl ${mod.iconBg} ${mod.iconColor} ${mod.hoverIconBg} transition-colors duration-300`}>
                      {mod.icon}
                    </div>
                    <div>
                      <h3 className={`text-lg font-semibold ${isDarkMode ? "text-white" : "text-slate-800"}`}>{mod.title}</h3>
                      <p className={`mt-1 text-sm leading-relaxed ${isDarkMode ? "text-zinc-400" : "text-slate-500"}`}>{mod.description}</p>
                    </div>
                    <div className={`flex items-center gap-1.5 text-sm font-medium ${mod.arrowColor} transition-colors`}>
                      <span>Launch Module</span>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                      </svg>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <footer className={`border-t px-6 py-6 ${isDarkMode ? "border-white/5 bg-white/5" : "border-slate-200 bg-white"}`}>
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 sm:flex-row">
            <p className={`text-sm ${isDarkMode ? "text-zinc-500" : "text-slate-500"}`}>Built for Smart India Hackathon</p>
            <p className={`text-xs ${isDarkMode ? "text-zinc-600" : "text-slate-400"}`}>MediKiosk Clinical Workflow Platform</p>
          </div>
        </footer>
      </div>
    </main>
  );
}
