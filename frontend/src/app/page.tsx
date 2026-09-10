"use client";

import Link from "next/link";

const modules = [
  {
    title: "Patient Intake Kiosk",
    description: "AI-assisted patient onboarding and symptom analysis.",
    route: "/patient/interview",
    gradient: "from-indigo-500 to-indigo-600",
    shadow: "rgba(99,102,241,0.5)",
    border: "border-indigo-500/30",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
  },
  {
    title: "Triage Command Center",
    description: "Severity assessment and smart doctor routing.",
    route: "/triage",
    gradient: "from-amber-500 to-amber-600",
    shadow: "rgba(245,158,11,0.5)",
    border: "border-amber-500/30",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: "Doctor Review Portal",
    description: "Clinical sign-off, AI summaries, and evidence verification.",
    route: "/doctor/dashboard",
    gradient: "from-emerald-500 to-emerald-600",
    shadow: "rgba(16,185,129,0.5)",
    border: "border-emerald-500/30",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15l2.55-2.55L15 14.25l-3.75 3.75L7.5 15z" />
        <circle cx={12} cy={12} r={9} />
      </svg>
    ),
  },
  {
    title: "Hospital Admin Console",
    description: "System analytics, staff management, and access control.",
    route: "/admin",
    gradient: "from-purple-500 to-purple-600",
    shadow: "rgba(168,85,247,0.5)",
    border: "border-purple-500/30",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h12A2.25 2.25 0 0120.25 6v12a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18V6zM7.5 10.5a.75.75 0 01.75-.75h6a.75.75 0 010 1.5h-6a.75.75 0 01-.75-.75zM7.5 15a.75.75 0 01.75-.75h4.5a.75.75 0 010 1.5h-4.5a.75.75 0 01-.75-.75z" />
      </svg>
    ),
  },
];

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-black font-sans">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-indigo-600/20 blur-[120px]" />
        <div className="absolute top-1/3 -right-40 h-[500px] w-[500px] rounded-full bg-purple-600/20 blur-[120px]" />
        <div className="absolute -bottom-40 left-1/3 h-[500px] w-[500px] rounded-full bg-emerald-600/15 blur-[120px]" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="flex items-center justify-between border-b border-white/5 bg-white/5 px-8 py-4 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-[0_0_20px_rgba(99,102,241,0.5)]">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15l2.55-2.55L15 14.25l-3.75 3.75L7.5 15z" />
                <circle cx={12} cy={12} r={9} />
              </svg>
            </div>
            <span className="text-xl font-bold text-white">MediKiosk</span>
          </div>
          <span className="hidden items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300 sm:inline-flex">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15l2.55-2.55L15 14.25l-3.75 3.75L7.5 15z" />
              <circle cx={12} cy={12} r={9} />
            </svg>
            Smart India Hackathon 2025
          </span>
        </header>

        <main className="flex flex-1 flex-col items-center justify-center px-6 py-20">
          <div className="w-full max-w-6xl">
            <div className="mb-16 text-center">
              <h1 className="bg-gradient-to-r from-indigo-400 via-purple-400 to-emerald-400 bg-clip-text text-5xl font-bold text-transparent sm:text-6xl lg:text-7xl">
                MediKiosk
              </h1>
              <p className="mt-3 bg-gradient-to-r from-indigo-400 via-purple-400 to-emerald-400 bg-clip-text text-xl font-semibold text-transparent sm:text-2xl">
                AI-Driven Clinical Workflow Platform
              </p>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-zinc-400 sm:text-lg">
                Transforming hospital intake with intelligent triage, automated AI evidence extraction, and seamless clinician handoffs.
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:gap-8">
              {modules.map((mod) => (
                <Link
                  key={mod.title}
                  href={mod.route}
                  className="group relative block overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-md transition duration-300 hover:scale-[1.02] hover:border-white/20 dark:border-white/5 dark:bg-white/5"
                >
                  <div className="absolute inset-0 bg-gradient-to-br opacity-0 transition duration-300 group-hover:opacity-10" style={{ backgroundImage: `linear-gradient(to bottom right, ${mod.gradient})` }} />
                  <div className="relative z-10 flex flex-col gap-4">
                    <div className={`flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br ${mod.gradient} text-white shadow-[0_0_25px_${mod.shadow}] transition-transform duration-300 group-hover:scale-110`}>
                      {mod.icon}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white group-hover:text-indigo-300 transition-colors">{mod.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-zinc-400">{mod.description}</p>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm font-medium text-indigo-400 group-hover:text-indigo-300 transition-colors">
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
        </main>

        <footer className="border-t border-white/5 bg-white/5 px-6 py-6 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 sm:flex-row">
            <p className="text-sm text-zinc-500">Built for Smart India Hackathon</p>
            <p className="text-xs text-zinc-600">MediKiosk Clinical Workflow Platform</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
