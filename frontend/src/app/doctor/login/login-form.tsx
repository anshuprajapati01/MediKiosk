"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/client";

type FormErrors = {
  email?: string;
  password?: string;
  general?: string;
};

export default function DoctorLoginForm() {
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
          className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200"
          role="alert"
        >
          {errors.general}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="email"
          className="text-sm font-medium text-zinc-300"
        >
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isLoading}
          className={`h-12 rounded-xl border bg-black/40 px-4 text-base text-zinc-100 outline-none transition-colors disabled:opacity-50 placeholder-zinc-500 ${
            errors.email
              ? "border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
              : "border-white/10 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          }`}
          placeholder="you@hospital.com"
          autoComplete="email"
        />
        {errors.email && (
          <p className="text-sm text-red-400">{errors.email}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="password"
          className="text-sm font-medium text-zinc-300"
        >
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isLoading}
          className={`h-12 rounded-xl border bg-black/40 px-4 text-base text-zinc-100 outline-none transition-colors disabled:opacity-50 placeholder-zinc-500 ${
            errors.password
              ? "border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
              : "border-white/10 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          }`}
          placeholder="Enter your password"
          autoComplete="current-password"
        />
        {errors.password && (
          <p className="text-sm text-red-400">{errors.password}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="mt-2 flex h-12 w-full items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-base font-semibold text-white shadow-[0_0_20px_rgba(99,102,241,0.35)] transition-all duration-300 hover:from-indigo-400 hover:to-purple-500 hover:shadow-[0_0_25px_rgba(99,102,241,0.45)] disabled:cursor-not-allowed disabled:opacity-70 focus:ring-2 focus:ring-indigo-400 focus:outline-none"
      >
        {isLoading ? "Signing in..." : "Login"}
      </button>
    </form>
  );
}
