"use client";

import PatientAuthForm from "./auth-form";
import { useTheme } from "next-themes";

export default function LoginFormClient() {
  const { theme } = useTheme();
  const isDarkMode = theme === "dark";

  return (
    <div
      className={`relative flex min-h-screen flex-1 items-center justify-center overflow-hidden ${
        isDarkMode ? "bg-black" : "bg-slate-50"
      }`}
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

      <div className="relative z-10 w-full max-w-md px-6 py-10">
        <div
          className={`rounded-2xl border p-8 shadow-2xl backdrop-blur-md ${
            isDarkMode
              ? "border-white/10 bg-white/5"
              : "border-slate-100 bg-white shadow-slate-200/50"
          }`}
        >
          <h1
            className={`mb-2 text-center text-3xl font-bold ${
              isDarkMode
                ? "bg-gradient-to-r from-purple-400 to-emerald-400 bg-clip-text text-transparent"
                : "text-slate-900"
            }`}
          >
            MediKiosk
          </h1>
          <p
            className={`mb-8 text-center text-base ${
              isDarkMode ? "text-zinc-400" : "text-slate-500"
            }`}
          >
            Your AI-powered clinical assessment
          </p>
          <PatientAuthForm isDarkMode={isDarkMode} />
        </div>
      </div>
    </div>
  );
}
