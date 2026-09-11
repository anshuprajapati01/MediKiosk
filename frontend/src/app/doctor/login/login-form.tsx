"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/client";

type FormErrors = {
  email?: string;
  password?: string;
  general?: string;
};

type Props = {
  isDarkMode: boolean;
};

export default function DoctorLoginForm({ isDarkMode }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);

  function validate(): FormErrors {
    const newErrors: FormErrors = {};

    if (!email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = "Please enter a valid email address";
    }

    if (!password) {
      newErrors.password = "Password is required";
    }

    return newErrors;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});

    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createSupabaseClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrors({ general: "Invalid email or password" });
        return;
      }

      router.push("/doctor/dashboard");
      router.refresh();
    } catch {
      setErrors({ general: "An unexpected error occurred. Please try again." });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {errors.general && (
        <div
          className={`rounded-lg border p-4 text-sm ${
            isDarkMode
              ? "border-red-500/40 bg-red-500/10 text-red-200"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
          role="alert"
        >
          {errors.general}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="email"
          className={`text-sm font-medium ${isDarkMode ? "text-zinc-300" : "text-slate-700"}`}
        >
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isLoading}
          className={`h-12 rounded-xl border px-4 text-base outline-none transition-colors disabled:opacity-50 placeholder-slate-400 ${
            isDarkMode
              ? "border-white/10 bg-black/40 text-zinc-100 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              : "border-slate-200 bg-white text-slate-900 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
          } ${
            errors.email
              ? isDarkMode
                ? "border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
                : "border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
              : ""
          }`}
          placeholder="you@hospital.com"
          autoComplete="email"
        />
        {errors.email && (
          <p className={`text-sm ${isDarkMode ? "text-red-400" : "text-red-600"}`}>{errors.email}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="password"
          className={`text-sm font-medium ${isDarkMode ? "text-zinc-300" : "text-slate-700"}`}
        >
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isLoading}
          className={`h-12 rounded-xl border px-4 text-base outline-none transition-colors disabled:opacity-50 placeholder-slate-400 ${
            isDarkMode
              ? "border-white/10 bg-black/40 text-zinc-100 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              : "border-slate-200 bg-white text-slate-900 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
          } ${
            errors.password
              ? isDarkMode
                ? "border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
                : "border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
              : ""
          }`}
          placeholder="Enter your password"
          autoComplete="current-password"
        />
        {errors.password && (
          <p className={`text-sm ${isDarkMode ? "text-red-400" : "text-red-600"}`}>{errors.password}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className={`mt-2 flex h-12 w-full items-center justify-center rounded-xl text-base font-semibold text-white transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-70 focus:ring-2 focus:outline-none ${
          isDarkMode
            ? "bg-gradient-to-r from-indigo-500 to-purple-600 shadow-[0_0_20px_rgba(99,102,241,0.35)] hover:from-indigo-400 hover:to-purple-500 hover:shadow-[0_0_25px_rgba(99,102,241,0.45)] focus:ring-indigo-400"
            : "bg-teal-600 hover:bg-teal-700 shadow-sm focus:ring-teal-500"
        }`}
      >
        {isLoading ? "Signing in..." : "Login"}
      </button>
    </form>
  );
}
